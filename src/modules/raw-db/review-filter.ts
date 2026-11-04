import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import type { TypesafeJevClient, TypesafeJevQuestion } from '../../platform/ai/typesafe-jev-client.js';
import { acquireLabelsLock } from './labels-lock.js';
import { sha256 } from './review-code-loader.js';

/**
 * The db-v1 review filter in shadow mode (owner F424, F427, F429, F430; R-RF01 to R-RF10): one Jev call per product review
 * with content asks whether it is about this product or order (LOC) and whether it complains (CHE); code then decides with
 * the star guards. Rows go to the insert-only `review_filter_assessment`. Nothing else reads that table: counts, labels,
 * reports and the MCP are unchanged. Visible attribute content goes to Jev even when it precedes a trailing colon.
 */

/** Only `true` runs the filter pass in the automatic load. */
export const REVIEW_FILTER_ENV = 'TDN_RAW_DB_REVIEW_FILTER_ENABLED';
export function reviewFilterEnabled(environment: NodeJS.ProcessEnv): boolean { return environment[REVIEW_FILTER_ENV] === 'true'; }
export const REVIEW_FILTER_POLICY_VERSION = '2026-11-04.2';
/** F379: the one cap, per pass. */
export const REVIEW_FILTER_MAX_CALLS = 1500;
const EXCLUDE_AT = 0.7, COMPLAINT_AT = 0.5, PROBABILITY_SUM_TOLERANCE = 0.02;

const LOC = {
  id: 'LOC',
  instructions: 'Nội dung có liên quan đến sản phẩm hoặc đơn hàng đang được đánh giá không? Đọc cả lời viết và các mục khách điền. Các mục dạng «Tên mục: câu trả lời» có thể nằm ngay trong lời viết; vẫn tính đó là nội dung người mua cung cấp. Chỉ cần có một ý hiểu được và liên quan thì giữ, dù phần khác lạc đề. So sánh, sản phẩm dùng kết hợp và quà kèm có thể liên quan. Phản hồi ngắn, emoji, chưa dùng, chưa biết kết quả hoặc chưa nhận hàng vẫn có thể liên quan. Lời ngắn kiểu khẩu ngữ (tạm, cũng cũng) vẫn là phản hồi. Không xét lời viết thật hay giả. Không loại vì văn phong giống quảng cáo, nhận xu, lặp lời hoặc ngắn. Mô tả đúng sản phẩm vẫn được giữ.',
  criteria: {
    GIU: 'Có ý liên quan đến sản phẩm hoặc đơn hàng này',
    LOAI: 'Toàn bộ nội dung rõ ràng không liên quan, hoặc là chữ gõ bừa không đọc ra nghĩa',
    RIENG: 'Chưa đủ căn cứ phân biệt hai trường hợp trên',
  },
} as const;
const CHE = {
  id: 'CHE',
  instructions: 'Trong phần liên quan, người viết có nêu nhận xét bất lợi về sản phẩm hoặc đơn hàng này không? Phân biệt sản phẩm hiện tại với sản phẩm khác; tình trạng có sẵn với điều xảy ra khi dùng. Bệnh trạng trước dùng và việc chưa thể đánh giá không tự động là lời chê. Vẫn tính vấn đề đi kèm lời khen.',
  criteria: {
    CO: 'Có vấn đề hoặc nhận xét bất lợi được nêu rõ',
    KHONG: 'Không có nhận xét bất lợi',
    RIENG: 'Có thể có nhận xét bất lợi nhưng chưa xác định được ý nghĩa hoặc đối tượng',
  },
} as const;
const QUESTIONS = [LOC, CHE] as const;

export function reviewFilterPolicySha256(): string {
  return sha256(Buffer.from(JSON.stringify(QUESTIONS.map(q => ({ id: q.id, instructions: q.instructions, criteria: q.criteria }))), 'utf8'));
}

