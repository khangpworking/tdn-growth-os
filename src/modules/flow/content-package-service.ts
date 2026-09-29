import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentBrandArtifact } from '../../../contracts/flow/content-brand-artifact.generated.js';
import type { ContentCampaignPackageDefaults } from '../../../contracts/flow/content-campaign-defaults-request.generated.js';
import type { ContentIdeaPromptUsed } from '../../../contracts/flow/content-idea-artifact.generated.js';
import type { ContentPackageArtifact } from '../../../contracts/flow/content-package-artifact.generated.js';
import type {
  ContentCaptionLength,
  ContentCaptionStyle,
  ContentIdeaPromptChoice,
  ContentPackageCreateRequest,
} from '../../../contracts/flow/content-package-create-request.generated.js';
import type { ContentPackageGenerateRequest, ContentPackagePart } from '../../../contracts/flow/content-package-generate-request.generated.js';
import type { ContentPackageStateAction } from '../../../contracts/flow/content-package-state-request.generated.js';
import type {
  ContentCaptionVersionBody,
  ContentPackageVersionArtifact,
  ContentPackageVersionSource,
  ContentPosterVersionBody,
} from '../../../contracts/flow/content-package-version-artifact.generated.js';
import type { ContentPackageVersionRequest } from '../../../contracts/flow/content-package-version-request.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { ContentAiAttemptConflictError, type ContentAiAttemptService } from './content-ai-attempt-service.js';
import {
  assertContentManifest,
  assertContentUuid,
  canonicalBytes,
  canonicalDigest,
  canonicalSnapshot,
  readCanonicalJsonArtifact,
  registerContentManifest,
  sha256,
} from './content-artifacts.js';
import { brandFactCheck } from './content-brand-fact-check.js';
import type { ContentBrandService } from './content-brand-service.js';
import type { ContentCampaignService } from './content-campaign-service.js';
import type { ContentCatalogService } from './content-catalog-service.js';
import {
  captionBrandContext,
  captionFooter,
  captionText,
  ContentDisplayRuleError,
  posterBrandData,
  purposeKinds,
  resolveBrandLevels,
  resolveCaptionDisplay,
  resolvePosterDisplay,
} from './content-display-rules.js';
import { FREESTYLE_PROMPT_NAME, letterCode, type ContentIdeaService } from './content-idea-service.js';
import type { ContentInsightService } from './content-insight-service.js';
import type { ContentMediaService } from './content-media-service.js';
import { buildPosterPrompt, planPosterReferences } from './content-poster-prompt.js';
import type { ContentPromptLibrary } from './content-prompt-library.js';
import { restoreDeadline, type ContentPromptService } from './content-prompt-service.js';
import {
  FlowValidationError,
  validateContentCampaignDefaultsRequest,
  validateContentPackageArtifact,
  validateContentPackageCreateRequest,
  validateContentPackageGenerateRequest,
  validateContentPackageStateRequest,
  validateContentPackageVersionArtifact,
  validateContentPackageVersionRequest,
} from './validation.js';

export class ContentPackageConflictError extends Error {}

/** Committed package data no longer matches its row, attempt, pin or artifact; reads fail closed. */
export class ContentPackageIntegrityError extends Error {}

/** An Angle, prompt, photo or logo named by the request does not exist or does not fit. */
export class ContentPackageReferenceError extends Error {}

export const PACKAGE_TARGET_TYPES: Readonly<Record<ContentPackagePart, string>> = { CAPTION: 'content_caption', POSTER: 'content_poster' };
export const PACKAGE_BATCH_LIMIT = 20;
export const PACKAGE_TICKED_REFERENCE_LIMIT = 8;
export const PREVIOUS_POSTS_LIMIT = 10;
export const STYLE_LABELS: Readonly<Record<ContentCaptionStyle, string>> = { PROFESSIONAL: 'Chuyên nghiệp', FRIENDLY: 'Thân thiện' };
export const LENGTH_WORDS: Readonly<Record<ContentCaptionLength, string>> = { SHORT: '80–120 từ', MEDIUM: '120–180 từ', LONG: '180–250 từ' };
const FACEBOOK = 'Facebook';
const CODE_SEPARATOR = '·';

/** Strict caption output schema checked by the attempt service (Ajv, code-point lengths). */
export const CAPTION_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  type: 'object', additionalProperties: false, required: ['post'],
  properties: { post: { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' } },
});
const CAPTION_FORMAT = Object.freeze({ name: 'caption', jsonSchema: { type: 'object', additionalProperties: false, required: ['post'], properties: { post: { type: 'string' } } } });

export interface ContentPackageCreated { readonly packageId: string; readonly angleId: string; readonly code: string; readonly createdAt: string }

export interface ContentPackageCreateExecution {
  readonly campaignId: string;
  readonly requestId: string;
  readonly packages: readonly ContentPackageCreated[];
  readonly deduplicated: boolean;
}

export interface ContentPackageVersionExecution {
  readonly packageId: string;
  readonly part: ContentPackagePart;
  readonly version: number;
  readonly source: ContentPackageVersionSource;
  readonly attemptId?: string;
  readonly createdAt: string;
  readonly deduplicated: boolean;
}

export interface ContentPackageState {
  readonly sequence: number;
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
  readonly expired: boolean;
  /** Q6: set when the package is hidden because its Angle or that Angle's Big Idea is deleted. */
  readonly hiddenBy?: { readonly ideaId: string; readonly deletedAt: string; readonly restorableUntil: string };
}

export interface ContentPackageStateExecution {
  readonly packageId: string;
  readonly sequence: number;
  readonly action: ContentPackageStateAction;
  readonly createdAt: string;
  readonly restorableUntil?: string;
  readonly deduplicated: boolean;
}

export interface ContentCampaignDefaultsExecution { readonly campaignId: string; readonly version: number; readonly createdAt: string; readonly deduplicated: boolean }
export interface ContentCampaignDefaults { readonly version: number; readonly defaults: ContentCampaignPackageDefaults; readonly createdAt: string }

export interface ContentPackageListEntry {
  readonly packageId: string;
  readonly angleId: string;
  readonly code: string;
  readonly deleted: boolean;
  readonly restorableUntil?: string;
  readonly hiddenByParent?: true;
  readonly stateSequence: number;
  readonly captionVersion: number;
  readonly posterVersion: number;
  readonly captionPreview?: string;
  readonly posterFormat: ContentPackageArtifact['poster']['format'];
  readonly createdAt: string;
}

export interface ContentPackageAttemptSummary {
  readonly attemptId: string;
  readonly part: ContentPackagePart;
  readonly state: string;
  readonly errorCode: string | null;
  readonly retryOf: string | null;
  readonly model: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
}

export interface ContentPackageDetail {
  readonly packageId: string;
  readonly campaignId: string;
  readonly angleId: string;
  readonly code: string;
  readonly pin: ContentPackageArtifact;
  readonly state: ContentPackageState;
  readonly caption: readonly ContentPackageVersionArtifact[];
  readonly poster: readonly ContentPackageVersionArtifact[];
  readonly attempts: readonly ContentPackageAttemptSummary[];
}

interface PackageRow {
  readonly packageId: string;
  readonly campaignId: string;
  readonly angleId: string;
  readonly ordinal: number;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

interface VersionRow {
  readonly packageId: string;
  readonly part: ContentPackagePart;
  readonly version: number;
  readonly source: ContentPackageVersionSource;
  readonly attemptId: string | null;
  readonly restoredFromVersion: number | null;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

interface StateRow {
  readonly sequence: number;
  readonly action: ContentPackageStateAction;
  readonly deleted: boolean;
  readonly requestSha256: string;
  readonly createdAt: string;
}

interface AttemptRow {
  readonly attemptId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly modality: string;
  readonly model: string;
  readonly providerModel: string | null;
  readonly state: string;
  readonly inputBundleSha256: string;
  readonly outputSha256: string | null;
}

interface PromptResolution { readonly prompt: ContentIdeaPromptUsed; readonly creativeText: string; readonly promptRef: string }
interface PinnedFacts { readonly campaign: Record<string, unknown>; readonly prices: readonly string[]; readonly photos: ReadonlySet<string> }

type PromptType = 'CAPTION' | 'POSTER';

/**
 * Caption and Poster packages (Task 051, B11 steps 6–7). A package pins every input for one Angle;
 * each part gains append-only versions: GENERATED (one audited AI attempt), MANUAL caption edits and
 * RESTORE copies. The current version of a part is its highest version.
 */
export class ContentPackageService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #attempts: ContentAiAttemptService;
  readonly #campaigns: ContentCampaignService;
  readonly #insights: ContentInsightService;
  readonly #catalog: ContentCatalogService;
  readonly #prompts: ContentPromptService;
  readonly #library: ContentPromptLibrary;
  readonly #brands: ContentBrandService;
  readonly #media: ContentMediaService;
  readonly #ideas: ContentIdeaService;
  readonly #now: () => Date;
  readonly #newId: () => string;
  readonly #inFlight = new Set<string>();

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly attempts: ContentAiAttemptService;
    readonly campaigns: ContentCampaignService;
    readonly insights: ContentInsightService;
    readonly catalog: ContentCatalogService;
    readonly prompts: ContentPromptService;
    readonly library: ContentPromptLibrary;
    readonly brands: ContentBrandService;
    readonly media: ContentMediaService;
    readonly ideas: ContentIdeaService;
    readonly now?: () => Date;
    readonly newId?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#attempts = options.attempts;
    this.#campaigns = options.campaigns;
    this.#insights = options.insights;
    this.#catalog = options.catalog;
    this.#prompts = options.prompts;
    this.#library = options.library;
    this.#brands = options.brands;
    this.#media = options.media;
    this.#ideas = options.ideas;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.newId ?? randomUUID;
  }

