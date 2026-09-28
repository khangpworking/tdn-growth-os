import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import {
  DEFAULT_DISPLAY_RULES,
  type DemoBrand,
} from '../src/content-data-source';
import { type DemoCatalogItem } from '../src/catalog-data-source';
import { createDemoCampaign, type CampaignDraft, type DemoCampaign } from '../src/campaign-data-source';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';
import {
  demoIdeaList,
  type DemoIdea,
  type DemoIdeaCampaign,
} from '../src/idea-data-source';
import { demoPromptList } from '../src/prompt-data-source';
import {
  CAPTION_LENGTHS,
  CAPTION_STYLES,
  PACKAGE_BATCH_LIMIT,
  PACKAGE_RESTORE_DAYS,
  PACKAGE_TICKED_REFERENCE_LIMIT,
  POSTER_FORMATS,
  POSTER_MAX_REFERENCES,
  DemoPackageError,
  changeDemoPackageState,
  changeDemoPackageVersion,
  captionDisplayOf,
  captionFooter,
  captionText,
  createDemoPackages,
  demoFactCheck,
  demoPackageDetail,
  demoPackageList,
  demoPosterDataUrl,
  emptyRowDraft,
  generateDemoPart,
  loadPackage,
  loadPackages,
  manualPostBlocker,
  packageCallSummary,
  packageCreateBlocker,
  packageCreateRequest,
  packageRunPlan,
  packageableAngles,
  posterDisplayOf,
  purposeKindsOf,
  resolveLevels,
  rowHasOverrides,
  saveDemoPackageDefaults,
  submitCampaignDefaults,
  submitPackageCreate,
  submitPackageGenerate,
  submitPackageState,
  submitPackageVersion,
  PackageAiError,
  type CaptionSettings,
  type DemoPackage,
  type DemoPackageContext,
  type PackageDefaults,
  type PackageRunCall,
  type PackageRowDraft,
  type PosterSettings,
} from '../src/package-data-source';
import { setupDom } from './dom';

const at = '2027-01-01T00:00:00.000Z';
const later = '2027-01-02T00:00:00.000Z';
const afterRestoreWindow = '2027-02-02T00:00:00.000Z';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const brandId = '66666666-6666-4666-8666-000000000001';
const itemId = '66666666-6666-4666-8666-0000000000a1';
const bigIdeaId = '66666666-6666-4666-8666-0000000000b1';
const angleOneId = '66666666-6666-4666-8666-0000000000a2';
const angleTwoId = '66666666-6666-4666-8666-0000000000a3';
const packageId = '66666666-6666-4666-8666-0000000000d1';
const attemptId = '66666666-6666-4666-8666-0000000000e1';
const photoSha = 'a'.repeat(64);
const logoSha = 'b'.repeat(64);
const token = 'synthetic-owner-token-051-with-at-least-32-characters';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const brand: DemoBrand = {
  brandId,
  brandKey: 'brand-synthetic',
  version: 2,
  profile: {
    brandName: 'Synthetic Brand',
    tagline: 'Reliable every day',
    hotline: '0900 000 000',
    website: 'https://synthetic.example',
    fanpage: 'facebook.com/synthetic',
    address: '1 Synthetic Street',
  },
  displayRules: DEFAULT_DISPLAY_RULES,
  logoMediaSha256: logoSha,
  createdAt: at,
  history: [{ version: 1, brandName: 'Synthetic Brand', createdAt: at }, { version: 2, brandName: 'Synthetic Brand', createdAt: later }],
};

const demoCampaign: DemoIdeaCampaign = { campaignId, name: 'Synthetic campaign', deleted: false, insightVersion: 1, insight: 'Synthetic insight.' };
const bigIdea: DemoIdea = { ideaId: bigIdeaId, campaignId, kind: 'BIG_IDEA', ordinal: 1, requestId: '66666666-6666-4666-8666-0000000000f1', concept: 'Synthetic big idea', expression: 'Synthetic expression', model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 1, developing: true, purposes: [] };
const angleOne: DemoIdea = { ideaId: angleOneId, campaignId, kind: 'ANGLE', parentIdeaId: bigIdeaId, ordinal: 1, requestId: '66666666-6666-4666-8666-0000000000f2', concept: 'First angle concept', name: 'First angle', model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 1, developing: false, purposes: ['SALES'] };
const angleTwo: DemoIdea = { ideaId: angleTwoId, campaignId, kind: 'ANGLE', parentIdeaId: bigIdeaId, ordinal: 2, requestId: '66666666-6666-4666-8666-0000000000f3', concept: 'Second angle concept', name: 'Second angle', model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 1, developing: false, purposes: ['TRUST'] };
const ideas = demoIdeaList([bigIdea, angleOne, angleTwo], [], demoCampaign, at);
const prompts = demoPromptList([]);
const context: DemoPackageContext = { campaign: { campaignId, name: demoCampaign.name, deleted: false, insightLocked: true }, brand, ideas, prompts };
const noBrandContext: DemoPackageContext = { ...context, brand: null };