// White space, control and format characters (zero-width, BOM) and the blank-looking fillers count as empty.
const BLANK_RE = /[\s\p{Cc}\p{Cf}\p{Zs}\u115F\u1160\u2800\u3164\uFFA0]/gu;
const blank = (text: string) => !text.replace(BLANK_RE, '');
const parseJson = (text: string): unknown => { try { return JSON.parse(text); } catch { return text; } };
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

/**
 * R-RF03, R-RV06: content = a text with a character other than blank or punctuation (symbols and emoji count), or an
 * attributes_json item with a visible character other than a colon.
 * Content before a colon counts too. A JSON value of another shape counts as content unless null.
 */
export function hasReviewContent(text: string | null, attributesJson: string | null): boolean {
  if (text !== null && text.replace(BLANK_RE, '').replace(/\p{P}/gu, '')) return true;
  if (attributesJson === null) return false;
  const attributes = parseJson(attributesJson);
  if (!isStringList(attributes)) return attributes !== null && !blank(attributesJson);
  return attributes.some(item => !blank(item.replace(/[:：]/g, '')));
}

/** R-RF04, R-RV06: both questions share one state: product name, text and the customer-filled items. No star, platform or group. */
export function reviewFilterQuestions(input: { productName: string | null; text: string | null; attributesJson: string | null }): TypesafeJevQuestion[] {
  const parsed = input.attributesJson === null ? null : parseJson(input.attributesJson);
  const attrs = input.attributesJson === null ? '' : isStringList(parsed) ? parsed.join('; ') : input.attributesJson;
  const state = `Sản phẩm đang được đánh giá: ${input.productName || 'không rõ'}\nLời viết: ${(input.text ?? '').trim() || '(trống)'}\n`
    + `Các mục khách điền, gồm tên mục và câu trả lời: ${attrs || '(trống)'}`;
  return QUESTIONS.map(q => ({ id: q.id, state, instructions: q.instructions, criteria: { ...q.criteria } }));
}

export type ReviewFilterOutcome = 'KEEP' | 'EXCLUDE' | 'UNRESOLVED' | 'NO_CONTENT';
export type ReviewFilterReason = 'JEV_KEEP' | 'JEV_EXCLUDE' | 'JEV_UNRESOLVED' | 'GUARD_LOW_STAR' | 'GUARD_NO_STAR' | 'GUARD_COMPLAINT' | 'EMPTY';