  // ---------------------------------------------------------------------------------------------
  // Create (no AI): one package per Angle row, all pins resolved now.

  async create(untrustedInput: unknown): Promise<ContentPackageCreateExecution> {
    const input = canonicalSnapshot(validateContentPackageCreateRequest(untrustedInput));
    if (input.rows.length > PACKAGE_BATCH_LIMIT) throw new FlowValidationError(`At most ${PACKAGE_BATCH_LIMIT} Angles per request`);
    if (new Set(input.rows.map((row) => row.angleId)).size !== input.rows.length) throw new FlowValidationError('Each Angle may appear once per request');
    const requestSha256 = canonicalDigest(input);
    const existing = this.#packageRows('request_id = ?', input.requestId);
    if (existing.length > 0) return this.#createRetry(input, requestSha256, existing);
    if (this.#inFlight.has(input.requestId)) throw new ContentPackageConflictError('This package request is already running');
    this.#inFlight.add(input.requestId);
    try {
      return await this.#create(input, requestSha256);
    } finally {
      this.#inFlight.delete(input.requestId);
    }
  }

  async #create(input: ContentPackageCreateRequest, requestSha256: string): Promise<ContentPackageCreateExecution> {
    if (!this.#campaigns.campaignExists(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const insightVersion = this.#assertCampaignOpen(input.campaignId);
    const campaign = await this.#campaigns.readCampaign(input.campaignId);
    const brand = await this.#brands.readBrand(campaign.brandId);
    const facts = await this.#pinnedFacts(input.campaignId, campaign.version, insightVersion, campaign.campaign.items);
    await this.#assertReferences(campaign.brandId, facts.photos, input.poster.referenceMediaSha256s);
    for (const row of input.rows) if (row.poster?.referenceMediaSha256s) await this.#assertReferences(campaign.brandId, facts.photos, row.poster.referenceMediaSha256s);
    const captionPrompt = await this.#promptChoice(input.caption.prompt, 'CAPTION');
    const posterPrompt = await this.#promptChoice(input.poster.prompt, 'POSTER');
    const tags = new Map(this.#ideas.purposeTags().map((tag) => [tag.tagId, tag.displayLike]));
    const createdAt = this.#now().toISOString();

    const staged: { artifact: ContentPackageArtifact; stored: StoredArtifact }[] = [];
    for (const row of input.rows) {
      const purposes = await this.#assertAngle(input.campaignId, row.angleId);
      let captionDisplay: ContentPackageArtifact['display']['caption'];
      let posterDisplay: ContentPackageArtifact['display']['poster'];
      try {
        const levels = resolveBrandLevels(brand.displayRules, purposeKinds(purposes, (tagId) => tags.get(tagId)));
        captionDisplay = resolveCaptionDisplay(levels, row.display?.caption);
        posterDisplay = resolvePosterDisplay(levels, input.poster.includeLogo, row.display?.poster);
      } catch (error) {
        if (error instanceof ContentDisplayRuleError) throw new ContentPackageReferenceError(error.message);
        throw error;
      }
      const plan = planPosterReferences(input.poster.model, row.poster?.referenceMediaSha256s ?? input.poster.referenceMediaSha256s, posterDisplay.logo, brand.logoMediaSha256);
      if (plan.logo !== undefined) await this.#media.verifyRegistered(campaign.brandId, 'LOGO', plan.logo);
      const packageId = this.#newId();
      assertContentUuid(packageId);
      const artifact: ContentPackageArtifact = {
        contractVersion: '1.0.0', packageId, campaignId: input.campaignId, campaignVersion: campaign.version, angleId: row.angleId, insightVersion,
        brand: { brandId: brand.brandId, version: brand.version },
        items: campaign.campaign.items.map((item) => ({ itemId: item.itemId, itemVersion: item.itemVersion, ...(item.tierKeys !== undefined ? { tierKeys: [...item.tierKeys] } : {}) })),
        requestId: input.requestId, requestSha256, purposes: [...purposes],
        display: { caption: captionDisplay, poster: posterDisplay },
        caption: { prompt: captionPrompt.prompt, model: input.caption.model, style: row.caption?.style ?? input.caption.style, length: row.caption?.length ?? input.caption.length },
        poster: {
          prompt: posterPrompt.prompt, model: input.poster.model, format: input.poster.format, referenceMediaSha256s: [...plan.photos], includeLogo: input.poster.includeLogo,
          ...(plan.logo !== undefined ? { logoMediaSha256: plan.logo } : {}),
        },
        footer: captionFooter(brand.profile, captionDisplay),
        createdAt,
      };
      const stored = await this.#artifacts.put(canonicalBytes(validateContentPackageArtifact(artifact)));
      staged.push({ artifact, stored });
    }

    const execute = this.#db.transaction((): ContentPackageCreateExecution => {
      if (this.#packageRows('request_id = ?', input.requestId).length > 0) throw new ContentPackageConflictError('Package request was committed concurrently');
      if (this.#assertCampaignOpen(input.campaignId) !== insightVersion) throw new ContentPackageConflictError('Insight lock changed while creating packages');
      if (Math.max(...this.#campaigns.campaignVersions(input.campaignId)) !== campaign.version) throw new ContentPackageConflictError('Campaign changed while creating packages');
      const packages: ContentPackageCreated[] = [];
      for (const { artifact, stored } of staged) {
        if (this.#ancestorDeletion(artifact.angleId)) throw new ContentPackageConflictError('Angle was deleted while creating packages');
        const ordinal = this.#nextOrdinal(artifact.angleId);
        registerContentManifest(this.#db, stored, createdAt, 'application/json');
        this.#db.prepare(`
          INSERT INTO flow_content_packages(package_id, campaign_id, angle_id, ordinal, request_id, request_sha256, package_artifact_sha256, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(artifact.packageId, input.campaignId, artifact.angleId, ordinal, input.requestId, requestSha256, stored.sha256, createdAt);
        packages.push({ packageId: artifact.packageId, angleId: artifact.angleId, code: this.#code(artifact.angleId, ordinal), createdAt });
      }
      return { campaignId: input.campaignId, requestId: input.requestId, packages, deduplicated: false };
    });
    return execute();
  }

  async #createRetry(input: ContentPackageCreateRequest, requestSha256: string, rows: readonly PackageRow[]): Promise<ContentPackageCreateExecution> {
    if (rows.some((row) => row.requestSha256 !== requestSha256 || row.campaignId !== input.campaignId)) throw new ContentPackageConflictError('Package request id was already used with changed content');
    const order = new Map(input.rows.map((row, index) => [row.angleId, index]));
    const packages: ContentPackageCreated[] = [];
    for (const row of [...rows].sort((a, b) => (order.get(a.angleId) ?? 0) - (order.get(b.angleId) ?? 0))) {
      await this.#verifiedPackage(row);
      packages.push({ packageId: row.packageId, angleId: row.angleId, code: this.#code(row.angleId, row.ordinal), createdAt: row.createdAt });
    }
    return { campaignId: input.campaignId, requestId: input.requestId, packages, deduplicated: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Generate one part (one AI attempt, one new version).

  async generate(untrustedInput: unknown, actorId: string): Promise<ContentPackageVersionExecution> {
    const input = canonicalSnapshot(validateContentPackageGenerateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const existing = this.#versionByRequest(input.requestId);
    if (existing) {
      if (existing.requestSha256 !== requestSha256 || existing.source !== 'GENERATED') throw new ContentPackageConflictError('Version request id was already used with changed content');
      await this.#verifiedVersion(existing);
      return versionExecution(existing, true);
    }
    const slot = `${input.packageId}:${input.part}`;
    if (this.#inFlight.has(input.requestId) || this.#inFlight.has(slot)) throw new ContentPackageConflictError('A generation for this part is already running');
    this.#inFlight.add(input.requestId);
    this.#inFlight.add(slot);
    try {
      return await this.#generate(input, requestSha256, actorId);
    } catch (error) {
      if (error instanceof ContentAiAttemptConflictError) throw new ContentPackageConflictError('This generation request is already running');
      throw error;
    } finally {
      this.#inFlight.delete(input.requestId);
      this.#inFlight.delete(slot);
    }
  }

  async #generate(input: ContentPackageGenerateRequest, requestSha256: string, actorId: string): Promise<ContentPackageVersionExecution> {
    const row = this.#package(input.packageId);
    if (!row) throw new FlowValidationError(`Package not found: ${input.packageId}`);
    this.#assertPackageOpen(row);
    const { pin, brand } = await this.#verifiedPackage(row);
    const version = this.#currentVersion(row.packageId, input.part) + 1;
    if (input.retryOfAttemptId !== undefined) {
      const retried = this.#attempt(input.retryOfAttemptId);
      if (!retried || retried.targetId !== row.packageId || retried.targetType !== PACKAGE_TARGET_TYPES[input.part] || (retried.state !== 'failed' && retried.state !== 'interrupted')) {
        throw new ContentPackageReferenceError('retryOfAttemptId must name a failed or interrupted attempt of this part');
      }
    }
    this.#assertNoUncommittedProviderResult(PACKAGE_TARGET_TYPES[input.part], row.packageId, input.part, input.retryOfAttemptId);
    const common = {
      kind: 'generate' as const, targetType: PACKAGE_TARGET_TYPES[input.part], targetId: row.packageId,
      plannedActionCallCount: input.plannedCallCount, actorId,
      ...(input.retryOfAttemptId !== undefined ? { retryOf: input.retryOfAttemptId } : {}),
    };
    const persist = (staged: { stored: StoredArtifact; artifact: ContentPackageVersionArtifact } | undefined, attemptId: string): ContentPackageVersionExecution => {
      if (!staged) throw new ContentPackageIntegrityError('Version artifact was not staged');
      if (this.#versionByRequest(input.requestId)) throw new ContentPackageConflictError('Version request was committed concurrently');
      this.#assertPackageOpen(row);
      if (this.#currentVersion(row.packageId, input.part) !== version - 1) throw new ContentPackageConflictError('Part version changed during generation');
      registerContentManifest(this.#db, staged.stored, staged.artifact.createdAt, 'application/json');
      this.#insertVersion(staged.artifact, staged.stored.sha256, attemptId);
      return { packageId: row.packageId, part: input.part, version, source: 'GENERATED', attemptId, createdAt: staged.artifact.createdAt, deduplicated: false };
    };
    const stageArtifact = async (
      outcome: { readonly attemptId: string; readonly providerModel: string; readonly outputSha256: string },
      providerModel: string,
      inputBundleSha256: string,
      body: { caption: ContentCaptionVersionBody } | { poster: ContentPosterVersionBody },
    ) => {
      if (outcome.providerModel !== providerModel) throw new ContentPackageIntegrityError('Package attempt was dispatched to a different provider model');
      const artifact: ContentPackageVersionArtifact = {
        contractVersion: '1.0.0', packageId: row.packageId, part: input.part, version, source: 'GENERATED', requestId: input.requestId, requestSha256,
        attemptId: outcome.attemptId, providerModel, inputBundleSha256, outputSha256: outcome.outputSha256, ...body, createdAt: this.#now().toISOString(),
      };
      const stored = await this.#artifacts.put(canonicalBytes(validateContentPackageVersionArtifact(artifact)));
      return { stored, artifact };
    };

    if (input.part === 'CAPTION') {
      const facts = await this.#pinnedFacts(pin.campaignId, pin.campaignVersion, pin.insightVersion, pin.items);
      const lockedInput = canonicalSnapshot({ context: await this.#captionContext(pin, brand, facts), previous_posts: await this.#previousPosts(row) });
      const creativeText = await this.#creativeText(pin.caption.prompt);
      const layer = this.#library.layer('CAPTION');
      const userInput = lockedUserInput(lockedInput);
      const providerModel = this.#attempts.providerModelFor(pin.caption.model);
      const inputBundleSha256 = captionBundleDigest(layer, pin.caption.prompt.creativeTextSha256, pin.caption.model, providerModel, userInput);
      const { persisted } = await this.#attempts.run({
        ...common, promptRef: promptRef(pin.caption.prompt), inputBundleSha256,
        call: {
          modality: 'text',
          request: { model: pin.caption.model, systemLayer: layer.text, creativeLayer: creativeText, userInput, responseFormat: CAPTION_FORMAT },
          responseSchema: CAPTION_OUTPUT_SCHEMA,
        },
      }, {
        stage: async (outcome) => {
          if (outcome.modality !== 'text') throw new ContentPackageIntegrityError('Caption generation must be a text attempt');
          const post = captionPost(outcome.parsed);
          const factCheck = brandFactCheck({ post, profile: brand.profile, display: pin.display.caption, prices: facts.prices });
          return stageArtifact(outcome, providerModel, inputBundleSha256, {
            caption: { lockedInput, post, footer: pin.footer, text: captionText(post, pin.footer), factCheck },
          });
        },
        persist: (outcome, staged) => persist(staged, outcome.attemptId),
      });
      return persisted;
    }

    const captionRow = this.#versionRow(row.packageId, 'CAPTION', this.#currentVersion(row.packageId, 'CAPTION'));
    if (!captionRow) throw new ContentPackageConflictError('Generate the Caption before the Poster');
    const caption = (await this.#verifiedVersion(captionRow, pin)).caption!;
    const providerModel = this.#attempts.providerModelFor(pin.poster.model);
    const prepared = await this.#posterPrompt(pin, brand, caption.post, providerModel);
    const references = [];
    for (const mediaSha256 of prepared.references) {
      const { media, bytes } = await this.#media.readMedia(pin.brand.brandId, mediaSha256);
      references.push({ bytes, mediaType: media.mediaType as 'image/png' | 'image/jpeg' });
    }
    const { persisted } = await this.#attempts.run({
      ...common, promptRef: promptRef(pin.poster.prompt), inputBundleSha256: prepared.inputBundleSha256,
      call: { modality: 'image', request: { model: pin.poster.model, prompt: prepared.prompt, format: pin.poster.format, references } },
    }, {
      stage: async (outcome) => {
        if (outcome.modality !== 'image') throw new ContentPackageIntegrityError('Poster generation must be an image attempt');
        return stageArtifact(outcome, providerModel, prepared.inputBundleSha256, {
          poster: {
            promptSha256: prepared.promptSha256, imageSha256: outcome.outputSha256, mediaType: outcome.image.mediaType as 'image/png' | 'image/jpeg',
            width: outcome.image.width, height: outcome.image.height, sizeMatchesFormat: outcome.sizeMatchesFormat,
            captionVersion: captionRow.version, referenceMediaSha256s: [...prepared.references],
          },
        });
      },
      persist: (outcome, staged) => persist(staged, outcome.attemptId),
    });
    return persisted;
  }

  // ---------------------------------------------------------------------------------------------
  // MANUAL caption edits and RESTORE copies.

  async changeVersion(untrustedInput: unknown): Promise<ContentPackageVersionExecution> {
    const input = canonicalSnapshot(validateContentPackageVersionRequest(untrustedInput));
    if ((input.action === 'MANUAL') !== (input.post !== undefined)) throw new FlowValidationError('post is required for MANUAL and forbidden for RESTORE');
    if ((input.action === 'RESTORE') !== (input.restoreVersion !== undefined)) throw new FlowValidationError('restoreVersion is required for RESTORE and forbidden for MANUAL');
    if (input.action === 'MANUAL' && input.part !== 'CAPTION') throw new FlowValidationError('Only the Caption can be edited by hand');
    if (input.restoreVersion !== undefined && input.restoreVersion >= input.expectedVersion) throw new FlowValidationError('restoreVersion must be older than the current version');
    const requestSha256 = canonicalDigest(input);
    const existing = this.#versionByRequest(input.requestId);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) throw new ContentPackageConflictError('Version request id was already used with changed content');
      await this.#verifiedVersion(existing);
      return versionExecution(existing, true);
    }
    const slot = `${input.packageId}:${input.part}`;
    if (this.#inFlight.has(slot) || this.#inFlight.has(input.requestId)) throw new ContentPackageConflictError('A generation for this part is running');
    const row = this.#package(input.packageId);
    if (!row) throw new FlowValidationError(`Package not found: ${input.packageId}`);
    this.#assertPackageOpen(row);
    const { pin, brand } = await this.#verifiedPackage(row);
    if (this.#currentVersion(row.packageId, input.part) !== input.expectedVersion) throw new ContentPackageConflictError('Part version drift');
    const version = input.expectedVersion + 1;
    let body: { caption: ContentCaptionVersionBody } | { poster: ContentPosterVersionBody };
    if (input.action === 'MANUAL') {
      const post = input.post!;
      const facts = await this.#pinnedFacts(pin.campaignId, pin.campaignVersion, pin.insightVersion, pin.items);
      body = { caption: { post, footer: pin.footer, text: captionText(post, pin.footer), factCheck: brandFactCheck({ post, profile: brand.profile, display: pin.display.caption, prices: facts.prices }) } };
    } else {
      const sourceRow = this.#versionRow(row.packageId, input.part, input.restoreVersion!);
      if (!sourceRow) throw new ContentPackageReferenceError(`Version not found: ${input.restoreVersion}`);
      const source = await this.#verifiedVersion(sourceRow, pin);
      body = input.part === 'CAPTION' ? { caption: source.caption! } : { poster: source.poster! };
    }
    const artifact: ContentPackageVersionArtifact = canonicalSnapshot({
      contractVersion: '1.0.0', packageId: row.packageId, part: input.part, version, source: input.action, requestId: input.requestId, requestSha256,
      ...(input.restoreVersion !== undefined ? { restoredFromVersion: input.restoreVersion } : {}), ...body, createdAt: this.#now().toISOString(),
    });
    const stored = await this.#artifacts.put(canonicalBytes(validateContentPackageVersionArtifact(artifact)));
    const execute = this.#db.transaction((): ContentPackageVersionExecution => {
      if (this.#versionByRequest(input.requestId)) throw new ContentPackageConflictError('Version request was committed concurrently');
      if (this.#inFlight.has(slot)) throw new ContentPackageConflictError('A generation for this part is running');
      this.#assertPackageOpen(row);
      if (this.#currentVersion(row.packageId, input.part) !== input.expectedVersion) throw new ContentPackageConflictError('Part version drift');
      const previous = this.#versionRow(row.packageId, input.part, input.expectedVersion);
      if (previous && Date.parse(artifact.createdAt) < Date.parse(previous.createdAt)) throw new ContentPackageConflictError('Version time cannot predate the previous version');
      registerContentManifest(this.#db, stored, artifact.createdAt, 'application/json');
      this.#insertVersion(artifact, stored.sha256, null);
      return { packageId: row.packageId, part: input.part, version, source: input.action, createdAt: artifact.createdAt, deduplicated: false };
    });
    return execute();
  }

  // ---------------------------------------------------------------------------------------------
  // Delete / restore.

  stateOf(packageId: string): ContentPackageState {
    const last = this.#lastState(packageId);
    if (!last) return { sequence: 0, expired: false };
    if (!last.deleted) return { sequence: last.sequence, expired: false };
    const restorableUntil = restoreDeadline(last.createdAt);
    return { sequence: last.sequence, deleted: { deletedAt: last.createdAt, restorableUntil }, expired: this.#now().getTime() > Date.parse(restorableUntil) };
  }

  /**
   * Q6 derived deletion: a package is also deleted while its Angle or that Angle's Big Idea is deleted.
   * No rows are written for it; the earliest deadline wins, and restoring the ancestor brings back only
   * packages that were hidden by it alone.
   */
  effectiveStateOf(packageId: string): ContentPackageState {
    const own = this.stateOf(packageId);
    const row = this.#package(packageId);
    const hiddenBy = row === undefined ? undefined : this.#ancestorDeletion(row.angleId);
    if (hiddenBy === undefined) return own;
    const deleted = own.deleted !== undefined && Date.parse(own.deleted.restorableUntil) <= Date.parse(hiddenBy.restorableUntil)
      ? own.deleted : { deletedAt: hiddenBy.deletedAt, restorableUntil: hiddenBy.restorableUntil };
    return { sequence: own.sequence, deleted, hiddenBy, expired: this.#now().getTime() > Date.parse(deleted.restorableUntil) };
  }

  /** The deletion of the Angle, or of its Big Idea, that hides packages under it; the earliest deadline first. */
  #ancestorDeletion(angleId: string): { ideaId: string; deletedAt: string; restorableUntil: string } | undefined {
    const angle = this.#ideas.effectiveStateOf(angleId);
    const candidates = [...(angle.deleted ? [{ ideaId: angleId, ...angle.deleted }] : []), ...(angle.hiddenBy ? [angle.hiddenBy] : [])];
    return candidates.sort((a, b) => Date.parse(a.restorableUntil) - Date.parse(b.restorableUntil))[0];
  }

  changeState(untrustedInput: unknown): ContentPackageStateExecution {
    const input = canonicalSnapshot(validateContentPackageStateRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const row = this.#package(input.packageId);
    if (!row) throw new FlowValidationError(`Package not found: ${input.packageId}`);
    const execute = this.#db.transaction((): ContentPackageStateExecution => {
      const target = this.#stateRow(input.packageId, input.expectedSequence + 1);
      if (target) {
        if (target.requestSha256 !== requestSha256) throw new ContentPackageConflictError('Package state sequence drift');
        return stateExecution(input.packageId, target, true);
      }
      const state = this.stateOf(input.packageId);
      if (state.sequence !== input.expectedSequence) throw new ContentPackageConflictError('Package state sequence drift');
      if (this.#campaigns.lifecycleState(row.campaignId).deleted) throw new ContentPackageConflictError('Campaign is deleted and its packages cannot change');
      if (this.#ancestorDeletion(row.angleId)) throw new ContentPackageConflictError('The Angle or its Big Idea is deleted; restore it first');
      if (input.action === 'DELETE') {
        if (state.deleted) throw new ContentPackageConflictError('Package is already deleted');
        if (this.#inFlight.has(`${row.packageId}:CAPTION`) || this.#inFlight.has(`${row.packageId}:POSTER`)) throw new ContentPackageConflictError('A generation for this package is running');
      } else {
        if (!state.deleted) throw new ContentPackageConflictError('Package is not deleted');
        if (state.expired) throw new ContentPackageConflictError('Package restore window has expired');
      }
      const createdAt = this.#now().toISOString();
      const last = this.#lastState(input.packageId);
      if (Date.parse(createdAt) < Date.parse(last?.createdAt ?? row.createdAt)) throw new ContentPackageConflictError('Package state time cannot predate the previous state');
      const sequence = input.expectedSequence + 1;
      const deleted = input.action === 'DELETE';
      this.#db.prepare(`
        INSERT INTO flow_content_package_states(package_id, sequence, action, deleted, request_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(input.packageId, sequence, input.action, deleted ? 1 : 0, requestSha256, createdAt);
      return stateExecution(input.packageId, { sequence, action: input.action, deleted, requestSha256, createdAt }, false);
    });
    return execute();
  }

  // ---------------------------------------------------------------------------------------------
  // Campaign defaults ("Lưu làm mặc định cho chiến dịch").

  async saveDefaults(untrustedInput: unknown): Promise<ContentCampaignDefaultsExecution> {
    const input = canonicalSnapshot(validateContentCampaignDefaultsRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    if (!this.#campaigns.campaignExists(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const retry = this.#defaultsRow(input.campaignId, input.expectedVersion + 1);
    if (retry) {
      if (retry.requestSha256 !== requestSha256) throw new ContentPackageConflictError('Campaign defaults version drift');
      return { campaignId: input.campaignId, version: retry.version, createdAt: retry.createdAt, deduplicated: true };
    }
    if (this.#campaigns.lifecycleState(input.campaignId).deleted) throw new ContentPackageConflictError('Campaign is deleted');
    const campaign = await this.#campaigns.readCampaign(input.campaignId);
    const facts = await this.#pinnedFacts(input.campaignId, campaign.version, undefined, campaign.campaign.items);
    await this.#assertReferences(campaign.brandId, facts.photos, input.defaults.poster.referenceMediaSha256s);
    await this.#promptChoice(input.defaults.caption.prompt, 'CAPTION');
    await this.#promptChoice(input.defaults.poster.prompt, 'POSTER');
    const execute = this.#db.transaction((): ContentCampaignDefaultsExecution => {
      const target = this.#defaultsRow(input.campaignId, input.expectedVersion + 1);
      if (target) {
        if (target.requestSha256 !== requestSha256) throw new ContentPackageConflictError('Campaign defaults version drift');
        return { campaignId: input.campaignId, version: target.version, createdAt: target.createdAt, deduplicated: true };
      }
      if (this.#defaultsVersion(input.campaignId) !== input.expectedVersion) throw new ContentPackageConflictError('Campaign defaults version drift');
      const createdAt = this.#now().toISOString();
      const version = input.expectedVersion + 1;
      this.#db.prepare(`
        INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, ?, ?, ?, ?)
      `).run(input.campaignId, version, canonicalBytes(input.defaults).toString('utf8'), requestSha256, createdAt);
      return { campaignId: input.campaignId, version, createdAt, deduplicated: false };
    });
    return execute();
  }

  /** The latest saved defaults, verified against the request digest that wrote them. */
  readDefaults(campaignId: string): ContentCampaignDefaults | undefined {
    assertId(campaignId);
    const row = this.#defaultsRow(campaignId, this.#defaultsVersion(campaignId));
    if (!row) return undefined;
    let defaults: ContentCampaignPackageDefaults;
    try {
      defaults = JSON.parse(row.defaultsJson) as ContentCampaignPackageDefaults;
      validateContentCampaignDefaultsRequest({ contractVersion: '1.0.0', campaignId, expectedVersion: row.version - 1, defaults });
    } catch { throw new ContentPackageIntegrityError('Campaign defaults do not match their schema'); }
    if (canonicalDigest({ contractVersion: '1.0.0', campaignId, expectedVersion: row.version - 1, defaults }) !== row.requestSha256) {
      throw new ContentPackageIntegrityError('Campaign defaults do not match their request digest');
    }
    return { version: row.version, defaults, createdAt: row.createdAt };
  }

  // ---------------------------------------------------------------------------------------------
  // Reads.

  /** Packages of one campaign in code order; expired deletions are left out, restorable ones are flagged. */
  async listCampaignPackages(campaignId: string): Promise<ContentPackageListEntry[]> {
    assertId(campaignId);
    const entries: { sort: readonly [string, number]; entry: ContentPackageListEntry }[] = [];
    for (const row of this.#packageRows('campaign_id = ?', campaignId)) {
      const state = this.effectiveStateOf(row.packageId);
      if (state.expired) continue;
      const { pin } = await this.#verifiedPackage(row);
      const captionVersion = this.#currentVersion(row.packageId, 'CAPTION');
      const captionRow = this.#versionRow(row.packageId, 'CAPTION', captionVersion);
      const caption = captionRow ? (await this.#verifiedVersion(captionRow, pin)).caption : undefined;
      // R7: the listed Poster version is exposed only after its image bytes and manifest verify.
      const posterRow = this.#versionRow(row.packageId, 'POSTER', this.#currentVersion(row.packageId, 'POSTER'));
      if (posterRow) await this.#verifiedVersion(posterRow, pin);
      const angleCode = this.#angleCode(row.angleId);
      entries.push({
        sort: [angleCode, row.ordinal],
        entry: {
          packageId: row.packageId, angleId: row.angleId, code: `${angleCode}${CODE_SEPARATOR}${row.ordinal}`,
          deleted: state.deleted !== undefined, ...(state.deleted ? { restorableUntil: state.deleted.restorableUntil } : {}),
          ...(state.hiddenBy ? { hiddenByParent: true as const } : {}), stateSequence: state.sequence,
          captionVersion, posterVersion: this.#currentVersion(row.packageId, 'POSTER'),
          ...(caption ? { captionPreview: [...caption.post].slice(0, 280).join('') } : {}),
          posterFormat: pin.poster.format, createdAt: row.createdAt,
        },
      });
    }
    return entries.sort((a, b) => compareCodes(a.sort[0], b.sort[0]) || a.sort[1] - b.sort[1]).map((item) => item.entry);
  }

  async readPackage(packageId: string): Promise<ContentPackageDetail> {
    assertId(packageId);
    const row = this.#package(packageId);
    if (!row) throw new FlowValidationError(`Package not found: ${packageId}`);
    const state = this.effectiveStateOf(packageId);
    if (state.expired) throw new FlowValidationError(`Package not found: ${packageId}`);
    const { pin } = await this.#verifiedPackage(row);
    const parts: Record<ContentPackagePart, ContentPackageVersionArtifact[]> = { CAPTION: [], POSTER: [] };
    for (const versionRow of this.#versionRows('package_id = ?', packageId)) parts[versionRow.part].push(await this.#verifiedVersion(versionRow, pin));
    const attempts = this.#attempts.list({ targetId: packageId, limit: 50 })
      .filter((record) => record.targetType === PACKAGE_TARGET_TYPES.CAPTION || record.targetType === PACKAGE_TARGET_TYPES.POSTER)
      .map((record) => ({
        attemptId: record.attemptId, part: (record.targetType === PACKAGE_TARGET_TYPES.CAPTION ? 'CAPTION' : 'POSTER') as ContentPackagePart,
        state: record.state, errorCode: record.errorCode, retryOf: record.retryOf, model: record.model, createdAt: record.createdAt, closedAt: record.closedAt,
      }));
    return { packageId, campaignId: row.campaignId, angleId: row.angleId, code: this.#code(row.angleId, row.ordinal), pin, state, caption: parts.CAPTION, poster: parts.POSTER, attempts };
  }

  packageExists(packageId: string): boolean { return isUuid(packageId) && this.#package(packageId) !== undefined; }
  packageCampaign(packageId: string): string | undefined { return isUuid(packageId) ? this.#package(packageId)?.campaignId : undefined; }

  /** Poster image bytes of one version, checked against the version artifact and the manifest. */
  async readPosterImage(packageId: string, version: number): Promise<{ readonly bytes: Buffer; readonly mediaType: 'image/png' | 'image/jpeg' }> {
    assertId(packageId);
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive integer');
    const row = this.#package(packageId);
    const versionRow = row ? this.#versionRow(packageId, 'POSTER', version) : undefined;
    if (!row || !versionRow || this.effectiveStateOf(packageId).expired) throw new FlowValidationError(`Poster not found: ${packageId}@${version}`);
    const { pin } = await this.#verifiedPackage(row);
    const poster = (await this.#verifiedVersion(versionRow, pin)).poster!;
    const bytes = await this.#pinnedBytes(poster.imageSha256, poster.mediaType, 'Poster image');
    return { bytes, mediaType: poster.mediaType };
  }

  // ---------------------------------------------------------------------------------------------
  // Preparation helpers.

  /** Throws unless packages of this campaign may change now; returns the locked Insight version. */
  #assertCampaignOpen(campaignId: string): number {
    if (this.#campaigns.lifecycleState(campaignId).deleted) throw new ContentPackageConflictError('Campaign is deleted');
    const lock = this.#db.prepare('SELECT insight_version v FROM flow_content_insight_locks WHERE campaign_id = ?').get(campaignId) as { v: bigint | number } | undefined;
    if (!lock) throw new ContentPackageConflictError('Insight must be locked before creating packages');
    return Number(lock.v);
  }

  #assertPackageOpen(row: PackageRow): void {
    const state = this.effectiveStateOf(row.packageId);
    if (state.hiddenBy) throw new ContentPackageConflictError('The Angle or its Big Idea is deleted; restore it first');
    if (state.deleted) throw new ContentPackageConflictError('Package is deleted');
    if (this.#campaigns.lifecycleState(row.campaignId).deleted) throw new ContentPackageConflictError('Campaign is deleted');
  }

  /** C6: an Angle of this campaign, not deleted, with at least one purpose. Returns its purposes. */
  async #assertAngle(campaignId: string, angleId: string): Promise<readonly string[]> {
    if (!this.#ideas.ideaExists(angleId)) throw new ContentPackageReferenceError(`Angle not found: ${angleId}`);
    const angle = await this.#ideas.readIdea(angleId);
    if (angle.kind !== 'ANGLE' || angle.campaignId !== campaignId) throw new ContentPackageReferenceError(`Angle not found in this campaign: ${angleId}`);
    const state = this.#ideas.effectiveStateOf(angleId);
    if (state.deleted || state.hiddenBy) throw new ContentPackageConflictError('Angle is deleted');
    if (state.purposes.length === 0) throw new ContentPackageReferenceError('An Angle needs at least one purpose before it can be packaged');
    return state.purposes;
  }

  async #assertReferences(brandId: string, photos: ReadonlySet<string>, references: readonly string[]): Promise<void> {
    if (references.length > PACKAGE_TICKED_REFERENCE_LIMIT) throw new FlowValidationError(`At most ${PACKAGE_TICKED_REFERENCE_LIMIT} reference photos`);
    if (new Set(references).size !== references.length) throw new FlowValidationError('Reference photos must be unique');
    for (const mediaSha256 of references) {
      if (!photos.has(mediaSha256)) throw new ContentPackageReferenceError('Reference photos must belong to the campaign products');
      await this.#media.verifyRegistered(brandId, 'PHOTO', mediaSha256);
    }
  }

  /** Campaign facts, tier prices and product photos of the pinned campaign, Insight and item versions. */
  async #pinnedFacts(campaignId: string, campaignVersion: number, insightVersion: number | undefined, items: ContentPackageArtifact['items']): Promise<PinnedFacts> {
    const campaign = await this.#campaigns.readCampaign(campaignId, campaignVersion);
    const products = [];
    const prices: string[] = [];
    const photos = new Set<string>();
    for (const ref of items) {
      const item = (await this.#catalog.readItem(ref.itemId, ref.itemVersion)).item;
      const tiers = ref.tierKeys === undefined ? item.tiers : item.tiers.filter((tier) => ref.tierKeys!.includes(tier.tierKey));
      for (const tier of tiers) if (tier.priceText !== undefined) prices.push(tier.priceText);
      for (const photo of item.photos) photos.add(photo.mediaSha256);
      products.push({
        name: item.name, ...(item.description !== undefined ? { description: item.description } : {}), type: item.itemType,
        tiers: tiers.map((tier) => ({ name: tier.name, ...(tier.priceText !== undefined ? { priceText: tier.priceText } : {}), inclusions: [...tier.inclusions] })),
      });
    }
    let facts: Record<string, unknown> = { name: campaign.campaign.name, objective: campaign.campaign.objective, products };
    if (insightVersion !== undefined) {
      const insight = (await this.#insights.readInsight(campaignId, insightVersion)).insight;
      facts = { ...facts, customer: insight.customer, pain_point: insight.painPoint, insight: insight.insight };
    }
    return { campaign: facts, prices, photos };
  }

  async #captionContext(pin: ContentPackageArtifact, brand: ContentBrandArtifact, facts: PinnedFacts): Promise<Record<string, unknown>> {
    const angle = await this.#ideas.readIdea(pin.angleId);
    if (angle.parentIdeaId === undefined) throw new ContentPackageIntegrityError('Angle has no parent Big Idea');
    const bigIdea = (await this.#ideas.readIdea(angle.parentIdeaId)).output as { concept: string; expression: string };
    const angleOutput = angle.output as { name: string; concept: string };
    return {
      campaign: facts.campaign,
      big_idea: { concept: bigIdea.concept, expression: bigIdea.expression },
      angle: { name: angleOutput.name, concept: angleOutput.concept },
      platform: FACEBOOK,
      brand: captionBrandContext(brand.profile, pin.display.caption),
      writing: { style: STYLE_LABELS[pin.caption.style], length: LENGTH_WORDS[pin.caption.length] },
    };
  }

  /** Exclusions: this package's earlier captions (newest first), then the current captions of the Angle's other live packages. */
  async #previousPosts(row: PackageRow): Promise<string[]> {
    const posts: string[] = [];
    const add = (post: string) => { if (!posts.includes(post) && posts.length < PREVIOUS_POSTS_LIMIT) posts.push(post); };
    for (const versionRow of this.#versionRows("package_id = ? AND part = 'CAPTION'", row.packageId).reverse()) {
      add((await this.#verifiedVersion(versionRow)).caption!.post);
    }
    for (const other of this.#packageRows('angle_id = ?', row.angleId)) {
      if (other.packageId === row.packageId || this.effectiveStateOf(other.packageId).deleted) continue;
      const current = this.#versionRow(other.packageId, 'CAPTION', this.#currentVersion(other.packageId, 'CAPTION'));
      if (current) add((await this.#verifiedVersion(current)).caption!.post);
    }
    return posts;
  }

  async #posterPrompt(pin: ContentPackageArtifact, brand: ContentBrandArtifact, captionPost: string, providerModel: string): Promise<{ prompt: string; promptSha256: string; references: string[]; inputBundleSha256: string }> {
    const layer = this.#library.layer('POSTER');
    const plan = { photos: pin.poster.referenceMediaSha256s, ...(pin.poster.logoMediaSha256 !== undefined ? { logo: pin.poster.logoMediaSha256 } : {}) };
    const prompt = buildPosterPrompt({
      creativeText: await this.#creativeText(pin.poster.prompt), layerText: layer.text, format: pin.poster.format, captionPost,
      brandData: posterBrandData(brand.profile, pin.display.poster), plan, logoOn: pin.display.poster.logo,
    });
    const promptSha256 = textDigest(prompt);
    const references = [...plan.photos, ...(plan.logo !== undefined ? [plan.logo] : [])];
    const inputBundleSha256 = canonicalDigest({
      systemLayer: { type: 'POSTER', version: layer.version, sha256: layer.sha256 }, creativeTextSha256: pin.poster.prompt.creativeTextSha256,
      model: pin.poster.model, providerModel, format: pin.poster.format, promptSha256, references,
    });
    return { prompt, promptSha256, references, inputBundleSha256 };
  }

  async #promptChoice(choice: ContentIdeaPromptChoice, type: PromptType): Promise<PromptResolution> {
    if (choice.source === 'SYSTEM') {
      const entry = this.#library.find(choice.id, choice.version);
      if (!entry || entry.promptType !== type) throw new ContentPackageReferenceError(`Unknown ${type} system prompt: ${choice.id}`);
      const creativeText = this.#library.read(choice.id, choice.version).prompt.creativeText;
      return { creativeText, promptRef: `system:${choice.id}@${choice.version}`, prompt: { source: 'SYSTEM', id: choice.id, version: choice.version, name: entry.name, creativeTextSha256: textDigest(creativeText) } };
    }
    if (choice.source === 'USER') {
      if (this.#prompts.promptTypeOf(choice.promptId) !== type) throw new ContentPackageReferenceError(`Unknown ${type} prompt: ${choice.promptId}`);
      if (this.#prompts.lifecycleState(choice.promptId).deleted) throw new ContentPackageConflictError('Prompt is deleted');
      if (!this.#prompts.promptVersions(choice.promptId).includes(choice.version)) throw new ContentPackageReferenceError(`Unknown prompt version: ${choice.version}`);
      const prompt = (await this.#prompts.readPrompt(choice.promptId, choice.version)).prompt;
      return { creativeText: prompt.creativeText, promptRef: `user:${choice.promptId}@${choice.version}`, prompt: { source: 'USER', promptId: choice.promptId, version: choice.version, name: prompt.name, creativeTextSha256: textDigest(prompt.creativeText) } };
    }
    const creativeTextSha256 = textDigest(choice.creativeText);
    return { creativeText: choice.creativeText, promptRef: `freestyle:${creativeTextSha256}`, prompt: { source: 'FREESTYLE', name: FREESTYLE_PROMPT_NAME, creativeTextSha256, creativeText: choice.creativeText } };
  }

  /** The pinned creative text, checked against its pinned digest. */
  async #creativeText(prompt: ContentIdeaPromptUsed): Promise<string> {
    let text: string;
    if (prompt.source === 'SYSTEM') text = this.#library.read(prompt.id, prompt.version).prompt.creativeText;
    else if (prompt.source === 'USER') text = (await this.#prompts.readPrompt(prompt.promptId, prompt.version)).prompt.creativeText;
    else text = prompt.creativeText;
    if (textDigest(text) !== prompt.creativeTextSha256) throw new ContentPackageIntegrityError('Pinned prompt text no longer matches its digest');
    return text;
  }

  // ---------------------------------------------------------------------------------------------
  // Verification (fail closed).

  /** Reads and validates a pinned JSON artifact; any failure (missing, tampered, off-contract) is an integrity failure. */
  async #pinnedArtifact<T>(digest: string, validate: (value: unknown) => T, what: string): Promise<T> {
    try {
      return validate(await readCanonicalJsonArtifact(this.#db, this.#artifacts, digest));
    } catch (error) {
      if (error instanceof ContentPackageIntegrityError) throw error;
      throw new ContentPackageIntegrityError(`${what} artifact failed verification`);
    }
  }

  /** Reads stored bytes checked against their digest and manifest; any failure is an integrity failure. */
  async #pinnedBytes(digest: string, mediaType: string, what: string) {
    try {
      const bytes = await this.#artifacts.read(digest);
      if (sha256(bytes) !== digest) throw new ContentPackageIntegrityError(`${what} digest mismatch`);
      assertContentManifest(this.#db, digest, bytes.byteLength, mediaType);
      return bytes;
    } catch (error) {
      if (error instanceof ContentPackageIntegrityError) throw error;
      throw new ContentPackageIntegrityError(`${what} failed verification`);
    }
  }

  async #verifiedPackage(row: PackageRow): Promise<{ pin: ContentPackageArtifact; brand: ContentBrandArtifact }> {
    const pin = await this.#pinnedArtifact(row.artifactSha256, validateContentPackageArtifact, 'Package');
    if (
      pin.packageId !== row.packageId || pin.campaignId !== row.campaignId || pin.angleId !== row.angleId ||
      pin.requestId !== row.requestId || pin.requestSha256 !== row.requestSha256 || pin.createdAt !== row.createdAt ||
      (pin.caption.prompt.source === 'FREESTYLE' && textDigest(pin.caption.prompt.creativeText) !== pin.caption.prompt.creativeTextSha256) ||
      (pin.poster.prompt.source === 'FREESTYLE' && textDigest(pin.poster.prompt.creativeText) !== pin.poster.prompt.creativeTextSha256)
    ) throw new ContentPackageIntegrityError('Package artifact does not match immutable metadata');
    const brand = await this.#brands.readBrand(pin.brand.brandId, pin.brand.version);
    if (captionFooter(brand.profile, pin.display.caption) !== pin.footer) throw new ContentPackageIntegrityError('Package footer does not match the pinned brand');
    await this.#verifiedPins(pin);
    return { pin, brand };
  }

  /** R8: the campaign, Insight, catalog items, Angle and Big Idea a package was pinned to still read back and verify. */
  async #verifiedPins(pin: ContentPackageArtifact): Promise<void> {
    try {
      const campaign = await this.#campaigns.readCampaign(pin.campaignId, pin.campaignVersion);
      if (campaign.brandId !== pin.brand.brandId) throw new ContentPackageIntegrityError('Package brand does not match its pinned campaign');
      await this.#pinnedFacts(pin.campaignId, pin.campaignVersion, pin.insightVersion, pin.items);
      const angle = await this.#ideas.readIdea(pin.angleId);
      // The Angle may predate a relock, so only its identity is pinned, not its Insight version.
      if (angle.kind !== 'ANGLE' || angle.campaignId !== pin.campaignId || !angle.parentIdeaId) throw new ContentPackageIntegrityError('Package Angle does not match its pins');
      const bigIdea = await this.#ideas.readIdea(angle.parentIdeaId);
      if (bigIdea.kind !== 'BIG_IDEA' || bigIdea.campaignId !== pin.campaignId) throw new ContentPackageIntegrityError('Package Big Idea does not match its pins');
    } catch (error) {
      if (error instanceof ContentPackageIntegrityError) throw error;
      throw new ContentPackageIntegrityError('Pinned campaign, Insight, catalog or Angle failed verification');
    }
  }

  async #verifiedVersion(row: VersionRow, knownPin?: ContentPackageArtifact): Promise<ContentPackageVersionArtifact> {
    const artifact = await this.#pinnedArtifact(row.artifactSha256, validateContentPackageVersionArtifact, 'Package version');
    const fail = (): never => { throw new ContentPackageIntegrityError('Package version does not match immutable metadata'); };
    if (
      artifact.packageId !== row.packageId || artifact.part !== row.part || artifact.version !== row.version || artifact.source !== row.source ||
      artifact.requestId !== row.requestId || artifact.requestSha256 !== row.requestSha256 || artifact.createdAt !== row.createdAt ||
      (artifact.attemptId ?? null) !== row.attemptId || (artifact.restoredFromVersion ?? null) !== row.restoredFromVersion ||
      (row.part === 'CAPTION') !== (artifact.caption !== undefined) || (row.part === 'POSTER') !== (artifact.poster !== undefined)
    ) fail();
    const pin = knownPin ?? (await this.#verifiedPackage(this.#package(row.packageId) ?? fail())).pin;
    if (artifact.caption && (artifact.caption.footer !== pin.footer || artifact.caption.text !== captionText(artifact.caption.post, artifact.caption.footer))) fail();

    if (row.source === 'GENERATED') {
      const attempt = this.#attempt(row.attemptId!);
      if (
        !attempt || attempt.state !== 'succeeded' || attempt.targetId !== row.packageId || attempt.targetType !== PACKAGE_TARGET_TYPES[row.part] ||
        attempt.outputSha256 !== artifact.outputSha256 || attempt.inputBundleSha256 !== artifact.inputBundleSha256 ||
        attempt.model !== (row.part === 'CAPTION' ? pin.caption.model : pin.poster.model) ||
        // The recorded provider model is replayed as-is; the current route table never reinterprets it.
        artifact.providerModel === undefined || attempt.providerModel !== artifact.providerModel
      ) fail();
      const providerModel = artifact.providerModel!;
      if (row.part === 'CAPTION') {
        const caption = artifact.caption!;
        if (caption.lockedInput === undefined) fail();
        const layer = this.#library.layer('CAPTION');
        if (captionBundleDigest(layer, pin.caption.prompt.creativeTextSha256, pin.caption.model, providerModel, lockedUserInput(caption.lockedInput!)) !== artifact.inputBundleSha256) fail();
        const output = await this.#pinnedBytes(artifact.outputSha256!, 'application/json', 'Caption output');
        let post: string;
        try { post = captionPost(JSON.parse(output.toString('utf8'))); } catch { return fail(); }
        if (post !== caption.post) fail();
      } else {
        const poster = artifact.poster!;
        if (poster.imageSha256 !== artifact.outputSha256) fail();
        const captionRow = this.#versionRow(row.packageId, 'CAPTION', poster.captionVersion) ?? fail();
        const captionVersion = await this.#verifiedVersion(captionRow, pin);
        const brand = await this.#brands.readBrand(pin.brand.brandId, pin.brand.version);
        const prepared = await this.#posterPrompt(pin, brand, captionVersion.caption!.post, providerModel);
        if (
          prepared.promptSha256 !== poster.promptSha256 || prepared.inputBundleSha256 !== artifact.inputBundleSha256 ||
          canonicalDigest(prepared.references) !== canonicalDigest(poster.referenceMediaSha256s)
        ) fail();
        // R7: the image itself must still match its digest and manifest before the version is exposed.
        await this.#pinnedBytes(poster.imageSha256, poster.mediaType, 'Poster image');
      }
      return artifact;
    }

    if (artifact.attemptId !== undefined || artifact.providerModel !== undefined || artifact.inputBundleSha256 !== undefined || artifact.outputSha256 !== undefined) fail();
    const request: ContentPackageVersionRequest = {
      contractVersion: '1.0.0', packageId: row.packageId, requestId: row.requestId, part: row.part, expectedVersion: row.version - 1, action: row.source as 'MANUAL' | 'RESTORE',
      ...(row.source === 'MANUAL' ? { post: artifact.caption?.post ?? '' } : { restoreVersion: row.restoredFromVersion! }),
    };
    if (canonicalDigest(request) !== row.requestSha256) fail();
    if (row.source === 'MANUAL') {
      if (row.part !== 'CAPTION' || artifact.caption!.lockedInput !== undefined) fail();
    } else {
      const sourceRow = this.#versionRow(row.packageId, row.part, row.restoredFromVersion!) ?? fail();
      const source = await this.#verifiedVersion(sourceRow, pin);
      if (canonicalDigest(source.caption ?? source.poster) !== canonicalDigest(artifact.caption ?? artifact.poster)) fail();
    }
    return artifact;
  }

  // ---------------------------------------------------------------------------------------------
  // Rows.

  #insertVersion(artifact: ContentPackageVersionArtifact, artifactSha256: string, attemptId: string | null): void {
    this.#db.prepare(`
      INSERT INTO flow_content_package_versions(package_id, part, version, source, attempt_id, restored_from_version, request_id, request_sha256, version_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(artifact.packageId, artifact.part, artifact.version, artifact.source, attemptId, artifact.restoredFromVersion ?? null, artifact.requestId, artifact.requestSha256, artifactSha256, artifact.createdAt);
  }

  #code(angleId: string, ordinal: number): string { return `${this.#angleCode(angleId)}${CODE_SEPARATOR}${ordinal}`; }

  #angleCode(angleId: string): string {
    const row = this.#db.prepare(`
      SELECT a.ordinal angleOrdinal, b.ordinal bigIdeaOrdinal FROM flow_content_ideas a JOIN flow_content_ideas b ON b.idea_id = a.parent_idea_id
      WHERE a.idea_id = ? AND a.kind = 'ANGLE'
    `).get(angleId) as { angleOrdinal: bigint | number; bigIdeaOrdinal: bigint | number } | undefined;
    if (!row) throw new ContentPackageIntegrityError('Package Angle is missing');
    return `${letterCode(Number(row.bigIdeaOrdinal))}${Number(row.angleOrdinal)}`;
  }

  #nextOrdinal(angleId: string): number {
    const row = this.#db.prepare('SELECT COALESCE(MAX(ordinal), 0) + 1 next FROM flow_content_packages WHERE angle_id = ?').get(angleId) as { next: bigint | number };
    return Number(row.next);
  }

  #package(packageId: string): PackageRow | undefined { return this.#packageRows('package_id = ?', packageId)[0]; }

  #packageRows(where: string, ...values: unknown[]): PackageRow[] {
    return (this.#db.prepare(`
      SELECT package_id packageId, campaign_id campaignId, angle_id angleId, ordinal, request_id requestId, request_sha256 requestSha256,
        package_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_content_packages WHERE ${where} ORDER BY created_at, ordinal, package_id
    `).all(...values) as (Omit<PackageRow, 'ordinal'> & { ordinal: bigint | number })[]).map((row) => ({ ...row, ordinal: Number(row.ordinal) }));
  }

  #currentVersion(packageId: string, part: ContentPackagePart): number {
    const row = this.#db.prepare('SELECT COALESCE(MAX(version), 0) v FROM flow_content_package_versions WHERE package_id = ? AND part = ?').get(packageId, part) as { v: bigint | number };
    return Number(row.v);
  }

  #versionRow(packageId: string, part: ContentPackagePart, version: number): VersionRow | undefined {
    return this.#versionRows('package_id = ? AND part = ? AND version = ?', packageId, part, version)[0];
  }

  #versionByRequest(requestId: string): VersionRow | undefined { return this.#versionRows('request_id = ?', requestId)[0]; }

  #versionRows(where: string, ...values: unknown[]): VersionRow[] {
    return (this.#db.prepare(`
      SELECT package_id packageId, part, version, source, attempt_id attemptId, restored_from_version restoredFromVersion, request_id requestId,
        request_sha256 requestSha256, version_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_content_package_versions WHERE ${where} ORDER BY part, version
    `).all(...values) as (Omit<VersionRow, 'version' | 'restoredFromVersion'> & { version: bigint | number; restoredFromVersion: bigint | number | null })[])
      .map((row) => ({ ...row, version: Number(row.version), restoredFromVersion: row.restoredFromVersion === null ? null : Number(row.restoredFromVersion) }));
  }

  #attempt(attemptId: string): AttemptRow | undefined {
    return this.#db.prepare(`
      SELECT attempt_id attemptId, target_type targetType, target_id targetId, modality, model, provider_model providerModel, state, input_bundle_sha256 inputBundleSha256, output_sha256 outputSha256
      FROM flow_content_ai_attempts WHERE attempt_id = ?
    `).get(attemptId) as AttemptRow | undefined;
  }

  /** A verified provider result without a committed version is recoverable history, not an implicit retry. */
  #assertNoUncommittedProviderResult(targetType: string, targetId: string, part: ContentPackagePart, retryOfAttemptId: string | undefined): void {
    const committed = new Set(this.#versionRows('package_id = ? AND part = ?', targetId, part)
      .map((version) => version.attemptId)
      .filter((attemptId): attemptId is string => attemptId !== null));
    const unresolved = this.#attempts.list({ targetType, targetId, limit: 200 })
      .find((attempt) => attempt.outputSha256 !== null && attempt.attemptId !== retryOfAttemptId && !committed.has(attempt.attemptId));
    if (unresolved) throw new ContentPackageConflictError('A provider result exists without a committed version; choose an explicit retry before dispatching again');
  }

  #lastState(packageId: string): StateRow | undefined { return this.#stateQuery('package_id = ? ORDER BY sequence DESC LIMIT 1', packageId); }
  #stateRow(packageId: string, sequence: number): StateRow | undefined { return this.#stateQuery('package_id = ? AND sequence = ?', packageId, sequence); }

  #stateQuery(where: string, ...values: unknown[]): StateRow | undefined {
    const row = this.#db.prepare(`
      SELECT sequence, action, deleted, request_sha256 requestSha256, created_at createdAt FROM flow_content_package_states WHERE ${where}
    `).get(...values) as { sequence: bigint | number; action: ContentPackageStateAction; deleted: bigint | number; requestSha256: string; createdAt: string } | undefined;
    if (!row) return undefined;
    return { sequence: Number(row.sequence), action: row.action, deleted: Number(row.deleted) === 1, requestSha256: row.requestSha256, createdAt: row.createdAt };
  }

  #defaultsVersion(campaignId: string): number {
    const row = this.#db.prepare('SELECT COALESCE(MAX(version), 0) v FROM flow_content_campaign_defaults WHERE campaign_id = ?').get(campaignId) as { v: bigint | number };
    return Number(row.v);
  }

  #defaultsRow(campaignId: string, version: number): { version: number; defaultsJson: string; requestSha256: string; createdAt: string } | undefined {
    const row = this.#db.prepare(`
      SELECT version, defaults_json defaultsJson, request_sha256 requestSha256, created_at createdAt FROM flow_content_campaign_defaults WHERE campaign_id = ? AND version = ?
    `).get(campaignId, version) as { version: bigint | number; defaultsJson: string; requestSha256: string; createdAt: string } | undefined;
    return row ? { ...row, version: Number(row.version) } : undefined;
  }
}

function captionPost(value: unknown): string {
  const output = value as { post?: unknown };
  if (typeof output !== 'object' || output === null || Object.keys(output).join(',') !== 'post' || typeof output.post !== 'string') {
    throw new ContentPackageIntegrityError('Caption output must have exactly one post');
  }
  const post = output.post.trim();
  if (post === '') throw new ContentPackageIntegrityError('Caption output is empty');
  return post;
}

function lockedUserInput(lockedInput: unknown): string { return `LOCKED_INPUT_JSON:\n${canonicalBytes(lockedInput).toString('utf8')}`; }

function captionBundleDigest(layer: { readonly version: number; readonly sha256: string }, creativeTextSha256: string, model: string, providerModel: string, userInput: string): string {
  return canonicalDigest({ systemLayer: { type: 'CAPTION', version: layer.version, sha256: layer.sha256 }, creativeTextSha256, model, providerModel, userInput });
}

function promptRef(prompt: ContentIdeaPromptUsed): string {
  if (prompt.source === 'SYSTEM') return `system:${prompt.id}@${prompt.version}`;
  if (prompt.source === 'USER') return `user:${prompt.promptId}@${prompt.version}`;
  return `freestyle:${prompt.creativeTextSha256}`;
}

function versionExecution(row: VersionRow, deduplicated: boolean): ContentPackageVersionExecution {
  return { packageId: row.packageId, part: row.part, version: row.version, source: row.source, ...(row.attemptId !== null ? { attemptId: row.attemptId } : {}), createdAt: row.createdAt, deduplicated };
}

function stateExecution(packageId: string, row: StateRow, deduplicated: boolean): ContentPackageStateExecution {
  return { packageId, sequence: row.sequence, action: row.action, createdAt: row.createdAt, ...(row.action === 'DELETE' ? { restorableUntil: restoreDeadline(row.createdAt) } : {}), deduplicated };
}

/** Angle codes sort by Big Idea letters (length first: Z before AA), then Angle number. */
function compareCodes(a: string, b: string): number {
  const [, letterA = '', numberA = '0'] = /^([A-Z]+)(\d+)$/u.exec(a) ?? [];
  const [, letterB = '', numberB = '0'] = /^([A-Z]+)(\d+)$/u.exec(b) ?? [];
  return letterA.length - letterB.length || letterA.localeCompare(letterB) || Number(numberA) - Number(numberB);
}

function textDigest(text: string): string { return sha256(Buffer.from(text, 'utf8')); }

function isUuid(value: string): boolean {
  try { assertContentUuid(value); return true; } catch { return false; }
}

function assertId(value: string): void {
  if (!isUuid(value)) throw new FlowValidationError('ID must be a UUID');
}