const caption: CaptionSettings = { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' };
const poster: PosterSettings = { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', includeLogo: true, referenceMediaSha256s: [photoSha] };
const packageRequest = (requestId = '66666666-6666-4666-8666-0000000000c2') => packageCreateRequest({ caption, poster, rows: [emptyRowDraft(angleOneId)] }, requestId);

function packageWithCaption(): { readonly packages: DemoPackage[]; readonly entry: DemoPackage; readonly call: PackageRunCall; readonly context: DemoPackageContext } {
  const created = createDemoPackages([], context, packageRequest(), at, () => packageId);
  const entry = created.packages[0]!;
  const call = packageRunPlan([{ packageId: entry.packageId, code: entry.code }], ['CAPTION'], () => attemptId)[0]!;
  const generated = generateDemoPart(created.packages, context, call, at, attemptId);
  return { packages: generated.packages, entry: generated.packages[0]!, call, context };
}

function campaignAndItem(): { readonly campaigns: DemoCampaign[]; readonly items: DemoCatalogItem[]; readonly media: Readonly<Record<string, string>> } {
  const draft: CampaignDraft = { brandId, name: demoCampaign.name, objective: 'Synthetic objective', items: [{ itemId, itemVersion: 1, tierKeys: ['standard'] }], researchProductWorkspaceId: '' };
  const campaigns = createDemoCampaign([], brandId, draft, campaignId, at);
  const items: DemoCatalogItem[] = [{ itemId, brandId, itemKey: 'item-synthetic', version: 1, item: { itemType: 'PHYSICAL', name: 'Synthetic product', tiers: [{ tierKey: 'standard', name: 'Standard', priceText: '1.290.000', inclusions: [] }], photos: [{ mediaSha256: photoSha, mediaType: 'image/jpeg', label: 'Front', posterDefault: true }] }, createdAt: at, history: [{ version: 1, name: 'Synthetic product', createdAt: at }] }];
  return { campaigns, items, media: { [photoSha]: 'data:image/jpeg;base64,cGhvdG8=' } };
}

test('package data-source validates strict reads, package blockers, and row-only request diffing', async () => {
  assert.deepEqual(packageableAngles(ideas).map((idea) => idea.ideaId), [angleOneId, angleTwoId]);
  const deletedAngle: DemoIdea = { ...angleTwo, ideaId: '66666666-6666-4666-8666-0000000000a4', deleted: { deletedAt: at, restorableUntil: '2027-01-31T00:00:00.000Z' } };
  const noPurpose: DemoIdea = { ...angleTwo, ideaId: '66666666-6666-4666-8666-0000000000a5', purposes: [] };
  assert.deepEqual(packageableAngles(demoIdeaList([bigIdea, deletedAngle, noPurpose], [], demoCampaign, at)), []);
  assert.equal(rowHasOverrides(emptyRowDraft(angleOneId)), false);
  assert.equal(rowHasOverrides({ ...emptyRowDraft(angleOneId), style: 'FRIENDLY' }), true);
  assert.equal(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption, poster }), null);
  assert.match(packageCreateBlocker({ writesAvailable: false, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption, poster })!, /OWNER/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: true, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption, poster })!, /xóa/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: false, rows: [emptyRowDraft(angleOneId)], caption, poster })!, /Insight/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [], caption, poster })!, /ít nhất/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: Array.from({ length: PACKAGE_BATCH_LIMIT + 1 }, (_, index) => emptyRowDraft(`66666666-6666-4666-8666-${(100 + index).toString(16).padStart(12, '0')}`)), caption, poster })!, /20/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption: { ...caption, prompt: { source: 'FREESTYLE', creativeText: ' ' } }, poster })!, /prompt/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption: { ...caption, prompt: { source: 'FREESTYLE', creativeText: 'x'.repeat(12_001) } }, poster })!, /12000/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption, poster: { ...poster, referenceMediaSha256s: [photoSha, logoSha] } })!, /1/);
  assert.match(packageCreateBlocker({ writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [{ ...emptyRowDraft(angleOneId), references: [photoSha, logoSha] }], caption, poster })!, /1/);
  assert.equal(PACKAGE_TICKED_REFERENCE_LIMIT, 8);

  const changedRow: PackageRowDraft = { ...emptyRowDraft(angleOneId), style: 'FRIENDLY', length: 'LONG', references: [logoSha], caption: { name: 'HIDDEN' }, poster: { logo: false } };
  const request = packageCreateRequest({ caption, poster, rows: [changedRow, emptyRowDraft(angleTwoId)] }, 'request-diff');
  assert.deepEqual(request.rows, [
    { angleId: angleOneId, caption: { style: 'FRIENDLY', length: 'LONG' }, poster: { referenceMediaSha256s: [logoSha] }, display: { caption: { name: 'HIDDEN' }, poster: { logo: false } } },
    { angleId: angleTwoId },
  ]);
  assert.equal(request.requestId, 'request-diff');
  assert.deepEqual(packageCallSummary(3, ['CAPTION', 'POSTER']), '3 Caption + 3 Poster');
  const plan = packageRunPlan([{ packageId, code: 'A1·1' }, { packageId: angleTwoId, code: 'A2·1' }], ['CAPTION', 'POSTER'], (() => { let index = 0; return () => `66666666-6666-4666-8666-${(++index).toString(16).padStart(12, '0')}`; })());
  assert.deepEqual(plan.map((call) => [call.packageId, call.part, call.request.plannedCallCount]), [[packageId, 'CAPTION', 4], [packageId, 'POSTER', 4], [angleTwoId, 'CAPTION', 4], [angleTwoId, 'POSTER', 4]]);
  assert.deepEqual(plan[0]!.request.requestId, '66666666-6666-4666-8666-000000000001');
  assert.equal(packageRunPlan([{ packageId, code: 'A1·1' }], ['CAPTION'], () => 'request-retry', attemptId)[0]!.request.retryOfAttemptId, attemptId);

  await assert.rejects(loadPackages(campaignId, async () => json(200, { contractVersion: '1.0.0', campaignId, campaignName: demoCampaign.name, campaignDeleted: false, insightLocked: true, packages: [], extra: true })), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  const built = packageWithCaption();
  const list = demoPackageList(built.packages, [], built.context, at);
  const detail = demoPackageDetail(built.packages, built.entry.packageId, built.context, at);
  assert.ok(detail);
  assert.deepEqual(await loadPackages(campaignId, async () => json(200, list)), list);
  assert.deepEqual(await loadPackage(built.entry.packageId, async () => json(200, detail)), detail);
  await assert.rejects(loadPackage(built.entry.packageId, async () => json(200, { ...detail, extra: true })), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
});