/** R-RF05: a likely exclusion is only an EXCLUDE above 3 stars without a likely complaint. */
export function decideReviewFilter(input: { keep: number; exclude: number; unresolved: number; complaint: number; star: number | null }): { outcome: ReviewFilterOutcome; reason: ReviewFilterReason } {
  if (input.exclude >= EXCLUDE_AT) {
    if (input.star === null) return { outcome: 'UNRESOLVED', reason: 'GUARD_NO_STAR' };
    if (input.star <= 3) return { outcome: 'UNRESOLVED', reason: 'GUARD_LOW_STAR' };
    if (input.complaint >= COMPLAINT_AT) return { outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' };
    return { outcome: 'EXCLUDE', reason: 'JEV_EXCLUDE' };
  }
  return input.keep >= Math.max(input.exclude, input.unresolved) ? { outcome: 'KEEP', reason: 'JEV_KEEP' } : { outcome: 'UNRESOLVED', reason: 'JEV_UNRESOLVED' };
}

export interface ReviewFilterResult {
  policyVersion: string; eligible: number; noContent: number; planned: number; called: number; inserted: number;
  outcomes: Record<ReviewFilterOutcome, number>;
  /** Reviews in scope left without a row by this pass (dry run, cap or a failed call); a later pass picks them up. */
  notAssessed: number;
  failed: { code: 'REVIEW_FILTER_UNAVAILABLE' | 'REVIEW_FILTER_INVALID'; reviewKey: string } | null;
}

class FilterCallFailed extends Error {
  constructor(readonly code: 'REVIEW_FILTER_UNAVAILABLE' | 'REVIEW_FILTER_INVALID') { super(code); }
}
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** R-RF07: the probabilities by question id; throws FilterCallFailed on a failed call or a malformed answer. */
function parseFilterAnswer(model: string, status: number | null, raw: Buffer | null): Record<'LOC' | 'CHE', Record<string, number>> {
  if (status !== 200 || raw === null) throw new FilterCallFailed('REVIEW_FILTER_UNAVAILABLE');
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new FilterCallFailed('REVIEW_FILTER_UNAVAILABLE'); }
  if (!isRecord(payload)) throw new FilterCallFailed('REVIEW_FILTER_UNAVAILABLE');
  const invalid = () => new FilterCallFailed('REVIEW_FILTER_INVALID');
  if (payload.model !== model || !isRecord(payload.answers)) throw invalid();
  const answers = payload.answers;
  const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
  if (!sameKeys(answers, QUESTIONS.map(q => q.id))) throw invalid();
  const out = {} as Record<'LOC' | 'CHE', Record<string, number>>;
  for (const question of QUESTIONS) {
    const answer = answers[question.id], options = Object.keys(question.criteria);
    if (!isRecord(answer) || answer.type !== 'choice' || !options.includes(answer.choice as string) || !isProbability(answer.confidence)) throw invalid();
    const probs = answer.probabilities;
    if (!isRecord(probs) || !sameKeys(probs, options) || !Object.values(probs).every(isProbability)) throw invalid();
    if (Math.abs((Object.values(probs) as number[]).reduce((sum, v) => sum + v, 0) - 1) > PROBABILITY_SUM_TOLERANCE + 1e-9) throw invalid();
    out[question.id] = probs as Record<string, number>;
  }
  return out;
}

interface Candidate { review_key: string; text: string | null; attributes_json: string | null; rating_star: number | bigint | null; product_name: string | null; run_id: string }

/**
 * One filter pass over Shopee and TikTok Shop product reviews (one run, or all) without a row for the policy version. A review
 * linked to several runs is assessed once, under its first run. Reviews without content get NO_CONTENT rows without a call;
 * each other review = one Jev call, its raw response stored in the artifact store and its row written after the answer is
 * checked. A failed call writes nothing for that review and stops the pass. A real pass holds the labelling lock
 * (LabelsBusyError when busy); a dry run takes no lock, calls nothing and writes nothing.
 */
export async function filterReviewsInDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore | null, client: TypesafeJevClient | null,
  input: { runId?: string | undefined; maxCalls?: number | undefined; dryRun?: boolean | undefined; policyVersion?: string | undefined }): Promise<ReviewFilterResult> {
  if (input.maxCalls !== undefined && !(Number.isInteger(input.maxCalls) && input.maxCalls >= 1)) throw new Error('RAW_DB_FILTER_MAX_CALLS_INVALID: --max-calls must be a positive integer');
  if (!input.dryRun && (!client || !artifacts)) throw new Error('RAW_DB_FILTER_JEV_DISABLED: a filter pass needs the Jev client and the artifact store');
  const release = input.dryRun ? () => {} : acquireLabelsLock(db);
  try { return await filterPass(db, artifacts, client, input, input.policyVersion ?? REVIEW_FILTER_POLICY_VERSION); }
  finally { release(); }
}

