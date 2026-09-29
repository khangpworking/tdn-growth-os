import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { createFakeCreativeGateway, type FakeCreativeGateway, type FakeCreativeReply } from '../../src/platform/ai/fake-creative-gateway.js';
import type { CreativeAiError, CreativeImageResult, CreativeTextResult } from '../../src/platform/ai/creative-ai-gateway.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCampaignService } from '../../src/modules/flow/content-campaign-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentIdeaService } from '../../src/modules/flow/content-idea-service.js';
import { ContentInsightService } from '../../src/modules/flow/content-insight-service.js';
import { ContentMediaService } from '../../src/modules/flow/content-media-service.js';
import { ContentPackageService } from '../../src/modules/flow/content-package-service.js';
import { ContentPromptLibrary } from '../../src/modules/flow/content-prompt-library.js';
import { ContentPromptService } from '../../src/modules/flow/content-prompt-service.js';
import { createContentAiAttemptService } from '../../src/modules/flow/content-ai-attempt-service.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { fixtureImage } from './content-images.js';

export const fixtureBrandId = '05110000-0000-4000-8000-000000000001';
export const fixtureItemId = '05110000-0000-4000-8000-000000000002';
export const fixtureCampaignId = '05110000-0000-4000-8000-000000000003';
export const fixturePhoto = fixtureImage('photo-a.jpg');
export const fixtureLogo = fixtureImage('rgb.png');
export const fixturePhotoSha = createHash('sha256').update(fixturePhoto).digest('hex');
export const fixtureLogoSha = createHash('sha256').update(fixtureLogo).digest('hex');
export const fixtureAt = '2027-01-01T00:00:00.000Z';

export const fixtureDisplayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;

export const fixtureProfile = {
  brandName: 'Synthetic Brand', tagline: 'Bền mỗi ngày', hotline: '0900 123 456',
  website: 'https://brand.example', fanpage: 'https://facebook.com/synthetic', address: '12 Example Street',
};

export const fixtureCatalogItem = {
  itemType: 'PHYSICAL', name: 'Synthetic Product', description: 'A synthetic product for integration tests.',
  tiers: [{ tierKey: 'standard', name: 'Standard', priceText: '1.290.000đ', inclusions: ['Synthetic inclusion'] }],
  photos: [{ mediaSha256: fixturePhotoSha, posterDefault: true }],
};

export const fixtureCampaignContent = {
  name: 'Synthetic Campaign', objective: 'A synthetic objective.',
  items: [{ itemId: fixtureItemId, itemVersion: 1, tierKeys: ['standard'] }],
};

