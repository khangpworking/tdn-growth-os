import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeAiError, type CreativeTextResult } from '../../src/platform/ai/creative-ai-gateway.js';
import {
  ContentPackageConflictError,
  ContentPackageReferenceError,
  PACKAGE_BATCH_LIMIT,
  PACKAGE_TICKED_REFERENCE_LIMIT,
} from '../../src/modules/flow/content-package-service.js';
import {
  createPackageFixture,
  errorReply,
  fixtureAt,
  fixtureCampaignId,
  fixtureLogoSha,
  fixturePhoto,
  fixturePhotoSha,
  imageReply,
  textReply,
} from '../helpers/content-package-fixture.js';

const requestId = (number: number): string => `05120000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const sha = (number: number): string => number.toString(16).padStart(2, '0').repeat(32);

function createRequest(campaignId: string, angleIds: readonly string[], patch: Record<string, unknown> = {}) {
  return {
    contractVersion: '1.0.0', campaignId, requestId: requestId(1),
    caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [fixturePhotoSha], includeLogo: true },
    rows: angleIds.map((angleId) => ({ angleId })), ...patch,
  };
}

function generateRequest(packageId: string, part: 'CAPTION' | 'POSTER', number: number, patch: Record<string, unknown> = {}) {
  return { contractVersion: '1.0.0', packageId, part, plannedCallCount: 4, requestId: requestId(number), ...patch };
}

test('N Angles create N packages and both parts create exactly 2N attempts', async () => {
  const state = await createPackageFixture({
    textAfterIdeas: [textReply('{"post":"Caption one"}'), textReply('{"post":"Caption two"}')],
    imageAfterIdeas: [imageReply(), imageReply()],
  });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, state.angleIds));
    assert.equal(created.packages.length, 2);
    assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_ai_attempts').get() as { n: bigint }).n, 3n);
    for (const [index, entry] of created.packages.entries()) {
      await state.packages.generate(generateRequest(entry.packageId, 'CAPTION', 10 + index), 'owner:synthetic');
      await state.packages.generate(generateRequest(entry.packageId, 'POSTER', 20 + index), 'owner:synthetic');
    }
    assert.equal((state.db.prepare("SELECT count(*) n FROM flow_content_ai_attempts WHERE target_type IN ('content_caption','content_poster')").get() as { n: bigint }).n, 4n);
    assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_package_versions').get() as { n: bigint }).n, 4n);
    assert.deepEqual((await state.packages.listCampaignPackages(fixtureCampaignId)).map((entry) => [entry.angleId, entry.captionVersion, entry.posterVersion]), state.angleIds.map((angleId) => [angleId, 1, 1]));
  } finally { state.close(); }
});

test('a failed part affects only its package and retry links the failed attempt', async () => {
  const state = await createPackageFixture({
    textAfterIdeas: [
      textReply('{"post":"Caption one"}'),
      errorReply(new CreativeAiError('gateway_http_error', 503)),
      textReply('{"post":"Caption two after retry"}'),
    ], imageAfterIdeas: [imageReply(), imageReply()],
  });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, state.angleIds));
    const first = created.packages[0]!;
    const second = created.packages[1]!;
    await state.packages.generate(generateRequest(first.packageId, 'CAPTION', 30), 'owner:synthetic');
    await assert.rejects(state.packages.generate(generateRequest(second.packageId, 'CAPTION', 31), 'owner:synthetic'), (error: unknown) => error instanceof CreativeAiError && error.code === 'gateway_http_error');
    const failedAttempt = state.db.prepare("SELECT attempt_id attemptId FROM flow_content_ai_attempts WHERE target_id = ? AND state = 'failed'").get(second.packageId) as { attemptId: string };
    const retry = await state.packages.generate(generateRequest(second.packageId, 'CAPTION', 32, { retryOfAttemptId: failedAttempt.attemptId }), 'owner:synthetic');
    assert.equal(retry.deduplicated, false);
    assert.equal((state.db.prepare('SELECT retry_of retryOf FROM flow_content_ai_attempts WHERE attempt_id = ?').get(retry.attemptId) as { retryOf: string }).retryOf, failedAttempt.attemptId);
    assert.equal((await state.packages.readPackage(first.packageId)).caption.length, 1);
    assert.equal((await state.packages.readPackage(second.packageId)).caption.length, 1);
    await assert.rejects(state.packages.generate(generateRequest(second.packageId, 'CAPTION', 33, { retryOfAttemptId: retry.attemptId }), 'owner:synthetic'), ContentPackageReferenceError);
    await state.packages.generate(generateRequest(first.packageId, 'POSTER', 34), 'owner:synthetic');
    await state.packages.generate(generateRequest(second.packageId, 'POSTER', 35), 'owner:synthetic');
  } finally { state.close(); }
});

test('create and generated part retries are exact and never call the gateway twice', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"Retry-safe caption"}')], imageAfterIdeas: [] });
  try {
    const request = createRequest(fixtureCampaignId, [state.angleIds[0]!]);
    const created = await state.packages.create(request);
    const createRetry = await state.packages.create(request);
    assert.equal(createRetry.deduplicated, true);
    assert.deepEqual(createRetry.packages, created.packages);
    const call = generateRequest(created.packages[0]!.packageId, 'CAPTION', 40);
    const first = await state.packages.generate(call, 'owner:synthetic');
    const before = state.gateway.calls.filter((entry) => entry.operation === 'generateText').length;
    const retry = await state.packages.generate(call, 'owner:synthetic');
    assert.equal(retry.deduplicated, true);
    assert.equal(state.gateway.calls.filter((entry) => entry.operation === 'generateText').length, before);
    assert.equal((await state.packages.readPackage(created.packages[0]!.packageId)).caption.length, 1);
    assert.notEqual(first.attemptId, undefined);
    await assert.rejects(state.packages.generate({ ...call, requestId: requestId(41) }, 'owner:synthetic'), /Fake creative gateway has no scripted/);
  } finally { state.close(); }
});

test('the package pin contains every integrity input and the footer remains byte-identical', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"Brand-safe caption"}')], imageAfterIdeas: [] });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, [state.angleIds[0]!], { rows: [{ angleId: state.angleIds[0]!, caption: { style: 'FRIENDLY', length: 'LONG' }, display: { caption: { address: 'ALWAYS' } } }] }));
    const detail = await state.packages.readPackage(created.packages[0]!.packageId);
    assert.deepEqual({
      brand: detail.pin.brand, campaignVersion: detail.pin.campaignVersion, insightVersion: detail.pin.insightVersion,
      items: detail.pin.items, purposes: detail.pin.purposes, caption: detail.pin.caption, poster: detail.pin.poster,
      display: detail.pin.display, footer: detail.pin.footer,
    }, {
      brand: { brandId: '05110000-0000-4000-8000-000000000001', version: 2 }, campaignVersion: 1, insightVersion: 1,
      items: [{ itemId: '05110000-0000-4000-8000-000000000002', itemVersion: 1, tierKeys: ['standard'] }], purposes: ['SALES'],
      caption: { prompt: detail.pin.caption.prompt, model: 'gpt-5.6-sol', style: 'FRIENDLY', length: 'LONG' },
      poster: { prompt: detail.pin.poster.prompt, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [fixturePhotoSha], includeLogo: true },
      display: {
        caption: { name: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'ALWAYS' },
        poster: { name: true, logo: true, tagline: true, hotline: true, web: true, address: false },
      },
      footer: detail.pin.footer,
    });
    assert.match(detail.pin.footer, /Hotline:/);
    const captionPrompt = detail.pin.caption.prompt;
    const posterPrompt = detail.pin.poster.prompt;
    assert.equal(captionPrompt.source, 'SYSTEM');
    assert.equal(posterPrompt.source, 'SYSTEM');
    if (captionPrompt.source === 'SYSTEM') assert.deepEqual({ id: captionPrompt.id, version: captionPrompt.version, digestLength: captionPrompt.creativeTextSha256.length }, { id: 'system-caption-facebook', version: 1, digestLength: 64 });
    if (posterPrompt.source === 'SYSTEM') assert.deepEqual({ id: posterPrompt.id, version: posterPrompt.version, digestLength: posterPrompt.creativeTextSha256.length }, { id: 'system-poster-b2b-infographic', version: 1, digestLength: 64 });
    const caption = await state.packages.generate(generateRequest(created.packages[0]!.packageId, 'CAPTION', 50), 'owner:synthetic');
    const textCall = state.gateway.calls.find((entry) => entry.operation === 'generateText');
    assert.ok(textCall);
    if (textCall.operation !== 'generateText') throw new Error('Expected a text gateway call');
    const lockedInput = JSON.parse(textCall.request.userInput.replace(/^LOCKED_INPUT_JSON:\n/u, '')) as { context: { campaign: Record<string, unknown>; brand: Record<string, unknown>; writing: Record<string, unknown> }; previous_posts: string[] };
    assert.equal(lockedInput.context.campaign.name, 'Synthetic Campaign');
    assert.deepEqual(lockedInput.context.campaign.products, [{ name: 'Synthetic Product', description: 'A synthetic product for integration tests.', type: 'PHYSICAL', tiers: [{ name: 'Standard', priceText: '1.290.000đ', inclusions: ['Synthetic inclusion'] }] }]);
    assert.deepEqual(lockedInput.context.brand, { name: 'Synthetic Brand', tagline: 'Bền mỗi ngày', mention_required: ['name'] });
    assert.deepEqual(lockedInput.context.writing, { style: 'Thân thiện', length: '180–250 từ' });
    assert.deepEqual(lockedInput.previous_posts, []);
    const generatedVersion = (await state.packages.readPackage(created.packages[0]!.packageId)).caption[0]!;
    assert.equal(generatedVersion.attemptId, caption.attemptId);
    assert.equal(generatedVersion.inputBundleSha256.length, 64);
    assert.equal(generatedVersion.outputSha256!.length, 64);
    const manualInput = { contractVersion: '1.0.0' as const, packageId: created.packages[0]!.packageId, part: 'CAPTION' as const, action: 'MANUAL' as const, expectedVersion: 1, requestId: requestId(51), post: 'Manual synthetic caption' };
    const manual = await state.packages.changeVersion(manualInput);
    const manualRetry = await state.packages.changeVersion(manualInput);
    assert.equal(manualRetry.deduplicated, true);
    assert.equal(manualRetry.version, manual.version);
    const restoreInput = { contractVersion: '1.0.0', packageId: created.packages[0]!.packageId, part: 'CAPTION' as const, action: 'RESTORE' as const, expectedVersion: 2, requestId: requestId(52), restoreVersion: 1 };
    const restored = await state.packages.changeVersion(restoreInput);
    const restoredRetry = await state.packages.changeVersion(restoreInput);
    assert.equal(restoredRetry.deduplicated, true);
    assert.equal(restoredRetry.version, restored.version);
    const versions = (await state.packages.readPackage(created.packages[0]!.packageId)).caption;
    assert.deepEqual(versions.map((version) => version.source), ['GENERATED', 'MANUAL', 'RESTORE']);
    assert.equal(versions.every((version) => version.caption?.footer === detail.pin.footer), true);
    assert.equal(versions.at(-1)!.caption!.text, versions.at(-1)!.caption!.post + '\n\n' + detail.pin.footer);
    assert.equal(caption.version, 1);
    assert.equal(manual.version, 2);
    assert.equal(restored.version, 3);
    await assert.rejects(state.packages.changeVersion({ contractVersion: '1.0.0', packageId: created.packages[0]!.packageId, part: 'CAPTION', action: 'MANUAL', expectedVersion: 1, requestId: requestId(53), post: 'stale' }), ContentPackageConflictError);
  } finally { state.close(); }
});

test('caption output is strict: no version is committed for extra keys or malformed JSON', async () => {
  for (const output of ['{"post":"ok","extra":true}', 'not-json']) {
    const state = await createPackageFixture({ textAfterIdeas: [textReply(output)], imageAfterIdeas: [] });
    try {
      const created = await state.packages.create(createRequest(fixtureCampaignId, [state.angleIds[0]!], { requestId: requestId(output.length) }));
      await assert.rejects(state.packages.generate(generateRequest(created.packages[0]!.packageId, 'CAPTION', output.length + 1), 'owner:synthetic'), (error: unknown) => error instanceof CreativeAiError && error.code === 'schema_mismatch');
      assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_package_versions').get() as { n: bigint }).n, 0n);
      assert.equal((state.db.prepare("SELECT state FROM flow_content_ai_attempts WHERE target_type = 'content_caption'").get() as { state: string }).state, 'failed');
    } finally { state.close(); }
  }
});

test('delete and restore are append-only, exactly retryable and bounded by 30 days', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, [state.angleIds[0]!], { requestId: requestId(60) }));
    const input = { contractVersion: '1.0.0', packageId: created.packages[0]!.packageId, action: 'DELETE' as const, expectedSequence: 0 };
    const deleted = state.packages.changeState(input);
    const gatewayCalls = state.gateway.calls.length;
    const retry = state.packages.changeState(input);
    assert.equal(deleted.sequence, 1);
    assert.equal(retry.deduplicated, true);
    assert.equal(state.gateway.calls.length, gatewayCalls);
    state.clock.value = new Date('2027-01-31T00:00:00.000Z');
    const restored = state.packages.changeState({ contractVersion: '1.0.0', packageId: input.packageId, action: 'RESTORE', expectedSequence: 1 });
    assert.equal(restored.sequence, 2);
    const deletedAgain = state.packages.changeState({ contractVersion: '1.0.0', packageId: input.packageId, action: 'DELETE', expectedSequence: 2 });
    assert.equal(deletedAgain.sequence, 3);
    state.clock.value = new Date('2027-03-03T00:00:00.000Z');
    assert.equal(state.packages.stateOf(input.packageId).expired, true);
    assert.throws(() => state.packages.changeState({ contractVersion: '1.0.0', packageId: input.packageId, action: 'RESTORE', expectedSequence: 3 }), ContentPackageConflictError);
  } finally { state.close(); }
});

test('campaign defaults version and exact retry are independent from package generation', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  try {
    const seed = createRequest(fixtureCampaignId, [state.angleIds[0]!]);
    const request = {
      contractVersion: '1.0.0', campaignId: fixtureCampaignId, expectedVersion: 0,
      defaults: { caption: seed.caption, poster: seed.poster },
    };
    const first = await state.packages.saveDefaults(request);
    const gatewayCalls = state.gateway.calls.length;
    const retry = await state.packages.saveDefaults(request);
    assert.equal(first.version, 1);
    assert.equal(retry.deduplicated, true);
    assert.equal(state.gateway.calls.length, gatewayCalls);
    assert.deepEqual(state.packages.readDefaults(fixtureCampaignId), { version: 1, defaults: request.defaults, createdAt: fixtureAt });
    const second = await state.packages.saveDefaults({ ...request, expectedVersion: 1, defaults: { ...request.defaults, caption: { ...request.defaults.caption, style: 'FRIENDLY' } } });
    assert.equal(second.version, 2);
  } finally { state.close(); }
});

test('reference and lifecycle conflicts reject deleted, missing, purposeless and untrusted inputs', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"name":"Unused angle","concept":"Unused angle concept"}')], imageAfterIdeas: [] });
  try {
    const base = (patch: Record<string, unknown> = {}) => createRequest(fixtureCampaignId, [state.angleIds[0]!], patch);
    await state.campaigns.changeLifecycle({ contractVersion: '1.0.0', campaignId: fixtureCampaignId, action: 'DELETE', expectedSequence: 0 });
    await assert.rejects(state.packages.create(base({ requestId: requestId(70) })), ContentPackageConflictError);
  } finally { state.close(); }

  const unlocked = await createPackageFixture({ textAfterIdeas: [textReply('{"name":"Unused angle","concept":"Unused angle concept"}')], imageAfterIdeas: [] });
  try {
    const unlockedCampaign = await unlocked.campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: 'synthetic-unlocked', brandId: '05110000-0000-4000-8000-000000000001', campaign: {
      name: 'Unlocked campaign', objective: 'Synthetic', items: [{ itemId: '05110000-0000-4000-8000-000000000002', itemVersion: 1 }],
    } });
    await assert.rejects(unlocked.packages.create(createRequest(unlockedCampaign.campaignId, [unlocked.angleIds[0]!], { requestId: requestId(75) })), ContentPackageConflictError);
    await assert.rejects(unlocked.packages.create(createRequest(fixtureCampaignId, ['00000000-0000-4000-8000-000000000099'], { requestId: requestId(71) })), ContentPackageReferenceError);
    unlocked.ideas.changeState({ contractVersion: '1.0.0', ideaId: unlocked.angleIds[0]!, expectedSequence: 1, action: 'DELETE' });
    await assert.rejects(unlocked.packages.create(createRequest(fixtureCampaignId, [unlocked.angleIds[0]!], { requestId: requestId(72) })), ContentPackageConflictError);
    const bigIdeaId = (unlocked.db.prepare("SELECT idea_id ideaId FROM flow_content_ideas WHERE kind = 'BIG_IDEA'").get() as { ideaId: string }).ideaId;
    const noPurpose = await unlocked.ideas.generate({ contractVersion: '1.0.0', requestId: requestId(76), campaignId: fixtureCampaignId, kind: 'ANGLE', parentIdeaId: bigIdeaId, model: 'gpt-5.6-sol', plannedCallCount: 1, prompt: { source: 'SYSTEM', id: 'system-angle-social', version: 1 } }, 'owner:synthetic');
    await assert.rejects(unlocked.packages.create(createRequest(fixtureCampaignId, [noPurpose.ideaId], { requestId: requestId(77) })), ContentPackageReferenceError);
    const many = Array.from({ length: PACKAGE_TICKED_REFERENCE_LIMIT + 1 }, (_, index) => sha(80 + index));
    await assert.rejects(unlocked.packages.create(baseRequestFor(unlocked.angleIds[1]!, { requestId: requestId(73), poster: { ...createRequest(fixtureCampaignId, [unlocked.angleIds[1]!] ).poster, referenceMediaSha256s: many } })), /At most/);
    await assert.rejects(unlocked.packages.create(baseRequestFor(unlocked.angleIds[1]!, { requestId: requestId(74), poster: { ...createRequest(fixtureCampaignId, [unlocked.angleIds[1]!] ).poster, referenceMediaSha256s: [sha(99)] } })), ContentPackageReferenceError);
  } finally { unlocked.close(); }
});

function baseRequestFor(angleId: string, patch: Record<string, unknown> = {}) {
  return createRequest(fixtureCampaignId, [angleId], patch);
}

test('a restart sweep marks a running attempt interrupted and leaves no partial version', async () => {
  let textCalls = 0;
  let release!: (value: CreativeTextResult) => void;
  const held = new Promise<CreativeTextResult>((resolve) => { release = resolve; });
  const calls: unknown[] = [];
  const gateway = {
    configured: true,
    calls,
    generateText: async () => {
      textCalls += 1;
      if (textCalls < 4) return { text: textCalls === 1 ? '{"concept":"Synthetic Big Idea","expression":"Synthetic expression"}' : textCalls === 2 ? '{"name":"Angle One","concept":"First synthetic angle"}' : '{"name":"Angle Two","concept":"Second synthetic angle"}', latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: `held-${textCalls}` };
      if (textCalls === 4) return held;
      return { text: '{"post":"retry after interruption"}', latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: 'retry-after-interruption' };
    },
    generateImage: async () => ({ bytes: fixturePhoto, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: 'held-image' }),
    listModels: async () => [],
  } as never;
  const state = await createPackageFixture({ gateway });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, [state.angleIds[0]!]));
    const pending = state.packages.generate(generateRequest(created.packages[0]!.packageId, 'CAPTION', 80), 'owner:synthetic');
    await new Promise<void>((resolve) => setImmediate(resolve));
    const running = state.db.prepare("SELECT attempt_id attemptId, state FROM flow_content_ai_attempts WHERE target_type = 'content_caption'").get() as { attemptId: string; state: string };
    assert.equal(running.state, 'running');
    assert.equal(state.attempts.sweepInterrupted(new Date('2027-01-02T00:00:00.000Z')), 1);
    assert.equal((state.db.prepare('SELECT state FROM flow_content_ai_attempts WHERE attempt_id = ?').get(running.attemptId) as { state: string }).state, 'interrupted');
    assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_package_versions').get() as { n: bigint }).n, 0n);
    release({ text: '{"post":"late output"}', latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: 'late' });
    await assert.rejects(pending);
    const retry = await state.packages.generate(generateRequest(created.packages[0]!.packageId, 'CAPTION', 81, { retryOfAttemptId: running.attemptId }), 'owner:synthetic');
    assert.equal(retry.version, 1);
    assert.equal((state.db.prepare('SELECT retry_of retryOf FROM flow_content_ai_attempts WHERE attempt_id = ?').get(retry.attemptId) as { retryOf: string }).retryOf, running.attemptId);
    assert.equal((await state.packages.listCampaignPackages(fixtureCampaignId))[0]!.captionVersion, 1);
  } finally { state.close(); }
});

test('read and list expose verified package shapes and poster bytes are content-addressed', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"Read shape caption"}')], imageAfterIdeas: [imageReply()] });
  try {
    const created = await state.packages.create(createRequest(fixtureCampaignId, [state.angleIds[0]!], { requestId: requestId(90) }));
    await state.packages.generate(generateRequest(created.packages[0]!.packageId, 'CAPTION', 91), 'owner:synthetic');
    const poster = await state.packages.generate(generateRequest(created.packages[0]!.packageId, 'POSTER', 92), 'owner:synthetic');
    const detail = await state.packages.readPackage(created.packages[0]!.packageId);
    assert.deepEqual(Object.keys(detail).sort(), ['angleId', 'attempts', 'campaignId', 'caption', 'code', 'pin', 'packageId', 'poster', 'state']);
    assert.deepEqual(Object.keys(detail.pin).sort(), ['angleId', 'brand', 'campaignId', 'campaignVersion', 'caption', 'contractVersion', 'createdAt', 'display', 'footer', 'insightVersion', 'items', 'packageId', 'poster', 'purposes', 'requestId', 'requestSha256']);
    const image = await state.packages.readPosterImage(detail.packageId, poster.version);
    assert.equal(image.mediaType, 'image/jpeg');
    assert.deepEqual(image.bytes, (await state.artifacts.read(detail.poster[0]!.poster!.imageSha256)));
    await assert.rejects(state.packages.readPosterImage(detail.packageId, 99), /Poster not found/);
    assert.equal(state.packages.packageExists(detail.packageId), true);
    assert.equal(state.packages.packageCampaign(detail.packageId), fixtureCampaignId);
    assert.equal(fixtureLogoSha.length, 64);
    assert.equal(PACKAGE_BATCH_LIMIT, 20);
  } finally { state.close(); }
});
