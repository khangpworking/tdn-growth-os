import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ContentIdeaArtifact, ContentIdeaOutput, ContentIdeaPromptUsed } from '../../../contracts/flow/content-idea-artifact.generated.js';
import type { ContentIdeaGenerateRequest, ContentIdeaKind } from '../../../contracts/flow/content-idea-generate-request.generated.js';
import type { ContentIdeaStateAction } from '../../../contracts/flow/content-idea-state-request.generated.js';
import type { ContentPurposeKind } from '../../../contracts/flow/content-purpose-tag-request.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import type { ContentAiAttemptService } from './content-ai-attempt-service.js';
import {
  assertContentUuid,
  canonicalBytes,
  canonicalDigest,
  canonicalSnapshot,
  readCanonicalJsonArtifact,
  registerContentManifest,
  sha256,
} from './content-artifacts.js';
import type { ContentCampaignService } from './content-campaign-service.js';
import type { ContentCatalogService } from './content-catalog-service.js';
import type { ContentInsightService } from './content-insight-service.js';
import type { ContentPromptLibrary } from './content-prompt-library.js';
import { restoreDeadline, type ContentPromptService } from './content-prompt-service.js';
import {
  FlowValidationError,
  validateContentIdeaArtifact,
  validateContentIdeaGenerateRequest,
  validateContentIdeaStateRequest,
  validateContentPurposeTagRequest,
} from './validation.js';

export class ContentIdeaConflictError extends Error {}

/** Committed idea data no longer matches its row, attempt or artifact; reads fail closed. */
export class ContentIdeaIntegrityError extends Error {}

/** The model returned output that passed the provider schema but breaks an idea rule (e.g. the Big Idea aggregate limit). */
export class ContentIdeaOutputError extends Error {}

/** A prompt, parent idea or purpose tag named by the request does not exist or does not fit. */
export class ContentIdeaReferenceError extends Error {}

export const IDEA_TARGET_TYPES: Readonly<Record<ContentIdeaKind, string>> = { BIG_IDEA: 'content_big_idea', ANGLE: 'content_angle' };
export const FREESTYLE_PROMPT_NAME = 'Prompt tự do';
export const BIG_IDEA_AGGREGATE_LIMIT = 1000;
const FACEBOOK = 'Facebook';

/** Strict output schemas checked by the attempt service (Ajv, code-point lengths). */
export const IDEA_OUTPUT_SCHEMAS: Readonly<Record<ContentIdeaKind, Readonly<Record<string, unknown>>>> = Object.freeze({
  BIG_IDEA: {
    type: 'object', additionalProperties: false, required: ['concept', 'expression'],
    properties: {
      concept: { type: 'string', minLength: 1, maxLength: 780, pattern: '\\S' },
      expression: { type: 'string', minLength: 1, maxLength: 180, pattern: '\\S' },
    },
  },
  ANGLE: {
    type: 'object', additionalProperties: false, required: ['name', 'concept'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
      concept: { type: 'string', minLength: 1, maxLength: 840, pattern: '\\S' },
    },
  },
});

/** Provider-facing structured-output shape: keys and types only; limits are enforced by IDEA_OUTPUT_SCHEMAS. */
const PROVIDER_FORMATS: Readonly<Record<ContentIdeaKind, { readonly name: string; readonly jsonSchema: Readonly<Record<string, unknown>> }>> = Object.freeze({
  BIG_IDEA: { name: 'big_idea', jsonSchema: { type: 'object', additionalProperties: false, required: ['concept', 'expression'], properties: { concept: { type: 'string' }, expression: { type: 'string' } } } },
  ANGLE: { name: 'angle', jsonSchema: { type: 'object', additionalProperties: false, required: ['name', 'concept'], properties: { name: { type: 'string' }, concept: { type: 'string' } } } },
});

export interface ContentIdeaExecution {
  readonly ideaId: string;
  readonly campaignId: string;
  readonly kind: ContentIdeaKind;
  readonly code: string;
  readonly attemptId: string;
  readonly createdAt: string;
  readonly deduplicated: boolean;
}

export interface ContentIdeaState {
  readonly sequence: number;
  readonly developing: boolean;
  readonly purposes: readonly string[];
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
  readonly expired: boolean;
}

