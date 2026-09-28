import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  ContentAiStatusResponse,
  ContentApiErrorResponse,
  ContentBrandDetailResponse,
  ContentCampaignDetailResponse,
  ContentCampaignHistoryItem,
  ContentCampaignItemView,
  ContentCampaignListResponse,
  ContentBrandHistoryItem,
  ContentBrandListResponse,
  ContentCatalogDetailResponse,
  ContentCatalogHistoryItem,
  ContentCatalogListResponse,
  ContentIdeaListEntry,
  ContentIdeaListResponse,
  ContentInsightDetailResponse,
  ContentInsightHistoryItem,
  ContentInsightStpSuggestion,
  ContentPackageDetailResponse,
  ContentPackageListResponse,
  ContentPromptDetailResponse,
  ContentPromptHistoryItem,
  ContentPromptListResponse,
  ContentPromptSystemLayer,
  ContentSystemPromptDetailResponse,
} from '../../contracts/api/content-api.generated.js';
import type {
  OwnerContentApiErrorResponse,
  OwnerContentBrandReceipt,
} from '../../contracts/api/owner-content-brand-api.generated.js';
import type {
  OwnerContentCatalogItemReceipt,
  OwnerContentMediaReceipt,
  OwnerContentMediaRejection,
} from '../../contracts/api/owner-content-catalog-api.generated.js';
import type { OwnerContentCampaignLifecycleReceipt, OwnerContentCampaignReceipt } from '../../contracts/api/owner-content-campaign-api.generated.js';
import type { OwnerContentInsightLockReceipt, OwnerContentInsightRevisionReceipt } from '../../contracts/api/owner-content-insight-api.generated.js';
import type { OwnerContentPromptLifecycleReceipt, OwnerContentPromptReceipt } from '../../contracts/api/owner-content-prompt-api.generated.js';
import type { ContentCampaignArtifact } from '../../contracts/flow/content-campaign-artifact.generated.js';
import type { ContentCampaignContent } from '../../contracts/flow/content-campaign-create-request.generated.js';
import type { ContentPromptArtifact } from '../../contracts/flow/content-prompt-artifact.generated.js';
import type { LockedStpArtifact } from '../../contracts/flow/locked-stp-artifact.generated.js';
import type { ContentPromptContent, ContentPromptLineage, ContentPromptType } from '../../contracts/flow/content-prompt-create-request.generated.js';
import type { ContentBrandArtifact } from '../../contracts/flow/content-brand-artifact.generated.js';
import type { ContentCatalogItemArtifact } from '../../contracts/flow/content-catalog-item-artifact.generated.js';
import type { ContentCatalogItemContent } from '../../contracts/flow/content-catalog-item-create-request.generated.js';
import type { CreativeAiGateway } from '../platform/ai/creative-ai-gateway.js';
import { disabledCreativeGateway } from '../platform/ai/fake-creative-gateway.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import { createContentAiAttemptService } from '../modules/flow/content-ai-attempt-service.js';
import { CONTENT_AI_NOT_CONFIGURED, type ContentAiStatusSource } from '../modules/flow/content-ai-status.js';
import { ContentIdeaService } from '../modules/flow/content-idea-service.js';
import { ContentPackageService } from '../modules/flow/content-package-service.js';
import { ContentBrandIdentityConflictError, ContentBrandService } from '../modules/flow/content-brand-service.js';
import { ContentCampaignConflictError, ContentCampaignReferenceError, ContentCampaignService } from '../modules/flow/content-campaign-service.js';
import { ContentCatalogIdentityConflictError, ContentCatalogService } from '../modules/flow/content-catalog-service.js';
import { CONTENT_MEDIA_LIMITS, ContentImageError, type ContentMediaKind } from '../modules/flow/content-image.js';
import { ContentMediaService, registeredContentMedia, type ContentMediaRecord } from '../modules/flow/content-media-service.js';
import { ContentPromptLibrary } from '../modules/flow/content-prompt-library.js';
import { ContentPromptConflictError, ContentPromptService } from '../modules/flow/content-prompt-service.js';
import { DiscoveryWorkspaceService } from '../modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../modules/flow/discovery-workspace-reader.js';
import { ProductCandidateService } from '../modules/flow/product-candidate-service.js';
import { FlowProductCandidateReader } from '../modules/flow/product-candidate-reader.js';
import { CandidateBasketService } from '../modules/flow/candidate-basket-service.js';
import { FlowCandidateBasketReader } from '../modules/flow/candidate-basket-reader.js';
import { ProductWorkspaceService } from '../modules/flow/product-workspace-service.js';
import { FlowProductWorkspaceReader } from '../modules/flow/product-workspace-reader.js';
import { ContentInsightConflictError, ContentInsightGateError, ContentInsightReferenceError, ContentInsightService } from '../modules/flow/content-insight-service.js';
import { B8ClearanceService } from '../modules/flow/b8-clearance-service.js';
import { FlowB8ClearanceReader } from '../modules/flow/b8-clearance-reader.js';
import { StpService } from '../modules/flow/stp-service.js';
import { FlowLockedStpReader } from '../modules/flow/locked-stp-reader.js';
import { CANDIDATE_B7_DECISION_CAPABILITY, CANDIDATE_B7_DECISION_POLICY_ID, CandidateB7DecisionService } from '../modules/governance/candidate-b7-decision-service.js';
import { GovernanceCandidateB7DecisionReader } from '../modules/governance/candidate-b7-decision-reader.js';
import { PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B8_REVIEW_POLICY_ID, ProductB8LaneDecisionService } from '../modules/governance/product-b8-lane-decision-service.js';
import { GovernanceProductB8Reader } from '../modules/governance/product-b8-status-reader.js';
import { ProductB10DecisionService } from '../modules/governance/product-b10-decision-service.js';
import { GovernanceProductB10Reader } from '../modules/governance/product-b10-decision-reader.js';
import {
  assertContentPromptContent,
  FlowValidationError,
  validateContentBrandCreateRequest,
  validateContentBrandRevisionRequest,
  validateContentCampaignCreateRequest,
  validateContentCampaignLifecycleRequest,
  validateContentCampaignRevisionRequest,
  validateContentCatalogItemCreateRequest,
  validateContentCatalogItemRevisionRequest,
  validateContentInsightLockRequest,
  validateContentInsightRevisionRequest,
  validateContentPromptCreateRequest,
  validateContentPromptLifecycleRequest,
  validateContentPromptRevisionRequest,
} from '../modules/flow/validation.js';
import { contentIdeaOwnerRoute, createContentIdeaOwnerWriters, routeContentIdeaOwner, type ContentIdeaOwnerWriters } from './content-ideas-api.js';
import {
  contentPackageOwnerRoute,
  createContentPackageOwnerWriters,
  packageDetailView,
  routeContentPackageOwner,
  type ContentPackageOwnerWriters,
} from './content-packages-api.js';
import { RequestScopedArtifactStore } from './request-scoped-artifact-store.js';
import {
  assertOwnerHttpConfiguration,
  EmptyBodyError,
  ownerAuthorized,
  ownerCors,
  PayloadTooLargeError,
  readOwnerBytes,
  sendApiJson,
  singleHeader,
  type OwnerHttpConfiguration,
} from './owner-http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const BRAND_BODY_BYTES = 16 * 1024;
const CATALOG_BODY_BYTES = 64 * 1024;
const PROMPT_BODY_BYTES = 96 * 1024;
const CAMPAIGN_BODY_BYTES = 32 * 1024;
const SYSTEM_PROMPT_ID = /^system-[a-z0-9-]{3,60}$/;
const REQUIRED_TABLES = [
  'artifact_manifests', 'flow_content_brands', 'flow_content_brand_revisions', 'flow_content_media', 'flow_content_catalog_items', 'flow_content_catalog_item_revisions',
  'flow_content_prompts', 'flow_content_prompt_revisions', 'flow_content_prompt_lifecycle',
  'flow_content_campaigns', 'flow_content_campaign_revisions', 'flow_content_campaign_lifecycle',
  'flow_content_ai_attempts', 'flow_content_insight_revisions', 'flow_content_insight_locks',
  'flow_content_ideas', 'flow_content_idea_states', 'flow_content_purpose_tags',
  'flow_content_packages', 'flow_content_package_versions', 'flow_content_package_states', 'flow_content_campaign_defaults',
];
const MEDIA_KINDS: Readonly<Record<string, ContentMediaKind>> = { logo: 'LOGO', photo: 'PHOTO' };

