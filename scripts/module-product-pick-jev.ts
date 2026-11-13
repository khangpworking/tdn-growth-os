import { createHash } from 'node:crypto';
import { TypesafeJevClient, typesafeJevConfigurationFromEnvironment, type TypesafeJevQuestion } from '../src/platform/ai/typesafe-jev-client.js';

/**
 * The one Jev question of rule metric-products-unique-v2 (work package C1, section 3.2): is this listing one of the
 * products already picked, or a new product? Changing any text below or the threshold is a new rule name.
 */
export const PICK_JEV_TEXTS = Object.freeze({
  listing: '<tên> (thương hiệu: <thương hiệu>; shop: <tên shop>)',
  statePrefix: 'Tin đăng cần xét: ',
  instructions: 'The state is one Shopee listing. Options SP1, SP2... are products already on the list. Choose an existing product if the listing sells that same product (same brand, same product line, same main ingredients), even when the seller, pack size, days of supply, gift or title wording differ. Choose MOI if the listing sells a product that is not on the list.',
  samePrefix: 'The listing sells this same product: ',
  newOption: 'A new product: not the same as any product already on the list',
});
export const PICK_JEV_THRESHOLD = 0.7;
export const PICK_JEV_PROVIDER = 'typesafe-jev';
const QUESTION_ID = 'PICK';
const PROBABILITY_SUM_TOLERANCE = 0.02;
const RETRY_WAITS_MS = [1000, 3000];

/** Like the review filter's policy hash: sha256 of the question texts and templates. */
export function pickQuestionVersion(texts: Readonly<Record<string, string>> = PICK_JEV_TEXTS): string {
  return createHash('sha256').update(JSON.stringify(texts), 'utf8').digest('hex');
}
export const PICK_JEV_QUESTION_VERSION = pickQuestionVersion();

type Row = Record<string, unknown>;
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
/** `<tên> (thương hiệu: <thương hiệu>; shop: <tên shop>)`; the name with every run of white space as one space. */
export function describeListing(row: Row): string {
  const brand = filled(row.final_brand) ? row.final_brand : filled(row.brand) ? row.brand : 'không rõ';
  const shop = filled(row.shop_name) ? row.shop_name : 'không rõ';
  return `${String(row.product_name).replace(/\s+/g, ' ').trim()} (thương hiệu: ${brand}; shop: ${shop})`;
}

/** The question for one listing; options SP1..SPn follow the pick order, then MOI. */
export function pickQuestion(row: Row, picked: readonly Row[]): TypesafeJevQuestion {
  const criteria: Record<string, string> = {};
  picked.forEach((product, i) => { criteria[`SP${i + 1}`] = `${PICK_JEV_TEXTS.samePrefix}${describeListing(product)}`; });
  criteria.MOI = PICK_JEV_TEXTS.newOption;
  return { id: QUESTION_ID, state: `${PICK_JEV_TEXTS.statePrefix}${describeListing(row)}`, instructions: PICK_JEV_TEXTS.instructions, criteria };
}

export interface PickAnswer { readonly choice: string; readonly probabilities: Readonly<Record<string, number>> }
export class PickJevUnavailable extends Error { constructor() { super('PICK_JEV_UNAVAILABLE'); } }

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
/** The answer checks of the review filter (review-filter.ts parseFilterAnswer): exact options, each 0..1, sum 1 ± 0.02. */
export function validPickProbabilities(value: unknown, options: readonly string[]): value is Record<string, number> {
  return isRecord(value) && sameKeys(value, options) && Object.values(value).every(isProbability) &&
    Math.abs((Object.values(value) as number[]).reduce((sum, v) => sum + v, 0) - 1) <= PROBABILITY_SUM_TOLERANCE + 1e-9;
}
function parsePickAnswer(model: string, question: TypesafeJevQuestion, status: number | null, raw: Buffer | null): PickAnswer | null {
  if (status !== 200 || raw === null) return null;
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { return null; }
  if (!isRecord(payload) || payload.model !== model || !isRecord(payload.answers) || !sameKeys(payload.answers, [question.id])) return null;
  const answer = payload.answers[question.id], options = Object.keys(question.criteria);
  if (!isRecord(answer) || answer.type !== 'choice' || !options.includes(answer.choice as string) || !isProbability(answer.confidence) ||
      !validPickProbabilities(answer.probabilities, options)) return null;
  return { choice: answer.choice as string, probabilities: answer.probabilities };
}

export type PickJev = Pick<TypesafeJevClient, 'model' | 'answerRaw'>;
const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
/** One question per request, at most 3 attempts (wait 1 s, then 3 s). Throws PickJevUnavailable; never carries the request. */
export async function askPickJev(jev: PickJev, question: TypesafeJevQuestion, sleep: (ms: number) => Promise<void> = wait): Promise<PickAnswer> {
  for (let attempt = 0; ; attempt++) {
    let answer: PickAnswer | null = null;
    try {
      const response = await jev.answerRaw([question]);
      answer = parsePickAnswer(jev.model, question, response.status, response.body);
    } catch { answer = null; }
    if (answer) return answer;
    if (attempt >= RETRY_WAITS_MS.length) throw new PickJevUnavailable();
    await sleep(RETRY_WAITS_MS[attempt]!);
  }
}

/** The real client from the existing environment settings; disabled or a missing key is PICK_JEV_UNAVAILABLE. */
export function pickJevFromEnvironment(environment: NodeJS.ProcessEnv = process.env): PickJev {
  try {
    const configuration = typesafeJevConfigurationFromEnvironment(environment);
    if (!configuration.enabled) throw new PickJevUnavailable();
    return new TypesafeJevClient(configuration);
  } catch { throw new PickJevUnavailable(); }
}