export interface ContentIdeaStateExecution {
  readonly ideaId: string;
  readonly sequence: number;
  readonly action: ContentIdeaStateAction;
  readonly createdAt: string;
  readonly restorableUntil?: string;
  readonly deduplicated: boolean;
}

export interface ContentPurposeTag {
  readonly tagId: string;
  readonly label: string;
  readonly displayLike: ContentPurposeKind;
  readonly createdAt: string;
}

export interface ContentPurposeTagExecution extends ContentPurposeTag { readonly deduplicated: boolean }

export interface ContentIdeaListEntry {
  readonly ideaId: string;
  readonly kind: ContentIdeaKind;
  readonly parentIdeaId?: string;
  readonly code: string;
  readonly concept: string;
  readonly expression?: string;
  readonly name?: string;
  readonly developing: boolean;
  readonly deleted: boolean;
  readonly restorableUntil?: string;
  readonly stateSequence: number;
  readonly purposes: readonly string[];
  readonly model: ContentIdeaGenerateRequest['model'];
  readonly promptLabel: string;
  readonly createdAt: string;
}

interface IdeaRow {
  readonly ideaId: string;
  readonly campaignId: string;
  readonly kind: ContentIdeaKind;
  readonly parentIdeaId: string | null;
  readonly ordinal: number;
  readonly insightVersion: number;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly attemptId: string;
  readonly artifactSha256: string;
  readonly createdAt: string;
}

interface StateRow {
  readonly sequence: number;
  readonly action: ContentIdeaStateAction;
  readonly developing: boolean;
  readonly deleted: boolean;
  readonly purposes: readonly string[];
  readonly requestSha256: string;
  readonly createdAt: string;
}

interface PreparedGeneration {
  readonly insightVersion: number;
  readonly lockedInput: Record<string, unknown>;
  readonly prompt: ContentIdeaPromptUsed;
  readonly creativeText: string;
  readonly promptRef: string;
}