export interface ContentReadApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
  /** Clock used to decide whether deleted prompts are still restorable (tests only). */
  readonly now?: () => Date;
  /** Content Studio AI availability; absent means AI is not configured. */
  readonly aiStatus?: ContentAiStatusSource;
}
export interface ContentOwnerApiConfiguration extends OwnerHttpConfiguration {
  readonly now?: () => Date;
  readonly uuid?: () => string;
  /** Content Studio AI; absent means AI is not configured and generation answers `ai_unavailable`. */
  readonly gateway?: CreativeAiGateway;
}
export interface ContentApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  close(): void;
}

interface ReadHandlers {
  list(): Promise<ContentBrandListResponse>;
  detail(brandId: string): Promise<ContentBrandDetailResponse | undefined>;
  catalogList(brandId: string): Promise<ContentCatalogListResponse | undefined>;
  catalogDetail(brandId: string, itemId: string): Promise<ContentCatalogDetailResponse | undefined>;
  media(brandId: string, mediaSha256: string): Promise<{ readonly media: ContentMediaRecord; readonly bytes: Buffer } | undefined>;
  promptList(): Promise<ContentPromptListResponse>;
  promptDetail(promptId: string): Promise<ContentPromptDetailResponse | undefined>;
  systemPrompt(id: string): Promise<ContentSystemPromptDetailResponse | undefined>;
  campaignList(): Promise<ContentCampaignListResponse>;
  campaignDetail(campaignId: string): Promise<ContentCampaignDetailResponse | undefined>;
  insightDetail(campaignId: string): Promise<ContentInsightDetailResponse | undefined>;
  ideaList(campaignId: string): Promise<ContentIdeaListResponse | undefined>;
  packageList(campaignId: string): Promise<ContentPackageListResponse | undefined>;
  packageDetail(packageId: string): Promise<ContentPackageDetailResponse | undefined>;
  posterImage(packageId: string, version: number): Promise<{ readonly bytes: Buffer; readonly mediaType: 'image/png' | 'image/jpeg' } | undefined>;
  aiStatus(): Promise<ContentAiStatusResponse>;
}

/** Read-only research chain (B7 → B10) that campaigns and insights check against. */
function openResearchReaders(db: BetterSqlite3.Database, artifactStore: ContentAddressedArtifactStore) {
  const discoveryReader = new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore }));
  const candidateReader = new FlowProductCandidateReader(new ProductCandidateService({ db, artifactStore }));
  const basketReader = new FlowCandidateBasketReader(new CandidateBasketService({ db, artifactStore, workspaceReader: discoveryReader, candidateReader }));
  const b7 = new CandidateB7DecisionService({ db, artifactStore, basketReader, configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY } });
  const productReader = new FlowProductWorkspaceReader(new ProductWorkspaceService({ db, artifactStore, decisionReader: new GovernanceCandidateB7DecisionReader(b7) }));
  const b8Reader = new GovernanceProductB8Reader(new ProductB8LaneDecisionService({
    db, artifactStore, productWorkspaceReader: productReader,
    configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY },
  }));
  const clearanceReader = new FlowB8ClearanceReader(new B8ClearanceService({ db, artifactStore, decisionReader: b8Reader, statusReader: b8Reader }));
  const stpReader = new FlowLockedStpReader(new StpService({ db, artifactStore, productWorkspaceReader: productReader, b8ClearanceReader: clearanceReader }));
  const b10Reader = new GovernanceProductB10Reader(new ProductB10DecisionService({ db, artifactStore, lockedStpReader: stpReader }));
  return { productReader, stpReader, b10Reader };
}

/** STP help for the insight form: the primary segment pre-fills the customer; the positioning statement (`insight`) is shown for reference only (Q-I4). */
function stpSuggestion(locked: LockedStpArtifact): ContentInsightStpSuggestion | undefined {
  const { segments, primaryTargetSegmentKey, positioningStatement } = locked.workingStp.content;
  const primary = segments.find((segment) => segment.key === primaryTargetSegmentKey) ?? segments[0];
  if (primary === undefined) return undefined;
  const customer = primary.description ? `${primary.label} — ${primary.description}` : primary.label;
  return { lockedStpId: locked.lockId, customer: customer.slice(0, 500).trim(), insight: positioningStatement.slice(0, 2000).trim() };
}

function systemLayer(library: ContentPromptLibrary, promptType: ContentPromptType): ContentPromptSystemLayer {
  const layer = library.layer(promptType);
  return { promptType, version: layer.version, sha256: layer.sha256, text: layer.text };
}

