import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import type { ContentPackageDetailResponse } from '../../contracts/api/content-api.generated.js';
import type { ContentPackageCreateRequest } from '../../contracts/flow/content-package-create-request.generated.js';
import type { ContentPackageGenerateRequest } from '../../contracts/flow/content-package-generate-request.generated.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentPackageReferenceError } from '../../src/modules/flow/content-package-service.js';
import { CreativeAiError } from '../../src/platform/ai/creative-ai-gateway.js';
import { createFakeCreativeGateway, type FakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import {
  createPackageFixture,
  fixtureBrandId,
  fixtureCampaignId,
  fixtureCatalogItem,
  fixtureDisplayRules,
  fixtureLogo,
  fixtureLogoSha,
  fixturePhoto,
  fixturePhotoSha,
  fixtureProfile,
  imageReply,
  textReply,
} from '../helpers/content-package-fixture.js';
import { fixtureImage } from '../helpers/content-images.js';

type PackageFixture = Awaited<ReturnType<typeof createPackageFixture>>;
const id = (number: number): string => `ed9e0000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const token = 'synthetic-edge-owner-token-1234567890';
const origin = 'http://content-edge.example';

function createRequest(angleIds: readonly string[], number: number): ContentPackageCreateRequest {
  const [firstAngleId, ...otherAngleIds] = angleIds;
  assert.ok(firstAngleId, 'A package fixture request needs at least one Angle');
  return {
    contractVersion: '1.0.0', campaignId: fixtureCampaignId, requestId: id(number),
    caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [fixturePhotoSha], includeLogo: true },
    rows: [{ angleId: firstAngleId }, ...otherAngleIds.map((angleId) => ({ angleId }))],
  };
}

function generateRequest(packageId: string, part: 'CAPTION' | 'POSTER', number: number): ContentPackageGenerateRequest {
  return { contractVersion: '1.0.0', packageId, requestId: id(number), part, plannedCallCount: 2 };
}

function openOwner(state: PackageFixture, gateway: FakeCreativeGateway) {
  let nextId = 1000;
  return openContentOwnerApi({
    databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true,
    token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway,
    uuid: () => id(nextId++), now: state.now,
  });
}

// Feed the real API handlers byte streams without opening sockets or calling fetch.
// Only the HTTP transport is replaced; routing, authorization, services and SQLite are real.
async function apiJson(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  method: 'GET' | 'POST', url: string, body?: unknown, ownerToken?: string,
): Promise<{ status: number; text: string }> {
  const bytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const request = Object.assign(Readable.from(bytes.length ? [bytes] : []), {
    method, url,
    headers: {
      origin, 'content-type': 'application/json', 'content-length': String(bytes.length),
      ...(ownerToken === undefined ? {} : { authorization: `Bearer ${ownerToken}` }),
    },
  });
  const chunks: Buffer[] = [];
  let status = 200;
  const response = Object.assign(new Writable({
    write(chunk: Buffer, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
  }), {
    setHeader() { return this; },
    writeHead(code: number) { status = code; return this; },
  });
  const finished = once(response, 'finish');
  handler(request as unknown as IncomingMessage, response as unknown as ServerResponse);
  await finished;
  return { status, text: Buffer.concat(chunks).toString('utf8') };
}

test('brand edits affect only new packages for the same Angle, with independent codes and versions', async () => {
  const state = await createPackageFixture({
    textAfterIdeas: [
      textReply('{"post":"Caption before brand edit"}'),
      textReply('{"post":"Caption from the pinned brand"}'),
      textReply('{"post":"Caption from the revised brand"}'),
    ],
    imageAfterIdeas: [imageReply(), imageReply()],
  });
  try {
    // No product photos: the logo occupies the single reference slot, making a logo revision observable.
    const base = createRequest([state.angleIds[0]!], 1);
    const request = { ...base, poster: { ...base.poster, referenceMediaSha256s: [] } };
    const first = (await state.packages.create(request)).packages[0]!;
    await state.packages.generate(generateRequest(first.packageId, 'CAPTION', 2), 'owner:synthetic');
    const before = await state.packages.readPackage(first.packageId);
    const originalFooter = 'Hotline: 0900 123 456\nWebsite: https://brand.example\nFanpage: https://facebook.com/synthetic';
    assert.equal(before.pin.footer, originalFooter);

    const newLogoBytes = fixtureImage('photo-b.jpg');
    const newLogo = await state.media.registerMedia({ brandId: fixtureBrandId, kind: 'LOGO', declaredType: 'image/jpeg', bytes: newLogoBytes });
    await state.brands.reviseBrand({
      contractVersion: '1.0.0', brandId: fixtureBrandId, expectedVersion: 2,
      profile: {
        brandName: 'Thương hiệu Mới', tagline: 'Vững bước mỗi ngày', hotline: '0911 222 333',
        website: 'https://revised.example', fanpage: 'https://facebook.com/revised', address: '25 Đường Mới',
      },
      displayRules: {
        ...fixtureDisplayRules,
        sales: { ...fixtureDisplayRules.sales, tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'ALWAYS' },
      },
      logoMediaSha256: newLogo.mediaSha256,
    });
    const second = (await state.packages.create({ ...request, requestId: id(3) })).packages[0]!;
    assert.notEqual(first.packageId, second.packageId);
    assert.deepEqual([first.code, second.code], ['A1·1', 'A1·2']);

    await state.packages.generate(generateRequest(first.packageId, 'CAPTION', 4), 'owner:synthetic');
    await state.packages.generate(generateRequest(first.packageId, 'POSTER', 5), 'owner:synthetic');
    await state.packages.generate(generateRequest(second.packageId, 'CAPTION', 6), 'owner:synthetic');
    await state.packages.generate(generateRequest(second.packageId, 'POSTER', 7), 'owner:synthetic');
    const oldPackage = await state.packages.readPackage(first.packageId);
    const newPackage = await state.packages.readPackage(second.packageId);
    assert.deepEqual(oldPackage.pin, before.pin);
    assert.deepEqual(oldPackage.caption[0], before.caption[0]);
    assert.deepEqual([oldPackage.pin.brand.version, newPackage.pin.brand.version], [2, 3]);
    assert.deepEqual(oldPackage.caption.map((version) => [version.version, version.caption!.footer]), [[1, originalFooter], [2, originalFooter]]);
    assert.deepEqual(newPackage.caption.map((version) => [version.version, version.caption!.footer]), [[1, 'Địa chỉ: 25 Đường Mới']]);
    assert.deepEqual(newPackage.pin.display.caption, { name: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'ALWAYS' });
    assert.deepEqual(newPackage.pin.display.poster, { name: true, logo: true, tagline: false, hotline: false, web: false, address: true });
    assert.deepEqual([oldPackage.pin.poster.logoMediaSha256, newPackage.pin.poster.logoMediaSha256], [fixtureLogoSha, newLogo.mediaSha256]);

    const textCalls = state.gateway.calls.filter((call) => call.operation === 'generateText').slice(3);
    const brands = textCalls.map((call) => (JSON.parse(call.request.userInput.replace(/^LOCKED_INPUT_JSON:\n/u, '')) as { context: { brand: unknown } }).context.brand);
    assert.deepEqual(brands, [
      { name: 'Synthetic Brand', tagline: 'Bền mỗi ngày', mention_required: ['name'] },
      { name: 'Synthetic Brand', tagline: 'Bền mỗi ngày', mention_required: ['name'] },
      { name: 'Thương hiệu Mới', mention_required: ['name'] },
    ]);
    const imageCalls = state.gateway.calls.filter((call) => call.operation === 'generateImage');
    assert.equal(imageCalls.length, 2);
    assert.deepEqual(imageCalls[0]!.request.references, [{ bytes: fixtureLogo, mediaType: 'image/png' }]);
    assert.deepEqual(imageCalls[1]!.request.references, [{ bytes: newLogoBytes, mediaType: 'image/jpeg' }]);
    assert.match(imageCalls[0]!.request.prompt, /0900 123 456/);
    assert.match(imageCalls[1]!.request.prompt, /25 Đường Mới/);
    assert.doesNotMatch(imageCalls[1]!.request.prompt, /0911 222 333|revised\.example|facebook\.com\/revised|Vững bước mỗi ngày/);
    assert.deepEqual(oldPackage.poster.map((version) => [version.version, version.poster!.captionVersion]), [[1, 2]]);
    assert.deepEqual(newPackage.poster.map((version) => [version.version, version.poster!.captionVersion]), [[1, 1]]);
  } finally { state.close(); }
});

test('row ALWAYS overrides persist only existing contacts in the footer', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"No contact footer"}'), textReply('{"post":"Only the available contact"}')] });
  try {
    // Blank optional form fields are represented by absence in the brand contract.
    await state.brands.reviseBrand({
      contractVersion: '1.0.0', brandId: fixtureBrandId, expectedVersion: 2,
      profile: { brandName: fixtureProfile.brandName, fanpage: fixtureProfile.fanpage },
      displayRules: {
        ...fixtureDisplayRules,
        sales: { ...fixtureDisplayRules.sales, hotline: 'OPTIONAL', web: 'HIDDEN', address: 'HIDDEN' },
      },
    });
    const base = createRequest(state.angleIds, 10);
    const created = await state.packages.create({
      ...base,
      rows: [
        { angleId: state.angleIds[0]! },
        { angleId: state.angleIds[1]!, display: { caption: { hotline: 'ALWAYS', web: 'ALWAYS', address: 'ALWAYS' } } },
      ],
    });
    const expectedFooters = ['', 'Fanpage: https://facebook.com/synthetic'];
    for (const [index, entry] of created.packages.entries()) {
      await state.packages.generate(generateRequest(entry.packageId, 'CAPTION', 11 + index), 'owner:synthetic');
      const detail = await state.packages.readPackage(entry.packageId);
      const caption = detail.caption[0]!.caption!;
      assert.equal(detail.pin.footer, expectedFooters[index]);
      assert.equal(caption.footer, expectedFooters[index]);
      assert.equal(caption.text, index === 0 ? 'No contact footer' : 'Only the available contact\n\nFanpage: https://facebook.com/synthetic');
      if (index === 1) {
        assert.equal(detail.pin.display.caption.hotline, 'ALWAYS');
        assert.equal(detail.pin.display.caption.web, 'ALWAYS');
        assert.equal(detail.pin.display.caption.address, 'ALWAYS');
      }
    }
    const textCalls = state.gateway.calls.filter((call) => call.operation === 'generateText').slice(3);
    assert.equal(textCalls.length, 2);
    for (const call of textCalls) {
      const input = JSON.parse(call.request.userInput.replace(/^LOCKED_INPUT_JSON:\n/u, '')) as { context: { brand: unknown } };
      assert.deepEqual(input.context.brand, { name: 'Synthetic Brand', mention_required: ['name'] });
      assert.doesNotMatch(call.request.userInput, /facebook\.com\/synthetic/);
    }
  } finally { state.close(); }
});

test('batch and row references reject a registered photo from a catalog item outside the campaign', async () => {
  const state = await createPackageFixture();
  try {
    const otherPhoto = await state.media.registerMedia({ brandId: fixtureBrandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: fixtureImage('photo-b.jpg') });
    const catalog = new ContentCatalogService({ db: state.db, artifactStore: state.artifacts, uuid: () => id(20), now: state.now });
    await catalog.createItem({
      contractVersion: '1.0.0', brandId: fixtureBrandId, itemKey: 'outside-campaign',
      item: { ...fixtureCatalogItem, name: 'Outside campaign product', photos: [{ mediaSha256: otherPhoto.mediaSha256, posterDefault: true }] },
    });
    const manifestsBefore = state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all();
    const callsBefore = state.gateway.calls.length;
    const base = createRequest([state.angleIds[0]!], 21);
    const references = [fixturePhotoSha, otherPhoto.mediaSha256];
    // Even an unsent second photo must pass campaign membership before the one-slot fallback.
    for (const input of [
      { ...base, poster: { ...base.poster, referenceMediaSha256s: references } },
      { ...base, requestId: id(22), rows: [{ angleId: state.angleIds[0]!, poster: { referenceMediaSha256s: references } }] },
    ]) {
      await assert.rejects(state.packages.create(input), ContentPackageReferenceError);
      assert.deepEqual(await state.packages.listCampaignPackages(fixtureCampaignId), []);
      assert.deepEqual(state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all(), manifestsBefore);
      assert.equal(state.gateway.calls.length, callsBefore);
    }
    const valid = await state.packages.create({ ...base, requestId: id(23) });
    assert.equal(valid.packages[0]!.code, 'A1·1');
    assert.equal(state.gateway.calls.length, callsBefore);
  } finally { state.close(); }
});

test('missing reference bytes block Poster dispatch and recovery creates no phantom version', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"Caption for a missing reference"}')], imageAfterIdeas: [imageReply()] });
  try {
    const created = await state.packages.create(createRequest([state.angleIds[0]!], 30));
    const packageId = created.packages[0]!.packageId;
    await state.packages.generate(generateRequest(packageId, 'CAPTION', 31), 'owner:synthetic');
    const request = generateRequest(packageId, 'POSTER', 32);
    const attemptsBefore = state.attempts.list({ targetId: packageId });
    const callsBefore = state.gateway.calls.length;
    fs.rmSync(state.artifacts.pathForDigest(fixturePhotoSha));
    await assert.rejects(state.packages.generate(request, 'owner:synthetic'));
    assert.deepEqual(state.attempts.list({ targetId: packageId }), attemptsBefore);
    assert.equal(state.gateway.calls.length, callsBefore);
    assert.deepEqual(state.db.prepare("SELECT version FROM flow_content_package_versions WHERE package_id = ? AND part = 'POSTER'").all(packageId), []);

    fs.writeFileSync(state.artifacts.pathForDigest(fixturePhotoSha), fixturePhoto);
    const recovered = await state.packages.generate(request, 'owner:synthetic');
    assert.equal(recovered.version, 1);
    assert.equal(recovered.deduplicated, false);
    const calls = state.gateway.calls.filter((call) => call.operation === 'generateImage');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.request.references, [{ bytes: fixturePhoto, mediaType: 'image/jpeg' }]);
    assert.equal((await state.packages.readPackage(packageId)).poster.length, 1);
  } finally { state.close(); }
});

test('Caption provider errors redact key-like text in API and storage and leave Poster unstarted', async () => {
  const state = await createPackageFixture();
  const secret = 'sk-test-content-edge-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const gateway = createFakeCreativeGateway({
    text: [{ error: new Error(`Synthetic provider rejected Authorization: Bearer ${secret}`) }, textReply('{"post":"Must require another owner action"}')],
    image: [imageReply()],
  });
  const owner = openOwner(state, gateway);
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: state.now });
  try {
    const packageId = (await state.packages.create(createRequest([state.angleIds[0]!], 40))).packages[0]!.packageId;
    const url = `/owner-api/content/packages/${packageId}/generate`;
    const posterBody = { contractVersion: '1.0.0', part: 'POSTER', requestId: id(41), plannedCallCount: 2 };
    const noCaption = await apiJson(owner.handler, 'POST', url, posterBody, token);
    assert.equal(noCaption.status, 409);
    assert.deepEqual(gateway.calls, []);

    const failed = await apiJson(owner.handler, 'POST', url, { contractVersion: '1.0.0', part: 'CAPTION', requestId: id(42), plannedCallCount: 2 }, token);
    assert.equal(failed.status, 502);
    assert.equal(JSON.parse(failed.text).error.code, 'ai_failed');
    assert.equal(JSON.parse(failed.text).error.reason, 'network_error');
    assert.equal(failed.text.includes(secret), false);
    const stillNoCaption = await apiJson(owner.handler, 'POST', url, { ...posterBody, requestId: id(43) }, token);
    assert.equal(stillNoCaption.status, 409);
    assert.deepEqual(gateway.calls.map((call) => call.operation), ['generateText']);

    const attempts = state.attempts.list({ targetId: packageId });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]!.targetType, 'content_caption');
    assert.equal(attempts[0]!.state, 'failed');
    assert.equal(attempts[0]!.errorCode, 'network_error');
    assert.equal(attempts[0]!.outputSha256, null);
    assert.notEqual(attempts[0]!.closedAt, null);
    const response = await apiJson(read.handler, 'GET', `/api/content/packages/${packageId}`);
    assert.equal(response.status, 200);
    assert.equal(response.text.includes(secret), false);
    const detail = JSON.parse(response.text) as ContentPackageDetailResponse;
    assert.deepEqual(detail.captions, []);
    assert.deepEqual(detail.posters, []);
    assert.deepEqual(detail.attempts.map((attempt) => [attempt.part, attempt.state, attempt.errorCode]), [['CAPTION', 'failed', 'network_error']]);
    assert.deepEqual(gateway.calls.map((call) => call.operation), ['generateText']);
    for (const row of state.db.prepare('SELECT * FROM flow_content_ai_attempts').all() as Record<string, unknown>[]) {
      for (const value of Object.values(row)) if (typeof value === 'string') assert.equal(value.includes(secret), false);
    }
    for (const entry of fs.readdirSync(state.artifactRoot, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) assert.equal(fs.readFileSync(path.join(entry.parentPath, entry.name)).includes(Buffer.from(secret)), false, entry.name);
    }
  } finally { owner.close(); read.close(); state.close(); }
});

test('each package write route rejects missing and wrong OWNER tokens while reads remain available', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [textReply('{"post":"Initial authorized caption"}')] });
  const gateway = createFakeCreativeGateway({ text: [textReply('{"post":"Authorized regeneration"}')] });
  const owner = openOwner(state, gateway);
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: state.now });
  try {
    const base = createRequest([state.angleIds[0]!], 50);
    const packageId = (await state.packages.create(base)).packages[0]!.packageId;
    await state.packages.generate(generateRequest(packageId, 'CAPTION', 51), 'owner:synthetic');
    const { campaignId: _campaignId, ...createBody } = { ...base, requestId: id(52) };
    const routes = [
      { url: `/owner-api/content/campaigns/${fixtureCampaignId}/packages`, body: createBody },
      { url: `/owner-api/content/campaigns/${fixtureCampaignId}/defaults`, body: { contractVersion: '1.0.0', expectedVersion: 0, defaults: { caption: base.caption, poster: base.poster } } },
      { url: `/owner-api/content/packages/${packageId}/generate`, body: { contractVersion: '1.0.0', part: 'CAPTION', requestId: id(53), plannedCallCount: 1 } },
      { url: `/owner-api/content/packages/${packageId}/versions`, body: { contractVersion: '1.0.0', part: 'CAPTION', action: 'MANUAL', expectedVersion: 2, requestId: id(54), post: 'Authorized manual caption' } },
      { url: `/owner-api/content/packages/${packageId}/state`, body: { contractVersion: '1.0.0', action: 'DELETE', expectedSequence: 0 } },
    ];
    const counts = state.db.prepare(`SELECT
      (SELECT count(*) FROM flow_content_packages) packages,
      (SELECT count(*) FROM flow_content_package_versions) versions,
      (SELECT count(*) FROM flow_content_package_states) states,
      (SELECT count(*) FROM flow_content_campaign_defaults) defaults,
      (SELECT count(*) FROM flow_content_ai_attempts) attempts,
      (SELECT count(*) FROM artifact_manifests) manifests`);
    for (const route of routes) {
      const before = counts.get();
      const callsBefore = gateway.calls.length;
      for (const suppliedToken of [undefined, 'wrong-owner-token-12345678901234567890']) {
        const response = await apiJson(owner.handler, 'POST', route.url, route.body, suppliedToken);
        assert.equal(response.status, 401, route.url);
        assert.equal(JSON.parse(response.text).error.code, 'unauthorized', route.url);
        assert.deepEqual(counts.get(), before, route.url);
        assert.equal(gateway.calls.length, callsBefore, route.url);
      }
      // The identical request succeeds with the real token, ruling out an invalid-route/body false positive.
      assert.equal((await apiJson(owner.handler, 'POST', route.url, route.body, token)).status, 201, route.url);
    }
    assert.deepEqual(gateway.calls.map((call) => call.operation), ['generateText']);
    const list = await apiJson(read.handler, 'GET', `/api/content/campaigns/${fixtureCampaignId}/packages`);
    assert.equal(list.status, 200);
    assert.equal(JSON.parse(list.text).packages.length, 2);
    const detail = await apiJson(read.handler, 'GET', `/api/content/packages/${packageId}`);
    assert.equal(detail.status, 200);
    assert.equal(JSON.parse(detail.text).packageId, packageId);
    assert.equal(JSON.parse(detail.text).captions.length, 3);
  } finally { owner.close(); read.close(); state.close(); }
});

test('blank and oversized Caption outputs fail before artifact or version storage', async () => {
  const invalidPosts = ['', ' \t\n', 'x'.repeat(4001)];
  const state = await createPackageFixture({ textAfterIdeas: invalidPosts.map((post) => textReply(JSON.stringify({ post }))) });
  try {
    const packageId = (await state.packages.create(createRequest([state.angleIds[0]!], 60))).packages[0]!.packageId;
    const manifestsBefore = state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all();
    const callsBefore = state.gateway.calls.length;
    for (const [index] of invalidPosts.entries()) {
      await assert.rejects(state.packages.generate(generateRequest(packageId, 'CAPTION', 61 + index), 'owner:synthetic'),
        (error: unknown) => error instanceof CreativeAiError && error.code === 'schema_mismatch');
      const detail = await state.packages.readPackage(packageId);
      assert.deepEqual(detail.caption, []);
      assert.deepEqual(detail.poster, []);
      assert.equal(detail.attempts.length, index + 1);
      assert.equal(state.gateway.calls.length, callsBefore + index + 1);
      assert.deepEqual(state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all(), manifestsBefore);
    }
    assert.deepEqual(state.attempts.list({ targetId: packageId }).map((attempt) => [attempt.state, attempt.errorCode, attempt.outputSha256]),
      invalidPosts.map(() => ['failed', 'schema_mismatch', null]));
  } finally { state.close(); }
});

test('Vietnamese and emoji Captions round-trip at 4000 code points and invalid manual text is rejected', async () => {
  const prefix = 'Chăm sóc sức khỏe 🦴 e\u0301\n';
  const generatedPost = prefix + '🦴'.repeat(4000 - Array.from(prefix).length);
  const manualPost = generatedPost.replace('Chăm', 'Nâng');
  const state = await createPackageFixture({ textAfterIdeas: [textReply(JSON.stringify({ post: generatedPost }))] });
  const gateway = createFakeCreativeGateway();
  const owner = openOwner(state, gateway);
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: state.now });
  try {
    const packageId = (await state.packages.create(createRequest([state.angleIds[0]!], 70))).packages[0]!.packageId;
    await state.packages.generate(generateRequest(packageId, 'CAPTION', 71), 'owner:synthetic');
    const url = `/owner-api/content/packages/${packageId}/versions`;
    const body = { contractVersion: '1.0.0', part: 'CAPTION', action: 'MANUAL', expectedVersion: 1, requestId: id(72), post: manualPost };
    const manifestsBefore = state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all();
    for (const [index, post] of ['', ' \t\n', `${manualPost}🦴`].entries()) {
      const response = await apiJson(owner.handler, 'POST', url, { ...body, requestId: id(73 + index), post }, token);
      assert.equal(response.status, 400);
      assert.equal(JSON.parse(response.text).error.code, 'bad_request');
      assert.equal((await state.packages.readPackage(packageId)).caption.length, 1);
      assert.deepEqual(state.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all(), manifestsBefore);
    }
    const saved = await apiJson(owner.handler, 'POST', url, body, token);
    assert.equal(saved.status, 201);
    assert.equal(JSON.parse(saved.text).version, 2);
    const response = await apiJson(read.handler, 'GET', `/api/content/packages/${packageId}`);
    assert.equal(response.status, 200);
    const detail = JSON.parse(response.text) as ContentPackageDetailResponse;
    assert.deepEqual(detail.captions.map((caption) => [caption.version, caption.source, caption.post]), [
      [1, 'GENERATED', generatedPost], [2, 'MANUAL', manualPost],
    ]);
    assert.equal(detail.captions[1]!.text, `${manualPost}\n\nHotline: 0900 123 456\nWebsite: https://brand.example\nFanpage: https://facebook.com/synthetic`);
    assert.deepEqual(gateway.calls, []);
  } finally { owner.close(); read.close(); state.close(); }
});