/** Big Idea and Angle generation (Task 050b, B11 steps 4–5): one audited AI attempt per idea, append-only states. */
export class ContentIdeaService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #attempts: ContentAiAttemptService;
  readonly #campaigns: ContentCampaignService;
  readonly #insights: ContentInsightService;
  readonly #catalog: ContentCatalogService;
  readonly #prompts: ContentPromptService;
  readonly #library: ContentPromptLibrary;
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
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.newId ?? randomUUID;
  }

  /**
   * Generates one Big Idea or Angle. The same request id returns the committed idea (exact retry);
   * a request id already running is refused. No database lock is held during the AI call.
   */
  async generate(untrustedInput: unknown, actorId: string): Promise<ContentIdeaExecution> {
    const input = canonicalSnapshot(validateContentIdeaGenerateRequest(untrustedInput));
    if ((input.kind === 'ANGLE') !== (input.parentIdeaId !== undefined)) throw new FlowValidationError('parentIdeaId is required for ANGLE and forbidden for BIG_IDEA');
    const requestSha256 = canonicalDigest(input);
    const existing = this.#byRequest(input.requestId);
    if (existing) return this.#generateRetry(requestSha256, existing);
    if (this.#inFlight.has(input.requestId)) throw new ContentIdeaConflictError('This generation request is already running');
    this.#inFlight.add(input.requestId);
    try {
      return await this.#generate(input, requestSha256, actorId);
    } finally {
      this.#inFlight.delete(input.requestId);
    }
  }

  async #generate(input: ContentIdeaGenerateRequest, requestSha256: string, actorId: string): Promise<ContentIdeaExecution> {
    if (!this.#campaigns.campaignExists(input.campaignId)) throw new FlowValidationError(`Campaign not found: ${input.campaignId}`);
    const insightVersion = this.#assertGeneratable(input.campaignId, input.kind, input.parentIdeaId);
    const prepared = await this.#prepare(input, insightVersion);
    const layer = this.#library.layer(input.kind);
    const userInput = `LOCKED_INPUT_JSON:\n${canonicalBytes(prepared.lockedInput).toString('utf8')}`;
    const inputBundleSha256 = inputBundleDigest(input.kind, layer, prepared.prompt.creativeTextSha256, input.model, userInput);
    const ideaId = this.#newId();
    assertContentUuid(ideaId);

    const { persisted } = await this.#attempts.run<{ stored: StoredArtifact; createdAt: string }, ContentIdeaExecution>({
      kind: 'generate',
      targetType: IDEA_TARGET_TYPES[input.kind],
      targetId: ideaId,
      promptRef: prepared.promptRef,
      inputBundleSha256,
      plannedActionCallCount: input.plannedCallCount,
      actorId,
      call: {
        modality: 'text',
        request: { model: input.model, systemLayer: layer.text, creativeLayer: prepared.creativeText, userInput, responseFormat: PROVIDER_FORMATS[input.kind] },
        responseSchema: IDEA_OUTPUT_SCHEMAS[input.kind],
      },
    }, {
      stage: async (outcome) => {
        if (outcome.modality !== 'text') throw new ContentIdeaIntegrityError('Idea generation must be a text attempt');
        const output = ideaOutput(input.kind, outcome.parsed);
        const createdAt = this.#now().toISOString();
        const artifact: ContentIdeaArtifact = {
          contractVersion: '1.0.0', ideaId, campaignId: input.campaignId, kind: input.kind,
          ...(input.parentIdeaId !== undefined ? { parentIdeaId: input.parentIdeaId } : {}),
          insightVersion: prepared.insightVersion, requestId: input.requestId, requestSha256, prompt: prepared.prompt, model: input.model,
          systemLayer: { version: layer.version, sha256: layer.sha256 }, lockedInput: prepared.lockedInput, inputBundleSha256,
          attemptId: outcome.attemptId, outputSha256: outcome.outputSha256, output, createdAt,
        };
        const stored = await this.#artifacts.put(canonicalBytes(validateContentIdeaArtifact(artifact)));
        return { stored, createdAt };
      },
      persist: (outcome, staged) => {
        if (!staged) throw new ContentIdeaIntegrityError('Idea artifact was not staged');
        if (this.#byRequest(input.requestId)) throw new ContentIdeaConflictError('Idea request was committed concurrently');
        if (this.#assertGeneratable(input.campaignId, input.kind, input.parentIdeaId) !== prepared.insightVersion) throw new ContentIdeaConflictError('Insight lock changed during generation');
        const parentId = input.parentIdeaId ?? null;
        const ordinal = this.#nextOrdinal(input.campaignId, input.kind, parentId);
        registerContentManifest(this.#db, staged.stored, staged.createdAt, 'application/json');
        this.#db.prepare(`
          INSERT INTO flow_content_ideas(idea_id, campaign_id, kind, parent_idea_id, ordinal, insight_version, request_id, request_sha256, attempt_id, idea_artifact_sha256, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(ideaId, input.campaignId, input.kind, parentId, ordinal, prepared.insightVersion, input.requestId, requestSha256, outcome.attemptId, staged.stored.sha256, staged.createdAt);
        return { ideaId, campaignId: input.campaignId, kind: input.kind, code: this.#code(input.kind, ordinal, parentId), attemptId: outcome.attemptId, createdAt: staged.createdAt, deduplicated: false };
      },
    });
    return persisted;
  }

  async readIdea(ideaId: string): Promise<ContentIdeaArtifact> {
    assertId(ideaId);
    const row = this.#idea(ideaId);
    if (!row) throw new FlowValidationError(`Idea not found: ${ideaId}`);
    return this.#verifiedArtifact(row);
  }

  ideaExists(ideaId: string): boolean { return isUuid(ideaId) && this.#idea(ideaId) !== undefined; }

  /** Ideas of one campaign in code order; expired deletions are left out, restorable ones are flagged. */
  async listCampaignIdeas(campaignId: string): Promise<ContentIdeaListEntry[]> {
    assertId(campaignId);
    const rows = this.#ideaRows('campaign_id = ?', campaignId);
    const bigIdeaOrdinals = new Map(rows.filter((row) => row.kind === 'BIG_IDEA').map((row) => [row.ideaId, row.ordinal]));
    const entries: { sort: readonly [number, number]; entry: ContentIdeaListEntry }[] = [];
    for (const row of rows) {
      const state = this.stateOf(row.ideaId);
      if (state.expired) continue;
      const artifact = await this.#verifiedArtifact(row);
      const code = this.#code(row.kind, row.ordinal, row.parentIdeaId);
      const output = artifact.output as Record<string, string>;
      entries.push({
        sort: row.kind === 'BIG_IDEA' ? [row.ordinal, 0] : [bigIdeaOrdinals.get(row.parentIdeaId!) ?? 0, row.ordinal],
        entry: {
          ideaId: row.ideaId, kind: row.kind, ...(row.parentIdeaId !== null ? { parentIdeaId: row.parentIdeaId } : {}), code,
          concept: output.concept!,
          ...(row.kind === 'BIG_IDEA' ? { expression: output.expression! } : { name: output.name! }),
          developing: state.developing, deleted: state.deleted !== undefined,
          ...(state.deleted ? { restorableUntil: state.deleted.restorableUntil } : {}),
          stateSequence: state.sequence, purposes: state.purposes, model: artifact.model, promptLabel: artifact.prompt.name, createdAt: row.createdAt,
        },
      });
    }
    return entries.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1]).map((item) => item.entry);
  }

  stateOf(ideaId: string): ContentIdeaState {
    const last = this.#lastState(ideaId);
    if (!last) return { sequence: 0, developing: false, purposes: [], expired: false };
    if (!last.deleted) return { sequence: last.sequence, developing: last.developing, purposes: last.purposes, expired: false };
    const restorableUntil = restoreDeadline(last.createdAt);
    return { sequence: last.sequence, developing: false, purposes: last.purposes, deleted: { deletedAt: last.createdAt, restorableUntil }, expired: this.#now().getTime() > Date.parse(restorableUntil) };
  }

  /** OWNER develop/stop/delete/restore/purposes on one idea, pinned to the state sequence the caller saw. */
  changeState(untrustedInput: unknown): ContentIdeaStateExecution {
    const input = canonicalSnapshot(validateContentIdeaStateRequest(untrustedInput));
    if ((input.action === 'PURPOSES') !== (input.purposes !== undefined)) throw new FlowValidationError('purposes is required for PURPOSES and forbidden for other actions');
    const requestSha256 = canonicalDigest(input);
    const idea = this.#idea(input.ideaId);
    if (!idea) throw new FlowValidationError(`Idea not found: ${input.ideaId}`);
    if (input.purposes !== undefined) {
      if (idea.kind !== 'ANGLE') throw new ContentIdeaReferenceError('Purposes apply to Angles only');
      for (const purpose of input.purposes) {
        if (purpose.startsWith('tag:') && !this.#tag(purpose.slice(4))) throw new ContentIdeaReferenceError(`Unknown purpose tag: ${purpose.slice(4)}`);
      }
    }
    const execute = this.#db.transaction((): ContentIdeaStateExecution => {
      const target = this.#stateRow(input.ideaId, input.expectedSequence + 1);
      if (target) {
        if (target.requestSha256 !== requestSha256) throw new ContentIdeaConflictError('Idea state sequence drift');
        return stateExecution(input.ideaId, target, true);
      }
      const state = this.stateOf(input.ideaId);
      if (state.sequence !== input.expectedSequence) throw new ContentIdeaConflictError('Idea state sequence drift');
      if (this.#campaigns.lifecycleState(idea.campaignId).deleted) throw new ContentIdeaConflictError('Campaign is deleted and its ideas cannot change');
      const next = nextState(input.action, state, input.purposes);
      const createdAt = this.#now().toISOString();
      const last = this.#lastState(input.ideaId);
      if (Date.parse(createdAt) < Date.parse(last?.createdAt ?? idea.createdAt)) throw new ContentIdeaConflictError('Idea state time cannot predate the previous state');
      const sequence = input.expectedSequence + 1;
      this.#db.prepare(`
        INSERT INTO flow_content_idea_states(idea_id, sequence, action, developing, deleted, purposes_json, request_sha256, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.ideaId, sequence, input.action, next.developing ? 1 : 0, next.deleted ? 1 : 0, JSON.stringify(next.purposes), requestSha256, createdAt);
      return stateExecution(input.ideaId, { sequence, action: input.action, developing: next.developing, deleted: next.deleted, purposes: next.purposes, requestSha256, createdAt }, false);
    });
    return execute();
  }

  /** Owner-defined purpose ("Của bạn"). The same label (case/space-insensitive) with the same display is an exact retry. */
  createPurposeTag(untrustedInput: unknown): ContentPurposeTagExecution {
    const input = canonicalSnapshot(validateContentPurposeTagRequest(untrustedInput));
    const requestSha256 = canonicalDigest(input);
    const labelKey = purposeLabelKey(input.label);
    const execute = this.#db.transaction((): ContentPurposeTagExecution => {
      const existing = this.#tagByKey(labelKey);
      if (existing) {
        if (existing.displayLike !== input.displayLike) throw new ContentIdeaConflictError('A purpose with this label already exists with another display');
        return { ...existing, deduplicated: true };
      }
      const tagId = this.#newId();
      assertContentUuid(tagId);
      const createdAt = this.#now().toISOString();
      this.#db.prepare(`
        INSERT INTO flow_content_purpose_tags(tag_id, label, label_key, display_like, request_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(tagId, input.label, labelKey, input.displayLike, requestSha256, createdAt);
      return { tagId, label: input.label, displayLike: input.displayLike, createdAt, deduplicated: false };
    });
    return execute();
  }

  purposeTags(): ContentPurposeTag[] {
    return this.#db.prepare('SELECT tag_id tagId, label, display_like displayLike, created_at createdAt FROM flow_content_purpose_tags ORDER BY created_at, tag_id').all() as ContentPurposeTag[];
  }

  /** Throws unless an idea of this kind may be generated now; returns the locked Insight version. */
  #assertGeneratable(campaignId: string, kind: ContentIdeaKind, parentIdeaId: string | undefined): number {
    if (this.#campaigns.lifecycleState(campaignId).deleted) throw new ContentIdeaConflictError('Campaign is deleted');
    const lock = this.#db.prepare('SELECT insight_version v FROM flow_content_insight_locks WHERE campaign_id = ?').get(campaignId) as { v: bigint | number } | undefined;
    if (!lock) throw new ContentIdeaConflictError('Insight must be locked before generating ideas');
    if (kind === 'ANGLE') {
      const parent = this.#idea(parentIdeaId!);
      if (!parent || parent.kind !== 'BIG_IDEA' || parent.campaignId !== campaignId) throw new ContentIdeaReferenceError('Parent Big Idea not found in this campaign');
      const state = this.stateOf(parent.ideaId);
      if (state.deleted) throw new ContentIdeaConflictError('Parent Big Idea is deleted');
      if (!state.developing) throw new ContentIdeaConflictError('Parent Big Idea is not being developed');
    }
    return Number(lock.v);
  }

  async #prepare(input: ContentIdeaGenerateRequest, insightVersion: number): Promise<PreparedGeneration> {
    const campaign = await this.#campaigns.readCampaign(input.campaignId);
    const insight = (await this.#insights.readInsight(input.campaignId, insightVersion)).insight;
    const products = [];
    for (const ref of campaign.campaign.items) {
      const item = (await this.#catalog.readItem(ref.itemId, ref.itemVersion)).item;
      const tiers = ref.tierKeys === undefined ? item.tiers : item.tiers.filter((tier) => ref.tierKeys!.includes(tier.tierKey));
      products.push({
        name: item.name, ...(item.description !== undefined ? { description: item.description } : {}), type: item.itemType,
        tiers: tiers.map((tier) => ({ name: tier.name, ...(tier.priceText !== undefined ? { priceText: tier.priceText } : {}), inclusions: [...tier.inclusions] })),
      });
    }
    const campaignFacts = {
      name: campaign.campaign.name, objective: campaign.campaign.objective, products,
      customer: insight.customer, pain_point: insight.painPoint, insight: insight.insight,
    };
    let lockedInput: Record<string, unknown>;
    if (input.kind === 'BIG_IDEA') {
      const previous = [];
      for (const row of this.#ideaRows("campaign_id = ? AND kind = 'BIG_IDEA'", input.campaignId)) {
        if (this.stateOf(row.ideaId).deleted) continue;
        const output = (await this.#verifiedArtifact(row)).output as { concept: string; expression: string };
        previous.push({ concept: output.concept, expression: output.expression });
      }
      lockedInput = { campaign: campaignFacts, previous_big_ideas: previous };
    } else {
      const parent = (await this.readIdea(input.parentIdeaId!)).output as { concept: string; expression: string };
      const previous = [];
      for (const row of this.#ideaRows('parent_idea_id = ?', input.parentIdeaId!)) {
        if (this.stateOf(row.ideaId).deleted) continue;
        const output = (await this.#verifiedArtifact(row)).output as { name: string; concept: string };
        previous.push({ name: output.name, concept: output.concept });
      }
      lockedInput = { context: { campaign: campaignFacts, big_idea: { concept: parent.concept, expression: parent.expression }, platform: FACEBOOK }, previous_angles: previous };
    }
    return { insightVersion, lockedInput: canonicalSnapshot(lockedInput), ...(await this.#promptChoice(input)) };
  }

  async #promptChoice(input: ContentIdeaGenerateRequest): Promise<Pick<PreparedGeneration, 'prompt' | 'creativeText' | 'promptRef'>> {
    const choice = input.prompt;
    if (choice.source === 'SYSTEM') {
      const entry = this.#library.find(choice.id, choice.version);
      if (!entry || entry.promptType !== input.kind) throw new ContentIdeaReferenceError(`Unknown ${input.kind} system prompt: ${choice.id}`);
      const creativeText = this.#library.read(choice.id, choice.version).prompt.creativeText;
      return { creativeText, promptRef: `system:${choice.id}@${choice.version}`, prompt: { source: 'SYSTEM', id: choice.id, version: choice.version, name: entry.name, creativeTextSha256: textDigest(creativeText) } };
    }
    if (choice.source === 'USER') {
      if (this.#prompts.promptTypeOf(choice.promptId) !== input.kind) throw new ContentIdeaReferenceError(`Unknown ${input.kind} prompt: ${choice.promptId}`);
      if (this.#prompts.lifecycleState(choice.promptId).deleted) throw new ContentIdeaConflictError('Prompt is deleted');
      if (!this.#prompts.promptVersions(choice.promptId).includes(choice.version)) throw new ContentIdeaReferenceError(`Unknown prompt version: ${choice.version}`);
      const prompt = (await this.#prompts.readPrompt(choice.promptId, choice.version)).prompt;
      return { creativeText: prompt.creativeText, promptRef: `user:${choice.promptId}@${choice.version}`, prompt: { source: 'USER', promptId: choice.promptId, version: choice.version, name: prompt.name, creativeTextSha256: textDigest(prompt.creativeText) } };
    }
    const creativeTextSha256 = textDigest(choice.creativeText);
    return { creativeText: choice.creativeText, promptRef: `freestyle:${creativeTextSha256}`, prompt: { source: 'FREESTYLE', name: FREESTYLE_PROMPT_NAME, creativeTextSha256, creativeText: choice.creativeText } };
  }

  async #verifiedArtifact(row: IdeaRow): Promise<ContentIdeaArtifact> {
    const artifact = validateContentIdeaArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const attempt = this.#attempts.list({ targetId: row.ideaId, limit: 10 }).find((record) => record.attemptId === row.attemptId);
    const userInput = `LOCKED_INPUT_JSON:\n${canonicalBytes(artifact.lockedInput).toString('utf8')}`;
    const layer = this.#library.layer(artifact.kind);
    if (
      artifact.ideaId !== row.ideaId ||
      artifact.campaignId !== row.campaignId ||
      artifact.kind !== row.kind ||
      (artifact.parentIdeaId ?? null) !== row.parentIdeaId ||
      artifact.insightVersion !== row.insightVersion ||
      artifact.requestId !== row.requestId ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.attemptId !== row.attemptId ||
      artifact.createdAt !== row.createdAt ||
      artifact.systemLayer.version !== layer.version ||
      artifact.systemLayer.sha256 !== layer.sha256 ||
      (artifact.prompt.source === 'FREESTYLE' && textDigest(artifact.prompt.creativeText) !== artifact.prompt.creativeTextSha256) ||
      inputBundleDigest(artifact.kind, layer, artifact.prompt.creativeTextSha256, artifact.model, userInput) !== artifact.inputBundleSha256 ||
      !attempt || attempt.state !== 'succeeded' || attempt.outputSha256 !== artifact.outputSha256 || attempt.inputBundleSha256 !== artifact.inputBundleSha256 || attempt.model !== artifact.model
    ) throw new ContentIdeaIntegrityError('Idea artifact does not match immutable metadata');
    try { ideaOutput(artifact.kind, artifact.output); } catch { throw new ContentIdeaIntegrityError('Idea artifact output breaks the idea rules'); }
    return artifact;
  }

  async #generateRetry(requestSha256: string, row: IdeaRow): Promise<ContentIdeaExecution> {
    if (row.requestSha256 !== requestSha256) throw new ContentIdeaConflictError('Idea request id was already used with changed content');
    await this.#verifiedArtifact(row);
    return { ideaId: row.ideaId, campaignId: row.campaignId, kind: row.kind, code: this.#code(row.kind, row.ordinal, row.parentIdeaId), attemptId: row.attemptId, createdAt: row.createdAt, deduplicated: true };
  }

  #code(kind: ContentIdeaKind, ordinal: number, parentIdeaId: string | null): string {
    if (kind === 'BIG_IDEA') return letterCode(ordinal);
    const parent = this.#idea(parentIdeaId!);
    if (!parent) throw new ContentIdeaIntegrityError('Parent Big Idea is missing');
    return `${letterCode(parent.ordinal)}${ordinal}`;
  }

  #nextOrdinal(campaignId: string, kind: ContentIdeaKind, parentIdeaId: string | null): number {
    const row = this.#db.prepare(`
      SELECT COALESCE(MAX(ordinal), 0) + 1 next FROM flow_content_ideas WHERE campaign_id = ? AND kind = ? AND COALESCE(parent_idea_id, '') = COALESCE(?, '')
    `).get(campaignId, kind, parentIdeaId) as { next: bigint | number };
    return Number(row.next);
  }

  #idea(ideaId: string): IdeaRow | undefined { return this.#ideaRows('idea_id = ?', ideaId)[0]; }
  #byRequest(requestId: string): IdeaRow | undefined { return this.#ideaRows('request_id = ?', requestId)[0]; }

  #ideaRows(where: string, ...values: unknown[]): IdeaRow[] {
    return (this.#db.prepare(`
      SELECT idea_id ideaId, campaign_id campaignId, kind, parent_idea_id parentIdeaId, ordinal, insight_version insightVersion, request_id requestId,
        request_sha256 requestSha256, attempt_id attemptId, idea_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_content_ideas WHERE ${where} ORDER BY ordinal
    `).all(...values) as (Omit<IdeaRow, 'ordinal' | 'insightVersion'> & { ordinal: bigint | number; insightVersion: bigint | number })[])
      .map((row) => ({ ...row, ordinal: Number(row.ordinal), insightVersion: Number(row.insightVersion) }));
  }

  #lastState(ideaId: string): StateRow | undefined { return this.#stateQuery('idea_id = ? ORDER BY sequence DESC LIMIT 1', ideaId); }
  #stateRow(ideaId: string, sequence: number): StateRow | undefined { return this.#stateQuery('idea_id = ? AND sequence = ?', ideaId, sequence); }

  #stateQuery(where: string, ...values: unknown[]): StateRow | undefined {
    const row = this.#db.prepare(`
      SELECT sequence, action, developing, deleted, purposes_json purposesJson, request_sha256 requestSha256, created_at createdAt
      FROM flow_content_idea_states WHERE ${where}
    `).get(...values) as { sequence: bigint | number; action: ContentIdeaStateAction; developing: bigint | number; deleted: bigint | number; purposesJson: string; requestSha256: string; createdAt: string } | undefined;
    if (!row) return undefined;
    return { sequence: Number(row.sequence), action: row.action, developing: Number(row.developing) === 1, deleted: Number(row.deleted) === 1, purposes: JSON.parse(row.purposesJson) as string[], requestSha256: row.requestSha256, createdAt: row.createdAt };
  }

  #tag(tagId: string): ContentPurposeTag | undefined {
    return this.#db.prepare('SELECT tag_id tagId, label, display_like displayLike, created_at createdAt FROM flow_content_purpose_tags WHERE tag_id = ?').get(tagId) as ContentPurposeTag | undefined;
  }

  #tagByKey(labelKey: string): ContentPurposeTag | undefined {
    return this.#db.prepare('SELECT tag_id tagId, label, display_like displayLike, created_at createdAt FROM flow_content_purpose_tags WHERE label_key = ?').get(labelKey) as ContentPurposeTag | undefined;
  }
}

/** A, B, …, Z, AA, AB, … (bijective base 26). */
export function letterCode(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new RangeError('ordinal must be a positive integer');
  let code = '';
  for (let n = ordinal; n > 0; n = Math.floor((n - 1) / 26)) code = String.fromCharCode(65 + ((n - 1) % 26)) + code;
  return code;
}

export function purposeLabelKey(label: string): string {
  return label.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
}

function nextState(action: ContentIdeaStateAction, state: ContentIdeaState, purposes: readonly string[] | undefined): { developing: boolean; deleted: boolean; purposes: readonly string[] } {
  const deleted = state.deleted !== undefined;
  switch (action) {
    case 'DEVELOP':
      if (deleted) throw new ContentIdeaConflictError('Deleted ideas cannot be developed');
      if (state.developing) throw new ContentIdeaConflictError('Idea is already being developed');
      return { developing: true, deleted: false, purposes: state.purposes };
    case 'STOP':
      if (deleted || !state.developing) throw new ContentIdeaConflictError('Idea is not being developed');
      return { developing: false, deleted: false, purposes: state.purposes };
    case 'DELETE':
      if (deleted) throw new ContentIdeaConflictError('Idea is already deleted');
      return { developing: false, deleted: true, purposes: state.purposes };
    case 'RESTORE':
      if (!deleted) throw new ContentIdeaConflictError('Idea is not deleted');
      if (state.expired) throw new ContentIdeaConflictError('Idea restore window has expired');
      return { developing: false, deleted: false, purposes: state.purposes };
    case 'PURPOSES':
      if (deleted) throw new ContentIdeaConflictError('Deleted ideas cannot change purposes');
      return { developing: state.developing, deleted: false, purposes: [...purposes!] };
  }
}

function stateExecution(ideaId: string, row: StateRow, deduplicated: boolean): ContentIdeaStateExecution {
  return { ideaId, sequence: row.sequence, action: row.action, createdAt: row.createdAt, ...(row.action === 'DELETE' ? { restorableUntil: restoreDeadline(row.createdAt) } : {}), deduplicated };
}

/** Kind/output consistency plus the Big Idea canonical aggregate limit (system layer v1). */
function ideaOutput(kind: ContentIdeaKind, value: unknown): ContentIdeaOutput {
  const output = value as Record<string, unknown>;
  const keys = typeof output === 'object' && output !== null ? Object.keys(output).sort().join(',') : '';
  if (kind === 'BIG_IDEA') {
    if (keys !== 'concept,expression') throw new ContentIdeaOutputError('Big Idea output must have concept and expression');
    if ([...canonicalBytes({ concept: output.concept, expression: output.expression }).toString('utf8')].length > BIG_IDEA_AGGREGATE_LIMIT) {
      throw new ContentIdeaOutputError('Big Idea output exceeds the aggregate length limit');
    }
  } else if (keys !== 'concept,name') throw new ContentIdeaOutputError('Angle output must have name and concept');
  return output as unknown as ContentIdeaOutput;
}

function inputBundleDigest(kind: ContentIdeaKind, layer: { readonly version: number; readonly sha256: string }, creativeTextSha256: string, model: string, userInput: string): string {
  return canonicalDigest({ systemLayer: { type: kind, version: layer.version, sha256: layer.sha256 }, creativeTextSha256, model, userInput });
}

function textDigest(text: string): string { return sha256(Buffer.from(text, 'utf8')); }

function isUuid(value: string): boolean {
  try { assertContentUuid(value); return true; } catch { return false; }
}

function assertId(value: string): void {
  if (!isUuid(value)) throw new FlowValidationError('ID must be a UUID');
}