const uuid = (number: number): string => `05110000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

export function textReply(post: string): FakeCreativeReply<CreativeTextResult> {
  return { result: { text: post, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: `synthetic-text-${post.length}` } };
}

export function imageReply(bytes = fixturePhoto): FakeCreativeReply<CreativeImageResult> {
  return { result: { bytes, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, providerRequestId: `synthetic-image-${bytes.length}` } };
}

export function errorReply(error: CreativeAiError): FakeCreativeReply<never> { return { error }; }

export interface PackageFixtureOptions {
  readonly textAfterIdeas?: readonly FakeCreativeReply<CreativeTextResult>[];
  readonly imageAfterIdeas?: readonly FakeCreativeReply<CreativeImageResult>[];
  readonly gateway?: FakeCreativeGateway;
}

export async function createPackageFixture(options: PackageFixtureOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-package-'));
  const databasePath = path.join(root, 'db.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const opened = openDatabase({ databasePath });
  const { db } = opened;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const clock = { value: new Date(fixtureAt) };
  const now = () => new Date(clock.value.getTime());
  let idNumber = 100;
  const nextId = () => uuid(idNumber++);
  const gateway = options.gateway ?? createFakeCreativeGateway({
    text: [
      textReply(JSON.stringify({ concept: 'Synthetic Big Idea', expression: 'Synthetic expression' })),
      textReply(JSON.stringify({ name: 'Angle One', concept: 'First synthetic angle' })),
      textReply(JSON.stringify({ name: 'Angle Two', concept: 'Second synthetic angle' })),
      ...(options.textAfterIdeas ?? []),
    ],
    image: options.imageAfterIdeas ?? [],
  });
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => fixtureBrandId, now });
  const media = new ContentMediaService({ db, artifactStore: artifacts, now });
  const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => fixtureItemId, now });
  const campaignIds = [fixtureCampaignId, uuid(999)];
  const campaigns = new ContentCampaignService({ db, artifactStore: artifacts, catalog, uuid: () => campaignIds.shift()!, now });
  const library = new ContentPromptLibrary();
  const prompts = new ContentPromptService({ db, artifactStore: artifacts, library, uuid: nextId, now });
  const attempts = createContentAiAttemptService({ db, gateway, artifactRoot, clock: now, newId: nextId });
  const insights = new ContentInsightService({ db, artifactStore: artifacts, campaigns, now });
  const ideas = new ContentIdeaService({ db, artifactStore: artifacts, attempts, campaigns, insights, catalog, prompts, library, now, newId: nextId });

  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'synthetic-brand', profile: fixtureProfile, displayRules: fixtureDisplayRules });
  await media.registerMedia({ brandId: fixtureBrandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: fixturePhoto });
  await media.registerMedia({ brandId: fixtureBrandId, kind: 'LOGO', declaredType: 'image/png', bytes: fixtureLogo });
  await brands.reviseBrand({ contractVersion: '1.0.0', brandId: fixtureBrandId, expectedVersion: 1, profile: fixtureProfile, displayRules: fixtureDisplayRules, logoMediaSha256: fixtureLogoSha });
  await catalog.createItem({ contractVersion: '1.0.0', brandId: fixtureBrandId, itemKey: 'synthetic-product', item: fixtureCatalogItem });
  await campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: 'synthetic-051', brandId: fixtureBrandId, campaign: fixtureCampaignContent });
  await insights.reviseInsight({ contractVersion: '1.0.0', campaignId: fixtureCampaignId, expectedVersion: 0, insight: {
    customer: 'Synthetic customer', painPoint: 'Synthetic pain point', insight: 'Synthetic locked insight', source: { kind: 'TYPED' },
  } });
  await insights.lockInsight({ contractVersion: '1.0.0', campaignId: fixtureCampaignId, insightVersion: 1, campaignVersion: 1 });

  const bigIdea = await ideas.generate({ contractVersion: '1.0.0', requestId: nextId(), campaignId: fixtureCampaignId, kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1, prompt: { source: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 } }, 'owner:synthetic');
  ideas.changeState({ contractVersion: '1.0.0', ideaId: bigIdea.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const angles = [] as { readonly ideaId: string; readonly code: string }[];
  for (const requestId of [nextId(), nextId()]) {
    const angle = await ideas.generate({ contractVersion: '1.0.0', requestId, campaignId: fixtureCampaignId, kind: 'ANGLE', parentIdeaId: bigIdea.ideaId, model: 'gpt-5.6-sol', plannedCallCount: 1, prompt: { source: 'SYSTEM', id: 'system-angle-social', version: 1 } }, 'owner:synthetic');
    ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 0, action: 'PURPOSES', purposes: ['SALES'] });
    angles.push({ ideaId: angle.ideaId, code: angle.code });
  }

  const packages = new ContentPackageService({ db, artifactStore: artifacts, attempts, campaigns, insights, catalog, prompts, library, brands, media, ideas, now, newId: nextId });
  return {
    root, databasePath, artifactRoot, db, artifacts, gateway, clock, now, brands, media, catalog, campaigns, insights, ideas, prompts, library, attempts, packages,
    angleIds: angles.map((angle) => angle.ideaId), angles,
    close: () => { if (db.open) db.close(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}
