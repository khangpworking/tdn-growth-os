const TYPESAFE_JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RESPONSE_LIMIT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const API_KEY = /^[\x21-\x7e]{1,512}$/;

export const DEFAULT_TYPESAFE_JEV_MODEL = 'jev-1.13.0' as const;

export interface TypesafeJevConfiguration {
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly model: string;
}

export function typesafeJevConfigurationFromEnvironment(environment: NodeJS.ProcessEnv): TypesafeJevConfiguration {
  const enabled = environment.TDN_RESEARCH_JEV_ENABLED === 'true';
  const model = environment.TDN_RESEARCH_JEV_MODEL ?? DEFAULT_TYPESAFE_JEV_MODEL;
  if (typeof model !== 'string' || model.length < 1 || model.length > 120 || /[^\x21-\x7e]/u.test(model)) {
    throw new TypeError('TDN_RESEARCH_JEV_MODEL must be 1-120 printable ASCII characters');
  }
  if (!enabled) return Object.freeze({ enabled: false, model });
  const apiKey = environment.TYPESAFE_API_KEY;
  if (apiKey === undefined) throw new TypeError('TYPESAFE_API_KEY is required when TDN_RESEARCH_JEV_ENABLED is true');
  if (!API_KEY.test(apiKey) || apiKey.includes(' ')) {
    throw new TypeError('TYPESAFE_API_KEY must be 1-512 printable ASCII characters without spaces');
  }
  return Object.freeze({ enabled: true, apiKey, model });
}

export interface TypesafeJevQuestion {
  readonly id: string;
  readonly state: unknown;
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
}

export interface TypesafeJevAnswer {
  readonly type: 'choice';
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
}

export interface TypesafeJevBatchResult {
  readonly status: 'OK' | 'UNAVAILABLE';
  readonly model: string;
  readonly answers: ReadonlyMap<string, TypesafeJevAnswer | null>;
}

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validProbabilityMap(value: unknown, options: readonly string[]): value is Record<string, number> {
  if (!isRecord(value) || Object.keys(value).length !== options.length || options.some(option => !Object.hasOwn(value, option))) return false;
  const numbers = options.map(option => value[option]);
  if (numbers.some(number => typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1)) return false;
  return Math.abs((numbers as number[]).reduce((sum, number) => sum + number, 0) - 1) <= 0.02;
}

function validateAnswer(value: unknown, question: TypesafeJevQuestion): TypesafeJevAnswer | null {
  if (!isRecord(value) || value.type !== 'choice' || typeof value.choice !== 'string' ||
    !Object.hasOwn(question.criteria, value.choice) || !validProbabilityMap(value.probabilities, Object.keys(question.criteria)) ||
    typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  return { type: 'choice', choice: value.choice, probabilities: value.probabilities, confidence: value.confidence };
}

async function readBoundedResponse(response: Response): Promise<string | null> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > RESPONSE_LIMIT_BYTES) return null;
  if (!response.body) {
    const text = await response.text();
    return Buffer.byteLength(text, 'utf8') <= RESPONSE_LIMIT_BYTES ? text : null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export class TypesafeJevClient {
  readonly #configuration: TypesafeJevConfiguration;
  readonly #fetch: FetchLike;

  constructor(configuration: TypesafeJevConfiguration, fetchImplementation: FetchLike = fetch) {
    if (!configuration || configuration.enabled !== true || typeof configuration.apiKey !== 'string' ||
      !API_KEY.test(configuration.apiKey) || configuration.apiKey.includes(' ') ||
      typeof configuration.model !== 'string' || configuration.model.length < 1) {
      throw new TypeError('Invalid TypeSafe Jev configuration');
    }
    this.#configuration = Object.freeze({ ...configuration });
    this.#fetch = fetchImplementation;
  }

  get model(): string { return this.#configuration.model; }

  async answer(questions: readonly TypesafeJevQuestion[]): Promise<TypesafeJevBatchResult> {
    const empty = (): TypesafeJevBatchResult => ({ status: 'UNAVAILABLE', model: this.#configuration.model, answers: new Map(questions.map(question => [question.id, null])) });
    if (questions.length === 0) return { status: 'OK', model: this.#configuration.model, answers: new Map() };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.#fetch(TYPESAFE_JEV_ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#configuration.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.#configuration.model, state: Object.fromEntries(questions.map(question => [question.id, question.state])),
          questions: Object.fromEntries(questions.map(question => [question.id, { type: 'choice', instructions: question.instructions, criteria: question.criteria }])) }),
      });
      if (!response.ok) return empty();
      const text = await readBoundedResponse(response);
      if (text === null) return empty();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { return empty(); }
      if (!isRecord(payload) || payload.model !== this.#configuration.model || !isRecord(payload.answers)) return empty();
      const answers = new Map<string, TypesafeJevAnswer | null>();
      for (const question of questions) answers.set(question.id, validateAnswer(payload.answers[question.id], question));
      return { status: [...answers.values()].some(answer => answer === null) ? 'UNAVAILABLE' : 'OK', model: this.#configuration.model, answers };
    } catch {
      return empty();
    } finally {
      clearTimeout(timer);
    }
  }
}