/** Verified, query-only read paths for Content Studio (`/api/content/*`). */
export function openContentReadApi(configuration: ContentReadApiConfiguration): ContentApiApplication {
  if (!configuration.databasePath || !configuration.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertTables(db);
    const artifactStore = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
    const brands = new ContentBrandService({ db, artifactStore });
    const catalog = new ContentCatalogService({ db, artifactStore });
    const media = new ContentMediaService({ db, artifactStore });
    const library = new ContentPromptLibrary();
    const prompts = new ContentPromptService({ db, artifactStore, library, ...(configuration.now ? { now: configuration.now } : {}) });
    const campaigns = new ContentCampaignService({ db, artifactStore, catalog, ...(configuration.now ? { now: configuration.now } : {}) });
    const research = openResearchReaders(db, artifactStore);
    const insights = new ContentInsightService({ db, artifactStore, campaigns, lockedStpReader: research.stpReader, b10Reader: research.b10Reader });
    // The read API only lists ideas and packages; its attempt service has a disabled gateway and can never record an attempt.
    const attempts = createContentAiAttemptService({
      db, gateway: disabledCreativeGateway(), artifactRoot: path.resolve(configuration.artifactRoot),
      clock: configuration.now ?? (() => new Date()),
      newId: () => { throw new Error('The read API never records AI attempts'); },
    });
    const ideas = new ContentIdeaService({
      db, artifactStore, campaigns, insights, catalog, prompts, library, attempts,
      ...(configuration.now ? { now: configuration.now } : {}),
    });
    const packages = new ContentPackageService({
      db, artifactStore, attempts, campaigns, insights, catalog, prompts, library, brands, media, ideas,
      ...(configuration.now ? { now: configuration.now } : {}),
    });
    /** Re-reads every pinned item version; the campaign's brand, item identity and every selected tier must still match. */
    const resolveCampaignItems = async (campaign: ContentCampaignArtifact): Promise<ContentCampaignItemView[]> => {
      const views: ContentCampaignItemView[] = [];
      for (const ref of campaign.campaign.items) {
        const artifact = await catalog.readItem(ref.itemId, ref.itemVersion);
        if (artifact.itemId !== ref.itemId || artifact.brandId !== campaign.brandId || artifact.version !== ref.itemVersion) throw new Error('Campaign item identity mismatch');
        const tierNames = new Map(artifact.item.tiers.map((tier) => [tier.tierKey, tier.name] as const));
        const selected: string[] = ref.tierKeys ? [...ref.tierKeys] : [];
        const tiers = selected.map((tierKey) => {
          const name = tierNames.get(tierKey);
          if (name === undefined) throw new Error('Campaign tier is missing from the pinned item version');
          return { tierKey, name };
        });
        views.push({ itemId: artifact.itemId, itemVersion: artifact.version, itemKey: artifact.itemKey, itemType: artifact.item.itemType, name: artifact.item.name, tiers });
      }
      return views;
    };
    const brandCatalog = db.prepare(`
      SELECT b.brand_id brandId, max(r.version) version
      FROM flow_content_brands b JOIN flow_content_brand_revisions r ON r.brand_id = b.brand_id
      GROUP BY b.brand_id ORDER BY b.created_at, b.brand_id
    `);
    const versions = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');
    const brandExists = db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?');
    const mediaExists = db.prepare('SELECT 1 FROM flow_content_media WHERE brand_id = ? AND media_sha256 = ?');

    const handlers: ReadHandlers = {
      async list() {
        const result: ContentBrandListResponse['brands'] = [];
        for (const row of brandCatalog.all() as { brandId: string; version: bigint }[]) {
          const brand = await brands.readBrand(row.brandId, Number(row.version));
          if (brand.brandId !== row.brandId || BigInt(brand.version) !== row.version) throw new Error('Brand catalog identity mismatch');
          result.push({ brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, brandName: brand.profile.brandName, updatedAt: brand.createdAt });
        }
        return { contractVersion: '1.0.0', brands: result };
      },
      async detail(brandId) {
        const rows = versions.all(brandId) as { version: bigint }[];
        if (rows.length === 0) return undefined;
        const history: ContentBrandHistoryItem[] = [];
        let latest: ContentBrandArtifact | undefined;
        for (const row of rows) {
          latest = await brands.readBrand(brandId, Number(row.version));
          history.push({ version: latest.version, brandName: latest.profile.brandName, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Brand history is empty');
        const brand = latest;
        return {
          contractVersion: '1.0.0',
          brand: {
            brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, profile: brand.profile, displayRules: brand.displayRules,
            ...(brand.logoMediaSha256 === undefined ? {} : { logoMediaSha256: brand.logoMediaSha256 }), createdAt: brand.createdAt,
          },
          history: [first, ...rest],
        };
      },
      async catalogList(brandId) {
        if (!brandExists.get(brandId)) return undefined;
        const items: ContentCatalogListResponse['items'] = [];
        for (const row of catalog.listItems(brandId)) {
          const artifact = await catalog.readItem(row.itemId, row.version);
          if (artifact.itemId !== row.itemId || artifact.brandId !== brandId || artifact.version !== row.version) throw new Error('Catalog identity mismatch');
          items.push({
            itemId: artifact.itemId, itemKey: artifact.itemKey, version: artifact.version, itemType: artifact.item.itemType, name: artifact.item.name,
            tierNames: artifact.item.tiers.map((tier) => tier.name), photoCount: artifact.item.photos.length, updatedAt: artifact.createdAt,
          });
        }
        return { contractVersion: '1.0.0', brandId, items };
      },
      async catalogDetail(brandId, itemId) {
        if (catalog.itemBrand(itemId) !== brandId) return undefined;
        const history: ContentCatalogHistoryItem[] = [];
        let latest: ContentCatalogItemArtifact | undefined;
        for (const version of catalog.itemVersions(itemId)) {
          latest = await catalog.readItem(itemId, version);
          if (latest.brandId !== brandId) throw new Error('Catalog brand mismatch');
          history.push({ version: latest.version, name: latest.item.name, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Catalog history is empty');
        return {
          contractVersion: '1.0.0',
          item: { itemId: latest.itemId, brandId: latest.brandId, itemKey: latest.itemKey, version: latest.version, item: latest.item, createdAt: latest.createdAt },
          history: [first, ...rest],
        };
      },
      async media(brandId, mediaSha256) {
        if (!mediaExists.get(brandId, mediaSha256)) return undefined;
        return media.readMedia(brandId, mediaSha256);
      },
      async promptList() {
        const systemPrompts: ContentPromptListResponse['systemPrompts'] = library.list().map((entry) => {
          library.read(entry.id, entry.version);
          return { id: entry.id, promptType: entry.promptType, version: entry.version, name: entry.name, description: entry.description, recommendedModel: entry.recommendedModel, tags: [...entry.tags], isDefault: entry.isDefault };
        });
        const summaries: ContentPromptListResponse['prompts'] = [];
        for (const row of prompts.listPrompts()) {
          const state = prompts.lifecycleState(row.promptId);
          if (state.deleted && state.expired) continue;
          const artifact = await prompts.readPrompt(row.promptId, row.version);
          summaries.push({
            promptId: artifact.promptId, promptKey: artifact.promptKey, promptType: artifact.promptType, version: artifact.version, name: artifact.prompt.name,
            recommendedModel: artifact.prompt.recommendedModel, tags: [...artifact.prompt.tags], updatedAt: artifact.createdAt, ...(state.deleted ? { deleted: state.deleted } : {}),
          });
        }
        return { contractVersion: '1.0.0', systemPrompts, prompts: summaries };
      },
      async promptDetail(promptId) {
        if (!prompts.promptExists(promptId)) return undefined;
        const history: ContentPromptHistoryItem[] = [];
        let latest: ContentPromptArtifact | undefined;
        let lineage: ContentPromptLineage | undefined;
        for (const version of prompts.promptVersions(promptId)) {
          latest = await prompts.readPrompt(promptId, version);
          if (version === 1) lineage = latest.duplicatedFrom;
          history.push({ version: latest.version, name: latest.prompt.name, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Prompt history is empty');
        const state = prompts.lifecycleState(promptId);
        return {
          contractVersion: '1.0.0',
          prompt: {
            promptId: latest.promptId, promptKey: latest.promptKey, promptType: latest.promptType, version: latest.version, prompt: latest.prompt,
            ...(lineage ? { duplicatedFrom: lineage } : {}),
            createdAt: latest.createdAt,
          },
          history: [first, ...rest],
          lifecycle: { sequence: state.sequence, ...(state.deleted ? { deleted: state.deleted } : {}) },
          systemLayer: systemLayer(library, latest.promptType),
        };
      },
      async systemPrompt(id) {
        const entry = library.find(id);
        if (!entry) return undefined;
        const { prompt } = library.read(entry.id, entry.version);
        return {
          contractVersion: '1.0.0',
          systemPrompt: { id: entry.id, promptType: entry.promptType, version: entry.version, sha256: entry.sha256, prompt, isDefault: entry.isDefault },
          systemLayer: systemLayer(library, entry.promptType),
        };
      },
      async campaignList() {
        const summaries: ContentCampaignListResponse['campaigns'] = [];
        for (const row of campaigns.listCampaigns()) {
          const state = campaigns.lifecycleState(row.campaignId);
          if (state.deleted && state.expired) continue;
          const artifact = await campaigns.readCampaign(row.campaignId, row.version);
          if (artifact.campaignId !== row.campaignId || artifact.brandId !== row.brandId || artifact.version !== row.version) throw new Error('Campaign list identity mismatch');
          const items = (await resolveCampaignItems(artifact)).map((view) => ({ itemId: view.itemId, itemVersion: view.itemVersion, name: view.name, tierNames: view.tiers.map((tier) => tier.name) }));
          summaries.push({
            campaignId: artifact.campaignId, campaignKey: artifact.campaignKey, brandId: artifact.brandId, version: artifact.version, name: artifact.campaign.name,
            items, updatedAt: artifact.createdAt, ...(state.deleted ? { deleted: state.deleted } : {}),
          });
        }
        return { contractVersion: '1.0.0', campaigns: summaries };
      },
      async campaignDetail(campaignId) {
        if (!campaigns.campaignExists(campaignId)) return undefined;
        const history: ContentCampaignHistoryItem[] = [];
        let latest: ContentCampaignArtifact | undefined;
        for (const version of campaigns.campaignVersions(campaignId)) {
          latest = await campaigns.readCampaign(campaignId, version);
          history.push({ version: latest.version, name: latest.campaign.name, createdAt: latest.createdAt });
        }
        const [first, ...rest] = history;
        if (!latest || !first) throw new Error('Campaign history is empty');
        const state = campaigns.lifecycleState(campaignId);
        return {
          contractVersion: '1.0.0',
          campaign: { campaignId: latest.campaignId, campaignKey: latest.campaignKey, brandId: latest.brandId, version: latest.version, campaign: latest.campaign, createdAt: latest.createdAt },
          items: await resolveCampaignItems(latest),
          history: [first, ...rest],
          lifecycle: { sequence: state.sequence, ...(state.deleted ? { deleted: state.deleted } : {}) },
        };
      },
      async insightDetail(campaignId) {
        if (!campaigns.campaignExists(campaignId)) return undefined;
        const campaign = await campaigns.readCampaign(campaignId);
        const history: ContentInsightHistoryItem[] = [];
        let latest: Awaited<ReturnType<ContentInsightService['readInsight']>> | undefined;
        for (const row of insights.history(campaignId)) {
          latest = await insights.readInsight(campaignId, row.version);
          if (latest.version !== history.length + 1) throw new Error('Insight history is not sequential');
          history.push({ version: latest.version, sourceKind: latest.insight.source.kind, createdAt: latest.createdAt });
        }
        const lock = await insights.readLock(campaignId);
        const workspaceId = campaign.campaign.researchProductWorkspaceId;
        const gate = await insights.gate(workspaceId);
        const b9 = workspaceId === undefined ? undefined : await research.stpReader.readStatusByProductWorkspace(workspaceId);
        const suggestion = b9?.state === 'LOCKED' ? stpSuggestion(b9.locked) : undefined;
        return {
          contractVersion: '1.0.0', campaignId, campaignVersion: campaign.version, campaignDeleted: campaigns.lifecycleState(campaignId).deleted !== undefined,
          ...(latest ? { latest: { version: latest.version, insight: latest.insight, createdAt: latest.createdAt } } : {}),
          history,
          ...(lock ? { lock: { insightVersion: lock.insightVersion, campaignVersion: lock.campaignVersion, lockedAt: lock.lockedAt, ...(lock.b10 ? { b10: lock.b10 } : {}) } } : {}),
          gate: { ...gate, ...(workspaceId === undefined ? {} : { productWorkspaceId: workspaceId }) },
          ...(suggestion ? { stpSuggestion: suggestion } : {}),
        };
      },
      async ideaList(campaignId) {
        if (!campaigns.campaignExists(campaignId)) return undefined;
        const campaign = await campaigns.readCampaign(campaignId);
        const lock = await insights.readLock(campaignId);
        return {
          contractVersion: '1.0.0', campaignId, campaignName: campaign.campaign.name,
          campaignDeleted: campaigns.lifecycleState(campaignId).deleted !== undefined,
          insightLocked: lock !== undefined,
          ...(lock ? { insightVersion: lock.insightVersion } : {}),
          ideas: (await ideas.listCampaignIdeas(campaignId)).map((idea) => ({ ...idea, purposes: [...idea.purposes] as ContentIdeaListEntry['purposes'] })),
          purposeTags: ideas.purposeTags().map((tag) => ({ tagId: tag.tagId, label: tag.label, displayLike: tag.displayLike, createdAt: tag.createdAt })),
        };
      },
      async packageList(campaignId) {
        if (!campaigns.campaignExists(campaignId)) return undefined;
        const campaign = await campaigns.readCampaign(campaignId);
        const lock = await insights.readLock(campaignId);
        const defaults = packages.readDefaults(campaignId);
        return {
          contractVersion: '1.0.0', campaignId, campaignName: campaign.campaign.name,
          campaignDeleted: campaigns.lifecycleState(campaignId).deleted !== undefined,
          insightLocked: lock !== undefined,
          ...(defaults ? { defaults: { version: defaults.version, defaults: defaults.defaults, createdAt: defaults.createdAt } } : {}),
          packages: (await packages.listCampaignPackages(campaignId)).map((entry) => ({ ...entry })),
        };
      },
      async packageDetail(packageId) {
        if (!packages.packageExists(packageId)) return undefined;
        const detail = await packages.readPackage(packageId);
        const campaign = await campaigns.readCampaign(detail.campaignId, detail.pin.campaignVersion);
        return packageDetailView(detail, { name: campaign.campaign.name, deleted: campaigns.lifecycleState(detail.campaignId).deleted !== undefined });
      },
      async posterImage(packageId, version) {
        if (!packages.packageExists(packageId)) return undefined;
        const detail = await packages.readPackage(packageId);
        if (!detail.poster.some((item) => item.version === version)) return undefined;
        return packages.readPosterImage(packageId, version);
      },
      async aiStatus() {
        const status = await (configuration.aiStatus ?? notConfigured).read();
        return {
          contractVersion: '1.0.0', configured: status.configured, checkedAt: status.checkedAt,
          ...(status.error === undefined ? {} : { error: status.error }),
          models: status.models.map((model) => ({ id: model.id, kind: model.kind, available: model.available })),
        };
      },
    };
    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeRead(request, response, handlers); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function routeRead(request: IncomingMessage, response: ServerResponse, handlers: ReadHandlers): Promise<void> {
  try {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendReadError(response, 405, 'method_not_allowed', 'Only GET is supported'); }
    const parts = pathParts(request.url);
    if (parts === null) return sendReadError(response, 400, 'bad_request', 'Malformed request URL');
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'campaigns' && parts.length === 5 && parts[4] === 'insight') {
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Campaign ID must be a UUID');
      const result = await handlers.insightDetail(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Campaign not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'campaigns' && parts.length === 5 && parts[4] === 'ideas') {
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Campaign ID must be a UUID');
      const result = await handlers.ideaList(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Campaign not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'campaigns' && parts.length === 5 && parts[4] === 'packages') {
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Campaign ID must be a UUID');
      const result = await handlers.packageList(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Campaign not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'packages' && (parts.length === 4 || (parts.length === 6 && parts[4] === 'posters'))) {
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Package ID must be a UUID');
      if (parts.length === 4) {
        const result = await handlers.packageDetail(parts[3]!);
        return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Package not found');
      }
      if (!/^[1-9][0-9]{0,5}$/.test(parts[5]!)) return sendReadError(response, 400, 'bad_request', 'Poster version must be a positive integer');
      const image = await handlers.posterImage(parts[3]!, Number(parts[5]));
      if (!image) return sendReadError(response, 404, 'not_found', 'Poster not found');
      // Same hardened headers as brand media: generated bytes are served inert and never sniffed.
      response.writeHead(200, {
        'Content-Type': image.mediaType,
        'Content-Length': image.bytes.byteLength,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(image.bytes);
      return;
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'campaigns' && parts.length <= 4) {
      if (parts.length === 3) return sendApiJson(response, 200, await handlers.campaignList());
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Campaign ID must be a UUID');
      const result = await handlers.campaignDetail(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Campaign not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'prompts' && parts.length <= 4) {
      if (parts.length === 3) return sendApiJson(response, 200, await handlers.promptList());
      if (!UUID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'Prompt ID must be a UUID');
      const result = await handlers.promptDetail(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Prompt not found');
    }
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'ai' && parts[3] === 'status' && parts.length === 4) return sendApiJson(response, 200, await handlers.aiStatus());
    if (parts[0] === 'api' && parts[1] === 'content' && parts[2] === 'system-prompts' && parts.length === 4) {
      if (!SYSTEM_PROMPT_ID.test(parts[3]!)) return sendReadError(response, 400, 'bad_request', 'System prompt ID is invalid');
      const result = await handlers.systemPrompt(parts[3]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'System prompt not found');
    }
    if (parts[0] !== 'api' || parts[1] !== 'content' || parts[2] !== 'brands') return sendReadError(response, 404, 'not_found', 'Route not found');
    if (parts.length === 3) return sendApiJson(response, 200, await handlers.list());
    const brandId = parts[3]!;
    if (!UUID.test(brandId)) return sendReadError(response, 400, 'bad_request', 'Brand ID must be a UUID');
    if (parts.length === 4) {
      const result = await handlers.detail(brandId);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Brand not found');
    }
    if (parts[4] === 'catalog' && parts.length === 5) {
      const result = await handlers.catalogList(brandId);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Brand not found');
    }
    if (parts[4] === 'catalog' && parts.length === 6) {
      if (!UUID.test(parts[5]!)) return sendReadError(response, 400, 'bad_request', 'Item ID must be a UUID');
      const result = await handlers.catalogDetail(brandId, parts[5]!);
      return result ? sendApiJson(response, 200, result) : sendReadError(response, 404, 'not_found', 'Catalog item not found');
    }
    if (parts[4] === 'media' && parts.length === 6) {
      if (!SHA256.test(parts[5]!)) return sendReadError(response, 400, 'bad_request', 'Media ID must be a SHA-256 digest');
      const result = await handlers.media(brandId, parts[5]!);
      if (!result) return sendReadError(response, 404, 'not_found', 'Media not found');
      response.writeHead(200, {
        'Content-Type': result.media.mediaType,
        'Content-Length': result.bytes.byteLength,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(result.bytes);
      return;
    }
    return sendReadError(response, 404, 'not_found', 'Route not found');
  } catch {
    return sendReadError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

const notConfigured: ContentAiStatusSource = { read: async () => CONTENT_AI_NOT_CONFIGURED };

class UnknownBrandError extends Error {}
class UnknownItemError extends Error {}
class InvalidReferenceError extends Error {}
class UnknownPromptError extends Error {}
class UnknownCampaignError extends Error {}
class InvalidPromptRequestError extends Error {}
class ExistingContentIntegrityError extends Error {}

type OwnerRoute =
  | { readonly kind: 'brand-create' }
  | { readonly kind: 'brand-revision'; readonly brandId: string }
  | { readonly kind: 'media'; readonly brandId: string; readonly mediaKind: ContentMediaKind }
  | { readonly kind: 'item-create'; readonly brandId: string }
  | { readonly kind: 'item-revision'; readonly brandId: string; readonly itemId: string }
  | { readonly kind: 'prompt-create' }
  | { readonly kind: 'prompt-revision'; readonly promptId: string }
  | { readonly kind: 'prompt-lifecycle'; readonly promptId: string }
  | { readonly kind: 'campaign-create' }
  | { readonly kind: 'campaign-revision'; readonly campaignId: string }
  | { readonly kind: 'campaign-lifecycle'; readonly campaignId: string }
  | { readonly kind: 'insight-revision'; readonly campaignId: string }
  | { readonly kind: 'insight-lock'; readonly campaignId: string };

interface OwnerWriters {
  brand(serviceRequest: Record<string, unknown>, revision: boolean): Promise<OwnerContentBrandReceipt>;
  media(brandId: string, kind: ContentMediaKind, declaredType: string, bytes: Buffer): Promise<OwnerContentMediaReceipt>;
  item(serviceRequest: Record<string, unknown>, brandId: string, itemId: string | undefined): Promise<OwnerContentCatalogItemReceipt>;
  prompt(serviceRequest: Record<string, unknown>, promptId: string | undefined): Promise<OwnerContentPromptReceipt>;
  promptLifecycle(serviceRequest: Record<string, unknown>): Promise<OwnerContentPromptLifecycleReceipt>;
  campaign(serviceRequest: Record<string, unknown>, campaignId: string | undefined): Promise<OwnerContentCampaignReceipt>;
  campaignLifecycle(serviceRequest: Record<string, unknown>): Promise<OwnerContentCampaignLifecycleReceipt>;
  insightRevision(serviceRequest: Record<string, unknown>): Promise<OwnerContentInsightRevisionReceipt>;
  insightLock(serviceRequest: Record<string, unknown>): Promise<OwnerContentInsightLockReceipt>;
}

/** OWNER write paths for Content Studio (`/owner-api/content/*`). */
export function openContentOwnerApi(configuration: ContentOwnerApiConfiguration): ContentApiApplication {
  assertOwnerHttpConfiguration(configuration);
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertTables(db);
    const artifacts = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
    const clock = {
      ...(configuration.now ? { now: configuration.now } : {}),
      ...(configuration.uuid ? { uuid: configuration.uuid } : {}),
    };
    const brands = new ContentBrandService({ db, artifactStore: artifacts, ...clock });
    const catalog = new ContentCatalogService({ db, artifactStore: artifacts, ...clock });
    const media = new ContentMediaService({ db, artifactStore: artifacts, ...(configuration.now ? { now: configuration.now } : {}) });
    const library = new ContentPromptLibrary();
    const prompts = new ContentPromptService({ db, artifactStore: artifacts, library, ...clock });
    // Research workspaces are only read here, so their chain uses a plain store outside the request-scoped ownership.
    const research = openResearchReaders(db, new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot)));
    const campaigns = new ContentCampaignService({ db, artifactStore: artifacts, catalog, workspaceReader: research.productReader, ...clock });
    const insights = new ContentInsightService({
      db, artifactStore: artifacts, campaigns, lockedStpReader: research.stpReader, b10Reader: research.b10Reader,
      ...(configuration.now ? { now: configuration.now } : {}),
    });
    const brandExists = db.prepare('SELECT 1 FROM flow_content_brands WHERE brand_id = ?');
    const brandHistory = db.prepare('SELECT version FROM flow_content_brand_revisions WHERE brand_id = ? ORDER BY version');

    const integrity = async <T>(operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch { throw new ExistingContentIntegrityError(); }
    };
    const verifyBrandHistory = (brandId: string) => integrity(async () => {
      const rows = brandHistory.all(brandId) as { version: bigint }[];
      for (const [index, row] of rows.entries()) {
        if (row.version !== BigInt(index + 1)) throw new Error('Brand history is not sequential');
        await brands.readBrand(brandId, index + 1);
      }
    });
    const verifyItemHistory = (itemId: string) => integrity(async () => {
      for (const [index, version] of catalog.itemVersions(itemId).entries()) {
        if (version !== index + 1) throw new Error('Catalog history is not sequential');
        await catalog.readItem(itemId, version);
      }
    });
    const verifyPromptHistory = (promptId: string) => integrity(async () => {
      for (const [index, version] of prompts.promptVersions(promptId).entries()) {
        if (version !== index + 1) throw new Error('Prompt history is not sequential');
        await prompts.readPrompt(promptId, version);
      }
    });
    const verifyCampaignHistory = (campaignId: string) => integrity(async () => {
      for (const [index, version] of campaigns.campaignVersions(campaignId).entries()) {
        if (version !== index + 1) throw new Error('Campaign history is not sequential');
        await campaigns.readCampaign(campaignId, version);
      }
    });
    const verifyInsightHistory = (campaignId: string) => integrity(async () => {
      for (const [index, row] of insights.history(campaignId).entries()) {
        if (row.version !== index + 1) throw new Error('Insight history is not sequential');
        await insights.readInsight(campaignId, row.version);
      }
      await insights.readLock(campaignId);
    });
    const attempts = createContentAiAttemptService({
      db, gateway: configuration.gateway ?? disabledCreativeGateway(), artifactRoot: path.resolve(configuration.artifactRoot),
      clock: configuration.now ?? (() => new Date()), newId: configuration.uuid ?? randomUUID,
    });
    // Idea generation runs outside request-scoped ownership, so its artifacts go straight to the shared store.
    const ideas = new ContentIdeaService({
      db, artifactStore: artifacts, attempts, campaigns, insights, catalog, prompts, library,
      ...(configuration.now ? { now: configuration.now } : {}),
      ...(configuration.uuid ? { newId: configuration.uuid } : {}),
    });
    const verifyCampaignInputs = async (campaignId: string) => { await verifyCampaignHistory(campaignId); await verifyInsightHistory(campaignId); };
    const ideaWriters = createContentIdeaOwnerWriters({ db, ideas, campaigns, integrity, verifyCampaignInputs });
    const packages = new ContentPackageService({
      db, artifactStore: artifacts, attempts, campaigns, insights, catalog, prompts, library, brands, media, ideas,
      ...(configuration.now ? { now: configuration.now } : {}),
      ...(configuration.uuid ? { newId: configuration.uuid } : {}),
    });
    const packageWriters = createContentPackageOwnerWriters({ db, packages, ideas, campaigns, integrity, verifyCampaignInputs });
    const assertPromptReferences = (type: ContentPromptType, prompt: ContentPromptContent, lineage: ContentPromptLineage | undefined) => {
      try { assertContentPromptContent(type, prompt); } catch { throw new InvalidPromptRequestError(); }
      if (!lineage) return;
      const known = lineage.kind === 'SYSTEM'
        ? library.find(lineage.id, lineage.version)?.promptType === type
        : prompts.promptTypeOf(lineage.id) === type && prompts.promptVersions(lineage.id).includes(lineage.version);
      if (!known) throw new InvalidPromptRequestError();
    };
    const verifyMedia = async (brandId: string, kind: ContentMediaKind, digests: readonly string[]) => {
      for (const digest of digests) if (!registeredContentMedia(db, brandId, kind, digest)) throw new InvalidReferenceError();
      await integrity(async () => { for (const digest of digests) await media.verifyRegistered(brandId, kind, digest); });
    };

    const writers: OwnerWriters = {
      brand: (serviceRequest, revision) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (revision && !brandExists.get(serviceRequest.brandId)) throw new UnknownBrandError();
        await brands.restoreExactArtifact(serviceRequest);
        if (revision) {
          await verifyBrandHistory(serviceRequest.brandId as string);
          if (typeof serviceRequest.logoMediaSha256 === 'string') await verifyMedia(serviceRequest.brandId as string, 'LOGO', [serviceRequest.logoMediaSha256]);
        }
        const result = revision ? await brands.reviseBrand(serviceRequest) : await brands.createBrand(serviceRequest);
        if (!revision && result.deduplicated) await verifyBrandHistory(result.brandId);
        await artifacts.publishOwned();
        const verified = await integrity(() => brands.readBrand(result.brandId, result.version));
        return {
          contractVersion: '1.0.0', brandId: verified.brandId, brandKey: verified.brandKey, version: verified.version,
          brandName: verified.profile.brandName, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      media: (brandId, kind, declaredType, bytes) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (!brandExists.get(brandId)) throw new UnknownBrandError();
        await verifyBrandHistory(brandId);
        const result = await media.registerMedia({ brandId, kind, declaredType, bytes });
        await artifacts.publishOwned();
        await integrity(() => media.verifyRegistered(brandId, kind, result.mediaSha256));
        return {
          contractVersion: '1.0.0', brandId, mediaKind: kind, mediaSha256: result.mediaSha256, mediaType: result.mediaType,
          width: result.width, height: result.height, byteSize: result.byteSize, exactRetry: result.exactRetry,
        };
      })),
      item: (serviceRequest, brandId, itemId) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (!brandExists.get(brandId)) throw new UnknownBrandError();
        if (itemId !== undefined && catalog.itemBrand(itemId) !== brandId) throw new UnknownItemError();
        await verifyBrandHistory(brandId);
        await catalog.restoreExactArtifact(serviceRequest);
        if (itemId !== undefined) await verifyItemHistory(itemId);
        const content = serviceRequest.item as ContentCatalogItemContent;
        await verifyMedia(brandId, 'PHOTO', content.photos.map((photo) => photo.mediaSha256));
        const result = itemId === undefined ? await catalog.createItem(serviceRequest) : await catalog.reviseItem(serviceRequest);
        if (itemId === undefined && result.deduplicated) await verifyItemHistory(result.itemId);
        await artifacts.publishOwned();
        const verified = await integrity(() => catalog.readItem(result.itemId, result.version));
        return {
          contractVersion: '1.0.0', brandId: verified.brandId, itemId: verified.itemId, itemKey: verified.itemKey, version: verified.version,
          name: verified.item.name, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      prompt: (serviceRequest, promptId) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        const type = promptId === undefined ? serviceRequest.promptType as ContentPromptType : prompts.promptTypeOf(promptId);
        if (!type) throw new UnknownPromptError();
        assertPromptReferences(type, serviceRequest.prompt as ContentPromptContent, serviceRequest.duplicatedFrom as ContentPromptLineage | undefined);
        await prompts.restoreExactArtifact(serviceRequest);
        if (promptId !== undefined) await verifyPromptHistory(promptId);
        const lineage = serviceRequest.duplicatedFrom as ContentPromptLineage | undefined;
        if (lineage?.kind === 'USER') await integrity(() => prompts.readPrompt(lineage.id, lineage.version));
        if (lineage?.kind === 'SYSTEM') await integrity(async () => library.read(lineage.id, lineage.version));
        const result = promptId === undefined ? await prompts.createPrompt(serviceRequest) : await prompts.revisePrompt(serviceRequest);
        if (promptId === undefined && result.deduplicated) await verifyPromptHistory(result.promptId);
        await artifacts.publishOwned();
        const verified = await integrity(() => prompts.readPrompt(result.promptId, result.version));
        return {
          contractVersion: '1.0.0', promptId: verified.promptId, promptKey: verified.promptKey, promptType: verified.promptType, version: verified.version,
          name: verified.prompt.name, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      promptLifecycle: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
        const promptId = serviceRequest.promptId as string;
        if (!prompts.promptExists(promptId)) throw new UnknownPromptError();
        await verifyPromptHistory(promptId);
        const result = await prompts.changeLifecycle(serviceRequest);
        return {
          contractVersion: '1.0.0', promptId: result.promptId, sequence: result.sequence, action: result.action, createdAt: result.createdAt,
          ...(result.restorableUntil ? { restorableUntil: result.restorableUntil } : {}), exactRetry: result.deduplicated,
        };
      }),
      campaign: (serviceRequest, campaignId) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        if (campaignId !== undefined && !campaigns.campaignExists(campaignId)) throw new UnknownCampaignError();
        const brandId = campaignId === undefined ? serviceRequest.brandId as string : campaigns.campaignBrand(campaignId);
        if (brandId === undefined || !brandExists.get(brandId)) throw new UnknownBrandError();
        await verifyBrandHistory(brandId);
        await campaigns.restoreExactArtifact(serviceRequest);
        if (campaignId !== undefined) await verifyCampaignHistory(campaignId);
        // Items of other brands are refused by the service as bad references; items of this brand must verify first.
        const content = serviceRequest.campaign as ContentCampaignContent;
        for (const ref of content.items) if (catalog.itemBrand(ref.itemId) === brandId) await verifyItemHistory(ref.itemId);
        const result = campaignId === undefined ? await campaigns.createCampaign(serviceRequest) : await campaigns.reviseCampaign(serviceRequest);
        if (campaignId === undefined && result.deduplicated) await verifyCampaignHistory(result.campaignId);
        await artifacts.publishOwned();
        const verified = await integrity(() => campaigns.readCampaign(result.campaignId, result.version));
        return {
          contractVersion: '1.0.0', campaignId: verified.campaignId, campaignKey: verified.campaignKey, brandId: verified.brandId, version: verified.version,
          name: verified.campaign.name, createdAt: verified.createdAt, exactRetry: result.deduplicated,
        };
      })),
      campaignLifecycle: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
        const campaignId = serviceRequest.campaignId as string;
        if (!campaigns.campaignExists(campaignId)) throw new UnknownCampaignError();
        await verifyCampaignHistory(campaignId);
        const result = await campaigns.changeLifecycle(serviceRequest);
        return {
          contractVersion: '1.0.0', campaignId: result.campaignId, sequence: result.sequence, action: result.action, createdAt: result.createdAt,
          ...(result.restorableUntil ? { restorableUntil: result.restorableUntil } : {}), exactRetry: result.deduplicated,
        };
      }),
      insightRevision: (serviceRequest) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        const campaignId = serviceRequest.campaignId as string;
        if (!campaigns.campaignExists(campaignId)) throw new UnknownCampaignError();
        await insights.restoreExactArtifact(serviceRequest);
        await verifyCampaignHistory(campaignId);
        await verifyInsightHistory(campaignId);
        const result = await insights.reviseInsight(serviceRequest);
        await artifacts.publishOwned();
        const verified = await integrity(() => insights.readInsight(campaignId, result.version));
        return { contractVersion: '1.0.0', campaignId, version: verified.version, createdAt: verified.createdAt, exactRetry: result.deduplicated };
      })),
      insightLock: (serviceRequest) => withDatabaseMutationMutex(db, () => artifacts.withOwnership(async () => {
        const campaignId = serviceRequest.campaignId as string;
        if (!campaigns.campaignExists(campaignId)) throw new UnknownCampaignError();
        await insights.restoreExactArtifact(serviceRequest);
        await verifyCampaignHistory(campaignId);
        await verifyInsightHistory(campaignId);
        const result = await insights.lockInsight(serviceRequest);
        await artifacts.publishOwned();
        const verified = await integrity(async () => {
          const lock = await insights.readLock(campaignId);
          if (!lock) throw new Error('Insight lock is missing after commit');
          return lock;
        });
        return {
          contractVersion: '1.0.0', campaignId, insightVersion: verified.insightVersion, campaignVersion: verified.campaignVersion,
          lockedAt: verified.lockedAt, exactRetry: result.deduplicated,
        };
      })),
    };

    const handler = (request: IncomingMessage, response: ServerResponse): void => { void routeOwner(request, response, configuration, writers, ideaWriters, packageWriters); };
    return { handler, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

function ownerRoute(parts: string[] | null): OwnerRoute | 'invalid-id' | null {
  if (parts !== null && parts[0] === 'owner-api' && parts[1] === 'content' && parts[2] === 'campaigns') {
    if (parts.length === 3) return { kind: 'campaign-create' };
    if (parts.length === 6 && parts[4] === 'insight' && (parts[5] === 'revisions' || parts[5] === 'lock')) {
      if (!UUID.test(parts[3]!)) return 'invalid-id';
      return parts[5] === 'revisions' ? { kind: 'insight-revision', campaignId: parts[3]! } : { kind: 'insight-lock', campaignId: parts[3]! };
    }
    if (parts.length !== 5 || (parts[4] !== 'revisions' && parts[4] !== 'lifecycle')) return null;
    if (!UUID.test(parts[3]!)) return 'invalid-id';
    return parts[4] === 'revisions' ? { kind: 'campaign-revision', campaignId: parts[3]! } : { kind: 'campaign-lifecycle', campaignId: parts[3]! };
  }
  if (parts !== null && parts[0] === 'owner-api' && parts[1] === 'content' && parts[2] === 'prompts') {
    if (parts.length === 3) return { kind: 'prompt-create' };
    if (parts.length !== 5 || (parts[4] !== 'revisions' && parts[4] !== 'lifecycle')) return null;
    if (!UUID.test(parts[3]!)) return 'invalid-id';
    return parts[4] === 'revisions' ? { kind: 'prompt-revision', promptId: parts[3]! } : { kind: 'prompt-lifecycle', promptId: parts[3]! };
  }
  if (parts === null || parts[0] !== 'owner-api' || parts[1] !== 'content' || parts[2] !== 'brands') return null;
  if (parts.length === 3) return { kind: 'brand-create' };
  const brandId = parts[3]!;
  const shape = parts.slice(4).join('/');
  const known = shape === 'revisions' || shape === 'catalog' || (parts.length === 6 && parts[4] === 'media' && parts[5]! in MEDIA_KINDS) || (parts.length === 7 && parts[4] === 'catalog' && parts[6] === 'revisions');
  if (!known) return null;
  if (!UUID.test(brandId)) return 'invalid-id';
  if (shape === 'revisions') return { kind: 'brand-revision', brandId };
  if (shape === 'catalog') return { kind: 'item-create', brandId };
  if (parts[4] === 'media') return { kind: 'media', brandId, mediaKind: MEDIA_KINDS[parts[5]!]! };
  if (!UUID.test(parts[5]!)) return 'invalid-id';
  return { kind: 'item-revision', brandId, itemId: parts[5]! };
}

async function routeOwner(request: IncomingMessage, response: ServerResponse, configuration: ContentOwnerApiConfiguration, writers: OwnerWriters, ideaWriters: ContentIdeaOwnerWriters, packageWriters: ContentPackageOwnerWriters): Promise<void> {
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== configuration.allowedOrigin) return sendOwnerError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) ownerCors(response, origin);
  const parts = pathParts(request.url);
  const ideaRoute = contentIdeaOwnerRoute(parts);
  const packageRoute = contentPackageOwnerRoute(parts);
  const route = ideaRoute ?? packageRoute ?? ownerRoute(parts);
  if (route === null) return sendOwnerError(response, 404, 'not_found', 'Route not found');
  if (route === 'invalid-id') return sendOwnerError(response, 400, 'bad_request', 'Route IDs must be UUIDs');
  if (request.method === 'OPTIONS') {
    if (!origin || singleHeader(request.headers['access-control-request-method']) !== 'POST' || singleHeader(request.headers['access-control-request-headers'])?.toLowerCase() !== 'authorization, content-type') return sendOwnerError(response, 403, 'forbidden', 'Preflight is not allowed');
    response.writeHead(204, { Allow: 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Content-Length': '0' }); response.end(); return;
  }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); return sendOwnerError(response, 405, 'method_not_allowed', 'Only POST is supported'); }
  if (!ownerAuthorized(request, configuration.token)) return sendOwnerError(response, 401, 'unauthorized', 'Authentication required', { 'WWW-Authenticate': 'Bearer' });
  if (ideaRoute !== null && ideaRoute !== 'invalid-id') return routeContentIdeaOwner(request, response, ideaRoute, ideaWriters);
  if (packageRoute !== null && packageRoute !== 'invalid-id') return routeContentPackageOwner(request, response, packageRoute, packageWriters);
  if (route.kind === 'idea-generate' || route.kind === 'idea-state' || route.kind === 'purpose-tag'
    || route.kind === 'package-create' || route.kind === 'package-defaults' || route.kind === 'package-generate' || route.kind === 'package-version' || route.kind === 'package-state') return sendOwnerError(response, 404, 'not_found', 'Route not found');
  const contentType = singleHeader(request.headers['content-type']);
  try {
    if (route.kind === 'media') {
      if (!contentType?.startsWith('image/')) return sendOwnerError(response, 400, 'bad_request', 'Content-Type must be image/png or image/jpeg');
      const bytes = await readOwnerBytes(request, CONTENT_MEDIA_LIMITS[route.mediaKind].maxBytes);
      const receipt = await writers.media(route.brandId, route.mediaKind, contentType, bytes);
      return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
    }
    if (contentType !== 'application/json') return sendOwnerError(response, 400, 'bad_request', 'Content-Type must be application/json');
    const catalogRoute = route.kind === 'item-create' || route.kind === 'item-revision';
    const promptRoute = route.kind === 'prompt-create' || route.kind === 'prompt-revision' || route.kind === 'prompt-lifecycle';
    const campaignRoute = route.kind === 'campaign-create' || route.kind === 'campaign-revision' || route.kind === 'campaign-lifecycle' || route.kind === 'insight-revision' || route.kind === 'insight-lock';
    const raw = (await readOwnerBytes(request, campaignRoute ? CAMPAIGN_BODY_BYTES : promptRoute ? PROMPT_BODY_BYTES : catalogRoute ? CATALOG_BODY_BYTES : BRAND_BODY_BYTES)).toString('utf8');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendOwnerError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
    const fields = body as Record<string, unknown>;
    const optional = route.kind === 'brand-revision' ? 'logoMediaSha256' : route.kind === 'prompt-create' ? 'duplicatedFrom' : undefined;
    const keys = Object.keys(fields).filter((key) => key !== optional).sort().join(',');
    const expectedKeys = {
      'brand-create': 'brandKey,contractVersion,displayRules,profile',
      'brand-revision': 'contractVersion,displayRules,expectedVersion,profile',
      'item-create': 'contractVersion,item,itemKey',
      'item-revision': 'contractVersion,expectedVersion,item',
      'prompt-create': 'contractVersion,prompt,promptKey,promptType',
      'prompt-revision': 'contractVersion,expectedVersion,prompt',
      'prompt-lifecycle': 'action,contractVersion,expectedSequence',
      'campaign-create': 'brandId,campaign,campaignKey,contractVersion',
      'campaign-revision': 'campaign,contractVersion,expectedVersion',
      'campaign-lifecycle': 'action,contractVersion,expectedSequence',
      'insight-revision': 'contractVersion,expectedVersion,insight',
      'insight-lock': 'campaignVersion,contractVersion,insightVersion',
    }[route.kind];
    if (keys !== expectedKeys) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
    const serviceRequest = route.kind === 'brand-create' || route.kind === 'prompt-create' || route.kind === 'campaign-create' ? { ...fields }
      : route.kind === 'brand-revision' || route.kind === 'item-create' ? { ...fields, brandId: route.brandId }
      : route.kind === 'item-revision' ? { ...fields, itemId: route.itemId }
      : route.kind === 'campaign-revision' || route.kind === 'campaign-lifecycle' || route.kind === 'insight-revision' || route.kind === 'insight-lock' ? { ...fields, campaignId: route.campaignId }
      : { ...fields, promptId: route.promptId };
    try {
      if (route.kind === 'brand-create') validateContentBrandCreateRequest(serviceRequest);
      else if (route.kind === 'brand-revision') validateContentBrandRevisionRequest(serviceRequest);
      else if (route.kind === 'item-create') validateContentCatalogItemCreateRequest(serviceRequest);
      else if (route.kind === 'item-revision') validateContentCatalogItemRevisionRequest(serviceRequest);
      else if (route.kind === 'prompt-create') validateContentPromptCreateRequest(serviceRequest);
      else if (route.kind === 'prompt-revision') validateContentPromptRevisionRequest(serviceRequest);
      else if (route.kind === 'campaign-create') validateContentCampaignCreateRequest(serviceRequest);
      else if (route.kind === 'campaign-revision') validateContentCampaignRevisionRequest(serviceRequest);
      else if (route.kind === 'campaign-lifecycle') validateContentCampaignLifecycleRequest(serviceRequest);
      else if (route.kind === 'insight-revision') validateContentInsightRevisionRequest(serviceRequest);
      else if (route.kind === 'insight-lock') validateContentInsightLockRequest(serviceRequest);
      else validateContentPromptLifecycleRequest(serviceRequest);
    } catch (error) {
      if (error instanceof FlowValidationError) return sendOwnerError(response, 400, 'bad_request', 'Invalid request');
      throw error;
    }
    const receipt = route.kind === 'brand-create' || route.kind === 'brand-revision' ? await writers.brand(serviceRequest, route.kind === 'brand-revision')
      : route.kind === 'item-create' || route.kind === 'item-revision' ? await writers.item(serviceRequest, route.brandId, route.kind === 'item-revision' ? route.itemId : undefined)
      : route.kind === 'campaign-create' || route.kind === 'campaign-revision' ? await writers.campaign(serviceRequest, route.kind === 'campaign-revision' ? route.campaignId : undefined)
      : route.kind === 'campaign-lifecycle' ? await writers.campaignLifecycle(serviceRequest)
      : route.kind === 'insight-revision' ? await writers.insightRevision(serviceRequest)
      : route.kind === 'insight-lock' ? await writers.insightLock(serviceRequest)
      : route.kind === 'prompt-lifecycle' ? await writers.promptLifecycle(serviceRequest)
      : await writers.prompt(serviceRequest, route.kind === 'prompt-revision' ? route.promptId : undefined);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return sendOwnerError(response, 400, 'bad_request', 'Request body is too large', {}, route.kind === 'media' ? 'too_large' : undefined);
    if (error instanceof EmptyBodyError) return sendOwnerError(response, 400, 'bad_request', 'Request body is required');
    if (error instanceof ContentImageError) return sendOwnerError(response, 400, 'bad_request', 'Image was rejected', {}, error.code);
    if (error instanceof UnknownBrandError) return sendOwnerError(response, 404, 'not_found', 'Brand not found');
    if (error instanceof UnknownItemError) return sendOwnerError(response, 404, 'not_found', 'Catalog item not found');
    if (error instanceof InvalidReferenceError) return sendOwnerError(response, 400, 'bad_request', 'Referenced media is not registered for this brand');
    if (error instanceof UnknownPromptError) return sendOwnerError(response, 404, 'not_found', 'Prompt not found');
    if (error instanceof InvalidPromptRequestError) return sendOwnerError(response, 400, 'bad_request', 'Invalid prompt request');
    if (error instanceof UnknownCampaignError) return sendOwnerError(response, 404, 'not_found', 'Campaign not found');
    if (error instanceof ContentCampaignReferenceError) return sendOwnerError(response, 400, 'bad_request', 'Invalid campaign reference');
    if (error instanceof ContentCampaignConflictError && /drift|changed content|deleted|restore window/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    if (error instanceof ContentInsightGateError) return sendOwnerError(response, 409, 'conflict', error.reason);
    if (error instanceof ContentInsightReferenceError) return sendOwnerError(response, 400, 'bad_request', 'Invalid insight reference');
    if (error instanceof ContentInsightConflictError && /drift|changed content|deleted|locked/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    if (error instanceof ContentPromptConflictError && /drift|changed content|deleted|restore window/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    if ((error instanceof ContentBrandIdentityConflictError || error instanceof ContentCatalogIdentityConflictError) && /changed content|drift/i.test(error.message)) return sendOwnerError(response, 409, 'conflict', 'Request conflicts with current state');
    return sendOwnerError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

function pathParts(raw: string | undefined): string[] | null {
  if (!raw || /%(?:2e|2f|5c)/i.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, 'http://content-api.local'); } catch { return null; }
  if (url.search || url.hash || url.pathname.includes('//')) return null;
  let parts: string[];
  try { parts = url.pathname.split('/').slice(1).map((part) => decodeURIComponent(part)); } catch { return null; }
  if (parts.some((part) => part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0'))) return null;
  return parts;
}

function assertTables(db: BetterSqlite3.Database): void {
  const names = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(({ name }) => name));
  if (REQUIRED_TABLES.some((name) => !names.has(name))) throw new Error('Database is missing required content tables');
}

function sendReadError(response: ServerResponse, status: number, code: ContentApiErrorResponse['error']['code'], message: string): void {
  sendApiJson(response, status, { error: { code, message } } satisfies ContentApiErrorResponse);
}

function sendOwnerError(response: ServerResponse, status: number, code: OwnerContentApiErrorResponse['error']['code'], message: string, extra: Record<string, string> = {}, reason?: OwnerContentMediaRejection): void {
  sendApiJson(response, status, { error: { code, message, ...(reason === undefined ? {} : { reason }) } }, extra);
}