test('Q6 package loaders accept hiddenByParent only as true on deleted list entries and details', async () => {
  const built = packageWithCaption();
  const list = demoPackageList(built.packages, [], built.context, at);
  const detail = demoPackageDetail(built.packages, built.entry.packageId, built.context, at);
  assert.ok(detail);
  const restorableUntil = '2027-01-31T00:00:00.000Z';
  const hiddenEntry = { ...list.packages[0]!, deleted: true, restorableUntil, hiddenByParent: true as const };
  const hiddenList = { ...list, packages: [hiddenEntry] };
  const hiddenDetail = { ...detail, deleted: true, restorableUntil, hiddenByParent: true as const };
  assert.deepEqual(await loadPackages(campaignId, async () => json(200, hiddenList)), hiddenList);
  assert.deepEqual(await loadPackage(built.entry.packageId, async () => json(200, hiddenDetail)), hiddenDetail);

  const { restorableUntil: _entryDeadline, ...entryWithoutDeadline } = hiddenEntry;
  const invalidLists: unknown[] = [
    { ...list, packages: [{ ...entryWithoutDeadline, deleted: false, hiddenByParent: true }] },
    { ...list, packages: [{ ...hiddenEntry, hiddenByParent: false }] },
  ];
  const { restorableUntil: _detailDeadline, ...detailWithoutDeadline } = hiddenDetail;
  const invalidDetails: unknown[] = [
    { ...detailWithoutDeadline, deleted: false, hiddenByParent: true },
    { ...hiddenDetail, hiddenByParent: false },
  ];
  for (const invalidList of invalidLists) {
    await assert.rejects(loadPackages(campaignId, async () => json(200, invalidList)), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  }
  for (const invalidDetail of invalidDetails) {
    await assert.rejects(loadPackage(built.entry.packageId, async () => json(200, invalidDetail)), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  }
});

test('display helpers and manual limits preserve the package display contract', () => {
  assert.deepEqual(purposeKindsOf(['SALES', 'tag:66666666-6666-4666-8666-0000000000f4'], [{ tagId: '66666666-6666-4666-8666-0000000000f4', label: 'Trust tag', displayLike: 'TRUST', createdAt: at }]), ['SALES', 'TRUST']);
  const levels = resolveLevels(DEFAULT_DISPLAY_RULES, ['SALES', 'TRUST']);
  assert.equal(levels.hotline, 'ALWAYS');
  assert.equal(levels.tagline, 'ALWAYS');
  assert.equal(levels.address, 'OPTIONAL');
  const captionDisplay = captionDisplayOf(levels, { address: 'ALWAYS' });
  const posterDisplay = posterDisplayOf(levels, true, { address: false });
  assert.equal(captionDisplay.address, 'ALWAYS');
  assert.equal(posterDisplay.logo, true);
  assert.equal(posterDisplay.address, false);
  const footer = captionFooter(brand.profile, captionDisplay);
  assert.equal(footer, 'Hotline: 0900 000 000\nWebsite: https://synthetic.example\nFanpage: facebook.com/synthetic\nĐịa chỉ: 1 Synthetic Street');
  assert.equal(captionText('Synthetic post', footer), `Synthetic post\n\n${footer}`);
  assert.equal(manualPostBlocker(''), 'Nội dung Caption không được để trống.');
  assert.match(manualPostBlocker('x'.repeat(4001))!, /4000/);
  assert.equal(manualPostBlocker('Synthetic manual caption'), null);
  assert.equal(POSTER_FORMATS.length, 4);
  assert.equal(CAPTION_STYLES.length, 2);
  assert.equal(CAPTION_LENGTHS.length, 3);
});

test('OWNER package submissions map unavailable AI and reject every non-exact receipt', async () => {
  const created = createDemoPackages([], context, packageRequest('create-request'), at, () => packageId).receipt;
  const createRequestBody = packageRequest('create-request');
  const validCreate = { ...created, packages: [{ packageId, angleId: angleOneId, code: 'A1·1', createdAt: at }] };
  assert.deepEqual(await submitPackageCreate({ campaignId, request: createRequestBody, token }, async () => json(201, validCreate)), validCreate);
  await assert.rejects(submitPackageCreate({ campaignId, request: createRequestBody, token }, async () => json(201, { ...validCreate, extra: true })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');

  const call: PackageRunCall = packageRunPlan([{ packageId, code: 'A1·1' }], ['CAPTION'], () => 'generate-request')[0]!;
  const validGenerate = { contractVersion: '1.0.0', packageId, part: 'CAPTION', version: 1, attemptId, createdAt: at, exactRetry: false };
  assert.deepEqual(await submitPackageGenerate({ call, token }, async () => json(201, validGenerate)), validGenerate);
  await assert.rejects(submitPackageGenerate({ call, token }, async () => json(201, { ...validGenerate, extra: true })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
  await assert.rejects(submitPackageGenerate({ call, token }, async () => json(503, { error: { reason: 'ai_not_configured', message: 'synthetic unavailable' } })), (error: unknown) => error instanceof PackageAiError && error.unavailable && error.reason === 'ai_not_configured');

  const validVersion = { contractVersion: '1.0.0', packageId, part: 'CAPTION', source: 'MANUAL', version: 1, createdAt: at, exactRetry: false };
  assert.deepEqual(await submitPackageVersion({ packageId, requestId: 'version-request', part: 'CAPTION', expectedVersion: 0, action: 'MANUAL', post: 'Synthetic', token }, async () => json(201, validVersion)), validVersion);
  await assert.rejects(submitPackageVersion({ packageId, requestId: 'version-request', part: 'CAPTION', expectedVersion: 0, action: 'MANUAL', post: 'Synthetic', token }, async () => json(201, { ...validVersion, extra: true })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
  const validState = { contractVersion: '1.0.0', packageId, action: 'DELETE', sequence: 1, createdAt: at, restorableUntil: '2027-01-31T00:00:00.000Z', exactRetry: false };
  assert.deepEqual(await submitPackageState({ packageId, expectedSequence: 0, action: 'DELETE', token }, async () => json(201, validState)), validState);
  const defaults: PackageDefaults = { caption, poster };
  const validDefaults = { contractVersion: '1.0.0', campaignId, version: 1, createdAt: at, exactRetry: false };
  assert.deepEqual(await submitCampaignDefaults({ campaignId, expectedVersion: 0, defaults, token }, async () => json(201, validDefaults)), validDefaults);
  await assert.rejects(submitCampaignDefaults({ campaignId, expectedVersion: 0, defaults, token }, async () => json(201, { ...validDefaults, extra: true })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('all demo package functions are deterministic, append-only, and enforce the restore window', () => {
  const initial = createDemoPackages([], context, packageRequest('demo-create'), at, () => packageId);
  const exactCreate = createDemoPackages(initial.packages, context, packageRequest('demo-create'), later, () => '66666666-6666-4666-8666-0000000000d2');
  assert.equal(exactCreate.receipt.exactRetry, true);
  assert.deepEqual(exactCreate.packages, initial.packages);
  const entry = initial.packages[0]!;
  const captionCall = packageRunPlan([{ packageId: entry.packageId, code: entry.code }], ['CAPTION'], () => 'demo-caption')[0]!;
  const generated = generateDemoPart(initial.packages, context, captionCall, at, attemptId);
  const exactCaption = generateDemoPart(generated.packages, context, captionCall, later, '66666666-6666-4666-8666-0000000000e2');
  assert.equal(exactCaption.receipt.exactRetry, true);
  assert.deepEqual(exactCaption.packages, generated.packages);
  const generatedEntry = generated.packages[0]!;
  assert.equal(generatedEntry.captions[0]!.footer, generatedEntry.footer);
  assert.ok(demoFactCheck(generatedEntry.captions[0]!.post, brand.profile, generatedEntry.settings.captionDisplay).some((row) => row.element === 'name' && row.state === 'MATCH'));
  const manualInput = { packageId, requestId: 'demo-manual', part: 'CAPTION' as const, expectedVersion: 1, action: 'MANUAL' as const, post: 'Synthetic manual post' };
  const manualPackages = changeDemoPackageVersion(generated.packages, context, manualInput, later);
  assert.equal(manualPackages[0]!.captions.at(-1)!.source, 'MANUAL');
  assert.deepEqual(changeDemoPackageVersion(manualPackages, context, manualInput, afterRestoreWindow), manualPackages);
  const restorePackages = changeDemoPackageVersion(manualPackages, context, { packageId, requestId: 'demo-restore', part: 'CAPTION' as const, expectedVersion: 2, action: 'RESTORE' as const, restoreVersion: 1 }, afterRestoreWindow);
  assert.equal(restorePackages[0]!.captions.at(-1)!.source, 'RESTORE');
  const posterCall = packageRunPlan([{ packageId, code: entry.code }], ['POSTER'], () => 'demo-poster')[0]!;
  const withPoster = generateDemoPart(restorePackages, context, posterCall, afterRestoreWindow, '66666666-6666-4666-8666-0000000000e3');
  assert.equal(withPoster.packages[0]!.posters.length, 1);
  const posterData = demoPosterDataUrl(withPoster.packages[0]!, withPoster.packages[0]!.posters[0]!, brand.profile.brandName);
  assert.equal(posterData, demoPosterDataUrl(withPoster.packages[0]!, withPoster.packages[0]!.posters[0]!, brand.profile.brandName));
  assert.match(posterData, /^data:image\/svg\+xml/);
  const defaults: PackageDefaults = { caption, poster };
  const saved = saveDemoPackageDefaults([], campaignId, 0, defaults, at);
  assert.equal(saved[0]!.version, 1);
  assert.equal(saveDemoPackageDefaults(saved, campaignId, 1, defaults, later)[0]!.version, 2);
  assert.throws(() => saveDemoPackageDefaults(saved, campaignId, 0, defaults, later), DemoPackageError);
  const deleted = changeDemoPackageState(withPoster.packages, { packageId, expectedSequence: 0, action: 'DELETE' }, at);
  assert.equal(deleted[0]!.deleted?.restorableUntil, '2027-01-31T00:00:00.000Z');
  const restored = changeDemoPackageState(deleted, { packageId, expectedSequence: 1, action: 'RESTORE' }, later);
  assert.equal(restored[0]!.deleted, undefined);
  const expired = changeDemoPackageState(withPoster.packages, { packageId, expectedSequence: 0, action: 'DELETE' }, at);
  assert.equal(demoPackageList(expired, [], context, afterRestoreWindow).packages.length, 0);
  assert.equal(demoPackageDetail(expired, packageId, context, afterRestoreWindow), null);
  assert.throws(() => changeDemoPackageState(expired, { packageId, expectedSequence: 1, action: 'RESTORE' }, afterRestoreWindow), DemoPackageError);
  assert.throws(() => generateDemoPart([], context, captionCall, at, attemptId), DemoPackageError);
  assert.equal(PACKAGE_RESTORE_DAYS, 30);
});

test('PackageNewPage shows the inspector, per-angle editor, batch action, reference photos, and blocker', async () => {
  const { default: PackageNewPage, demoReferencePhotos } = await tsImport('../src/PackageNewPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PackageNewPage');
  const media = { [photoSha]: 'data:image/jpeg;base64,cGhvdG8=' };
  const { campaigns, items } = campaignAndItem();
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.container);
  await act(async () => {
    root.render(createElement(PackageNewPage, {
      mode: 'demo', campaignId, angleCodes: ['A1'], ownerToken: null, writesAvailable: true,
      demoContext: noBrandContext, demoPackages: [], setDemoPackages: () => undefined, demoDefaults: [], setDemoDefaults: () => undefined,
       demoReferences: demoReferencePhotos(campaigns, items, media, campaignId), notify: () => undefined,
    }));
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  assert.ok(dom.container.textContent?.includes('Thiết lập cho cả lô'));
  assert.ok([...dom.container.querySelectorAll('summary')].some((node) => node.textContent?.includes('Sửa riêng')));
  assert.ok(dom.container.textContent?.includes('Áp dụng cho tất cả'));
  const create = [...dom.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Tạo 1 gói')) as HTMLButtonElement | undefined;
  assert.ok(create);
  assert.equal(create.disabled, true);
  assert.ok(dom.container.querySelector('.package-form .decision-note')?.textContent?.includes('thương hiệu'));
  assert.ok(dom.container.textContent?.includes('Ảnh tham chiếu'));
  assert.equal(campaigns.length, 1);
  assert.equal(items.length, 1);
  await act(async () => { root.unmount(); });
  dom.cleanup();
});

test('R5: unmounting PackageNewPage during a batch run makes no further create/generate calls', async () => {
  const { default: PackageNewPage } = await tsImport('../src/PackageNewPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PackageNewPage');
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.container);
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  let releaseGenerate: (() => void) | null = null;
  let unmounted = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      if (url.endsWith(`/api/content/campaigns/${campaignId}/ideas`)) return json(200, ideas);
      if (url.endsWith(`/api/content/campaigns/${campaignId}/packages`)) return json(200, demoPackageList([], [], context, at));
      if (url.endsWith('/api/content/prompts')) return json(200, prompts);
      return json(500, { error: { code: 'integrity_error', message: 'Synthetic references unavailable' } });
    }
    if (url.endsWith(`/owner-api/content/campaigns/${campaignId}/packages`)) {
      writes.push(url);
      const body = JSON.parse(String(init?.body)) as { requestId: string };
      return json(201, { contractVersion: '1.0.0', campaignId, requestId: body.requestId, exactRetry: false, packages: [{ packageId, angleId: angleOneId, code: `A1\u00b71`, createdAt: at }] });
    }
    if (url.endsWith(`/owner-api/content/packages/${packageId}/generate`)) {
      writes.push(url);
      return new Promise<Response>((resolve) => {
        releaseGenerate = () => resolve(json(201, { contractVersion: '1.0.0', packageId, part: 'CAPTION', version: 1, attemptId, createdAt: at, exactRetry: false }));
      });
    }
    throw new Error(`Unexpected synthetic fetch: ${method} ${url}`);
  };
  try {
    await act(async () => {
      root.render(createElement(PackageNewPage, {
        mode: 'real', campaignId, angleCodes: ['A1'], ownerToken: token, writesAvailable: true,
        demoContext: null, demoPackages: [], setDemoPackages: () => undefined, demoDefaults: [], setDemoDefaults: () => undefined,
        demoReferences: null, notify: () => undefined,
      }));
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });
    const create = [...dom.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Tạo 1 gói')) as HTMLButtonElement | undefined;
    assert.ok(create);
    await act(async () => {
      create.click();
      for (let index = 0; index < 20 && releaseGenerate === null; index += 1) await Promise.resolve();
    });
    assert.ok(releaseGenerate, 'the first generate call is in flight');
    assert.equal(writes.filter((url) => url.includes('/owner-api/content/packages/') && url.endsWith('/generate')).length, 1);

    await act(async () => { root.unmount(); });
    unmounted = true;
    releaseGenerate!();
    releaseGenerate = null;
    await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
    assert.equal(writes.filter((url) => url.includes('/owner-api/content/packages/') && url.endsWith('/generate')).length, 1);
    assert.equal(writes.filter((url) => url.endsWith(`/owner-api/content/campaigns/${campaignId}/packages`)).length, 1);
  } finally {
    if (releaseGenerate) releaseGenerate();
    globalThis.fetch = originalFetch;
    if (!unmounted) await act(async () => { root.unmount(); });
    dom.cleanup();
  }
});

test('PackagePage demo renders caption/footer/fact history and failed-attempt retry, then opens delete confirmation', async () => {
  const { default: PackagePage } = await tsImport('../src/PackagePage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PackagePage');
  const generated = packageWithCaption();
  const manual = changeDemoPackageVersion(generated.packages, context, { packageId, requestId: 'page-manual', part: 'CAPTION', expectedVersion: 1, action: 'MANUAL', post: 'Visible synthetic caption' }, later);
  const posterCall = packageRunPlan([{ packageId, code: generated.entry.code }], ['POSTER'], () => 'page-poster')[0]!;
  const withPoster = generateDemoPart(manual, context, posterCall, later, '66666666-6666-4666-8666-0000000000e4').packages;
  const pagePackages = withPoster.map((entry) => ({ ...entry, attempts: [...entry.attempts, { attemptId: '66666666-6666-4666-8666-0000000000e5', part: 'POSTER' as const, state: 'failed' as const, errorCode: 'gateway_http_error', retryOf: null, model: 'gpt-image-2', createdAt: later, closedAt: later }] }));
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.container);
  await act(async () => {
    root.render(createElement(PackagePage, { mode: 'demo', campaignId, code: generated.entry.code, ownerToken: null, writesAvailable: true, demoContext: context, demoPackages: pagePackages, setDemoPackages: () => undefined, demoMedia: { [photoSha]: 'data:image/jpeg;base64,cGhvdG8=', [logoSha]: 'data:image/png;base64,bG9nbw==' }, notify: () => undefined }));
    await Promise.resolve(); await Promise.resolve();
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  assert.ok(dom.container.textContent?.includes('Visible synthetic caption'));
  assert.ok(dom.container.textContent?.includes('Hotline: 0900 000 000'));
  assert.ok(dom.container.textContent?.includes('Kiểm tra thông tin thương hiệu'));
  assert.ok(dom.container.querySelector('[aria-label="Ảnh tham chiếu đã dùng"]'));
  assert.ok([...dom.container.querySelectorAll('button')].some((button) => button.textContent?.includes('Khôi phục')));
  assert.ok([...dom.container.querySelectorAll('button')].some((button) => button.textContent?.includes('Thử lại lần lỗi')));
  const deleteButton = [...dom.container.querySelectorAll('button')].find((button) => button.textContent === 'Xóa gói') as HTMLButtonElement | undefined;
  assert.ok(deleteButton);
  await act(async () => { deleteButton.click(); await Promise.resolve(); });
  assert.ok(dom.container.querySelector('[role="dialog"]'));
  assert.ok(dom.container.textContent?.includes('Có thể khôi phục trong 30 ngày.'));
  await act(async () => { root.unmount(); });
  dom.cleanup();
});

test('a package generation completion cannot settle a different mounted package session', { concurrency: false }, async () => {
  const { default: PackagePage } = await tsImport('../src/PackagePage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PackagePage');
  const secondPackageId = '66666666-6666-4666-8666-0000000000d2';
  const firstCreated = createDemoPackages([], context, packageRequest('page-first'), at, () => packageId);
  const secondCreated = createDemoPackages(firstCreated.packages, context, packageCreateRequest({ caption, poster, rows: [emptyRowDraft(angleTwoId)] }, 'page-second'), at, () => secondPackageId);
  const firstCall = packageRunPlan([{ packageId, code: 'A1·1' }], ['CAPTION'], () => attemptId)[0]!;
  const firstGenerated = generateDemoPart(firstCreated.packages, context, firstCall, at, attemptId).packages;
  const secondCall = packageRunPlan([{ packageId: secondPackageId, code: 'A2·1' }], ['CAPTION'], () => '66666666-6666-4666-8666-0000000000e2')[0]!;
  const secondGenerated = generateDemoPart(secondCreated.packages, context, secondCall, at, '66666666-6666-4666-8666-0000000000e2').packages;
  const list = demoPackageList(secondGenerated, [], context, at);
  const firstDetail = demoPackageDetail(firstGenerated, packageId, context, at);
  const secondDetail = demoPackageDetail(secondGenerated, secondPackageId, context, at);
  assert.ok(firstDetail && secondDetail);
  const originalFetch = globalThis.fetch;
  const writes: string[] = [];
  const notices: string[] = [];
  let release!: (value: Response) => void;
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (String(init?.method ?? 'GET').toUpperCase() === 'POST') {
        writes.push(url);
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      if (url.endsWith(`/api/content/campaigns/${campaignId}/packages`)) return json(200, list);
      if (url.endsWith(`/api/content/packages/${packageId}`)) return json(200, firstDetail);
      if (url.endsWith(`/api/content/packages/${secondPackageId}`)) return json(200, secondDetail);
      throw new Error(`Unexpected synthetic fetch: ${url}`);
    };
    const dom = setupDom();
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.container);
    const props = (code: string) => ({ mode: 'real' as const, campaignId, code, ownerToken: token, writesAvailable: true, demoContext: null, demoPackages: [], setDemoPackages: () => undefined, demoMedia: {}, notify: (message: string) => notices.push(message) });
    await act(async () => { root.render(createElement(PackagePage, props('A1·1'))); for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
    const generateButton = [...dom.container.querySelectorAll('button')].find((button) => button.textContent?.includes('Tạo lại')) as HTMLButtonElement | undefined;
    assert.ok(generateButton);
    await act(async () => { generateButton.click(); for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
    assert.equal(writes.length, 1);
    await act(async () => { root.render(createElement(PackagePage, props('A2·1'))); for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
    assert.ok(dom.container.textContent?.includes('A2·1'));
    release(json(201, { contractVersion: '1.0.0', packageId, part: 'CAPTION', version: 2, attemptId, createdAt: later, exactRetry: false }));
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    assert.deepEqual(notices, []);
    await act(async () => { root.unmount(); });
    dom.cleanup();
  } finally {
    if (release) release(json(201, { contractVersion: '1.0.0', packageId, part: 'CAPTION', version: 2, attemptId, createdAt: later, exactRetry: false }));
    globalThis.fetch = originalFetch;
  }
});

test('Q6 PackagePage shows the ancestor-hidden banner without package restore, while own deletion keeps restore', async () => {
  const { default: PackagePage } = await tsImport('../src/PackagePage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PackagePage');
  const built = packageWithCaption();
  const list = demoPackageList(built.packages, [], built.context, at);
  const detail = demoPackageDetail(built.packages, built.entry.packageId, built.context, at);
  assert.ok(detail);
  const restorableUntil = '2027-01-31T00:00:00.000Z';
  const hiddenList = { ...list, packages: [{ ...list.packages[0]!, deleted: true, restorableUntil, hiddenByParent: true as const }] };
  const hiddenDetail = { ...detail, deleted: true, restorableUntil, hiddenByParent: true as const };
  const originalFetch = globalThis.fetch;
  const hiddenDom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const hiddenRoot = createRoot(hiddenDom.container);
  let hiddenUnmounted = false;
  globalThis.fetch = async (input) => String(input).includes('/api/content/campaigns/') ? json(200, hiddenList) : json(200, hiddenDetail);
  try {
    await act(async () => {
      hiddenRoot.render(createElement(PackagePage, {
        mode: 'real', campaignId, code: built.entry.code, ownerToken: token, writesAvailable: true,
        demoContext: null, demoPackages: [], setDemoPackages: () => undefined, demoMedia: {}, notify: () => undefined,
      }));
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });
    assert.ok(hiddenDom.container.textContent?.includes('Gói bị ẩn vì góc nội dung hoặc Big Idea đã bị xóa'));
    assert.equal([...hiddenDom.container.querySelectorAll('button')].some((button) => button.textContent?.includes('Khôi phục gói')), false);

    await act(async () => { hiddenRoot.unmount(); });
    hiddenUnmounted = true;
    const deletedPackages = changeDemoPackageState(built.packages, { packageId: built.entry.packageId, expectedSequence: 0, action: 'DELETE' }, at);
    const plainDom = setupDom();
    const plainRoot = createRoot(plainDom.container);
    try {
      await act(async () => {
        plainRoot.render(createElement(PackagePage, {
          mode: 'demo', campaignId, code: built.entry.code, ownerToken: null, writesAvailable: true,
          demoContext: context, demoPackages: deletedPackages, setDemoPackages: () => undefined, demoMedia: {}, notify: () => undefined,
        }));
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
      });
      assert.ok([...plainDom.container.querySelectorAll('button')].some((button) => button.textContent?.includes('Khôi phục gói')));
    } finally {
      await act(async () => { plainRoot.unmount(); });
      plainDom.cleanup();
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (!hiddenUnmounted) await act(async () => { hiddenRoot.unmount(); });
    hiddenDom.cleanup();
  }
});