async function filterPass(db: Database.Database, artifacts: ContentAddressedArtifactStore | null, client: TypesafeJevClient | null,
  input: { runId?: string | undefined; maxCalls?: number | undefined; dryRun?: boolean | undefined }, version: string): Promise<ReviewFilterResult> {
  const candidates = db.prepare(`SELECT r.review_key, r.text, r.attributes_json, r.rating_star, p.product_name, rr.run_id
    FROM review r JOIN run_review rr ON rr.review_key = r.review_key LEFT JOIN product p ON p.product_key = r.product_key
    WHERE r.platform IN ('shopee','tiktok_shop') AND r.kind = 'product_review' AND (@run IS NULL OR rr.run_id = @run)
      AND NOT EXISTS (SELECT 1 FROM review_filter_assessment a WHERE a.review_key = r.review_key AND a.policy_version = @version)
    ORDER BY rr.run_id, r.review_key`).all({ run: input.runId ?? null, version }) as Candidate[];
  const seen = new Set<string>();
  const eligible: Candidate[] = [], empty: Candidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.review_key)) continue;
    seen.add(candidate.review_key);
    (hasReviewContent(candidate.text, candidate.attributes_json) ? eligible : empty).push(candidate);
  }
  const cap = Math.min(REVIEW_FILTER_MAX_CALLS, input.maxCalls ?? Infinity);
  const result: ReviewFilterResult = { policyVersion: version, eligible: eligible.length, noContent: empty.length, planned: Math.min(eligible.length, cap),
    called: 0, inserted: 0, outcomes: { KEEP: 0, EXCLUDE: 0, UNRESOLVED: 0, NO_CONTENT: 0 }, notAssessed: eligible.length + empty.length, failed: null };
  if (input.dryRun || !candidates.length) return result;

  const policySha256 = reviewFilterPolicySha256();
  const assessed = db.prepare('SELECT 1 FROM review_filter_assessment WHERE review_key=? AND policy_version=?');
  const insert = db.prepare(`INSERT INTO review_filter_assessment(review_key,policy_version,policy_sha256,run_id,outcome,reason,p_keep,p_exclude,p_unresolved,p_complaint,
    rating_star,model,text_sha256,response_sha256,assessed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(review_key, policy_version) DO NOTHING`);
  const star = (value: Candidate['rating_star']) => value === null ? null : Number(value);
  const done = (outcome: ReviewFilterOutcome, changes: number) => { if (changes) { result.inserted++; result.outcomes[outcome]++; } result.notAssessed--; };
  const emptySha256 = sha256(Buffer.alloc(0));
  db.transaction(() => {
    const assessedAt = new Date().toISOString();
    for (const review of empty) {
      done('NO_CONTENT', insert.run(review.review_key, version, policySha256, review.run_id, 'NO_CONTENT', 'EMPTY', null, null, null, null,
        star(review.rating_star), null, emptySha256, null, assessedAt).changes);
    }
  })();
  for (const review of eligible) {
    if (result.called >= cap) break;
    // Never pay twice: another writer may have assessed this review since the plan.
    if (assessed.get(review.review_key, version)) { result.notAssessed--; continue; }
    const questions = reviewFilterQuestions({ productName: review.product_name, text: review.text, attributesJson: review.attributes_json });
    const assessedAt = new Date().toISOString();
    result.called++;
    const response = await client!.answerRaw(questions);
    let answer: ReturnType<typeof parseFilterAnswer>;
    try { answer = parseFilterAnswer(client!.model, response.status, response.body); }
    catch (error) {
      if (!(error instanceof FilterCallFailed)) throw error;
      result.failed = { code: error.code, reviewKey: review.review_key };
      break;
    }
    const responseSha256 = (await artifacts!.put(response.body!)).sha256;
    const p = { keep: answer.LOC.GIU!, exclude: answer.LOC.LOAI!, unresolved: answer.LOC.RIENG!, complaint: Math.min(1, answer.CHE.CO! + answer.CHE.RIENG!) };
    const decision = decideReviewFilter({ ...p, star: star(review.rating_star) });
    done(decision.outcome, insert.run(review.review_key, version, policySha256, review.run_id, decision.outcome, decision.reason, p.keep, p.exclude, p.unresolved,
      p.complaint, star(review.rating_star), client!.model, sha256(Buffer.from(questions[0]!.state as string, 'utf8')), responseSha256, assessedAt).changes);
  }
  return result;
}
