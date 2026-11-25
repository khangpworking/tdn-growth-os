import './lazy-validators-on.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import { ModuleError, validateModuleValue } from './module-pick.js';
import { compileAll } from '../src/platform/lazy-validator.js';
import { discoverModuleReviewSources, prepareReviewExport, publishLabelledReviewExport, readReviewExportBytes, validateReviewData,
  type ModuleReviewRow, type VerifiedModuleReviewCollection } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView, saveModuleReviewData } from '../src/modules/raw-db/module-shopee-reviews.js';
import { reviewProcessJevClient, reviewProcessLabelCoverage, reviewProcessSettings, reviewProcessStart, reviewProcessStartable, reviewProcessView, runReviewProcess,
  runReviewProcessAfterM3 } from '../src/modules/raw-db/module-review-process.js';
import { DEFAULT_CODEBOOK_FILE, codingText, parseLabelCodebook, type LabelCodebook } from '../src/modules/raw-db/review-labeller.js';
import type { ReviewDataSaveInput, ReviewDataExportInput } from '../contracts/foundation/shopee-module-review-data.generated.js';

async function input():Promise<unknown> {
  const chunks:Buffer[]=[];let size=0;
  for await (const chunk of process.stdin) {const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw new ModuleError('REVIEW_DATA_INVALID',2);chunks.push(bytes);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Numbers only: no comment text, user name or user id is copied out of a row. */
function reviewNumbers(rows:ModuleReviewRow[]) {
  const stars=[1,2,3,4,5].map(star=>rows.filter(row=>row.ratingStar===star).length), rated=stars.reduce((a,b)=>a+b,0);
  const times=rows.flatMap(row=>typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt))?[row.createdAt]:[])
    .sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {commentCount:rows.length,averageStar:rated?stars.reduce((sum,count,i)=>sum+count*(i+1),0)/rated:null,
    starCounts:{'1':stars[0]!,'2':stars[1]!,'3':stars[2]!,'4':stars[3]!,'5':stars[4]!},
    firstCommentAt:times[0]??null,lastCommentAt:times.at(-1)??null};
}
/** Comment numbers per verified step-3 result (the same sources step 3 offers), for all links and per link. */
export async function reviewStatsView(run:string, discovered?:VerifiedModuleReviewCollection[]):Promise<unknown> {
  const sources=(discovered ?? await discoverModuleReviewSources(run)).map(source=>({sourceSha256:source.sourceSha256,kind:source.kind,
    status:source.status,completedAt:source.completedAt,all:reviewNumbers(source.rows),
    links:source.links.map(link=>({shopId:link.shopId,itemId:link.itemId,url:link.url,
      ...reviewNumbers(source.rows.filter(row=>row.shopId===link.shopId&&row.itemId===link.itemId))}))}));
  const view={format:'review-stats-v1',runId:basename(run),sources};
  await validateModuleValue('review-stats-v1',view);
  return view;
}

type InsightPolarity = 'khen'|'che'|'ke'|'khong_ro_huong';
type InsightTag = { code:string; name:string; polarity:InsightPolarity; status:'kept'|'unclear'; choice:string|null };
type InsightComment = { id:string; text:string; rating:number|null; date:string|null; productName:string|null; url:string|null; tags:InsightTag[] };
type InsightTheme = { code:string; name:string; count:number; unclearCount:number; share:number;
  polarityCounts:Record<InsightPolarity,number>; summary:InsightSummary; comments:InsightComment[] };
type InsightPoint = { text:string; count:number; commentIds:string[] };
type InsightSummary = { status:'READY'|'EMPTY'|'UNAVAILABLE'; text:string|null; model:string|null; generatedAt:string|null;
  points?:InsightPoint[] };
type InsightBucket = { summary:InsightSummary; themes:InsightTheme[]; comments:InsightComment[] };

const INSIGHT_MAX_COMMENTS = 200;
// Stay below SQLite's default 999-variable limit for the external-id IN list.
const INSIGHT_LABEL_BATCH = 500;
const INSIGHT_POLARITIES:InsightPolarity[] = ['khen','che','ke','khong_ro_huong'];
const insightSha256 = (value:string):string => createHash('sha256').update(value,'utf8').digest('hex');

type StoredInsightLabel = {
  externalId:string; productName:string|null; textSha256:string; code:string; polarity:InsightPolarity;
  status:'kept'|'unclear'; choice:string|null;
};

/** Stored Jev labels of one review id; whether they apply is decided per row by insightRowTags. */
type StoredRowTag = InsightTag & { textSha256:string; known:boolean };
export type InsightLabelStore = { labels:Map<string,StoredRowTag[]>; productNames:Map<string,string>; available:boolean };

/**
 * A row's tags: the review id's labels only when every label's text hash matches THIS row's own text
 * (stale labels are ignored as a group). Two results may share a review id with different text.
 */
export function insightRowTags(row:ModuleReviewRow, store:InsightLabelStore):InsightTag[] {
  return insightRowLabels(row,store).filter(entry => entry.known).map(({ code, name, polarity, status, choice }) => ({ code, name, polarity, status, choice }));
}

/** Every stored Jev result of THIS row's text, including "no theme"; non-empty means Jev read the row (as step 4 counts it). */
function insightRowLabels(row:ModuleReviewRow, store:InsightLabelStore):StoredRowTag[] {
  const entries = row.reviewId ? store.labels.get(row.reviewId) : undefined;
  if (!entries?.length) return [];
  const attributesJson = row.attributes.length ? JSON.stringify(row.attributes) : null;
  const hash = insightSha256(codingText(row.comment,attributesJson));
  return entries.some(entry => entry.textSha256 !== hash) ? [] : entries;
}

/** Read Jev's persisted APP_JEV labels without changing the application DB. */
function readInsightLabels(rows:ModuleReviewRow[], book:LabelCodebook): InsightLabelStore {
  const labels = new Map<string,StoredRowTag[]>(), productNames = new Map<string,string>();
  const databasePath = process.env.TDN_WORKSPACE_DB;
  if (!databasePath || !isAbsolute(databasePath)) return { labels, productNames, available:false };
  let db:BetterSqlite3.Database;
  try {
    db = new BetterSqlite3(databasePath,{readonly:true,fileMustExist:true});
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 5000');
  } catch {
    return { labels, productNames, available:false };
  }
  try {
    const wanted = new Set(rows.flatMap(row => row.reviewId ? [row.reviewId] : []));
    if (!wanted.size) return { labels, productNames, available:true };
    const wantedIds = [...wanted.keys()];
    const stored:StoredInsightLabel[] = [];
    for (let start = 0; start < wantedIds.length; start += INSIGHT_LABEL_BATCH) {
      const chunk = wantedIds.slice(start,start + INSIGHT_LABEL_BATCH);
      stored.push(...db.prepare(`SELECT r.external_id externalId, r.text reviewText, r.attributes_json attributesJson,
        p.product_name productName, c.theme_code code, c.polarity polarity, c.status status, c.choice choice,
        c.text_sha256 textSha256
        FROM review r JOIN review_code c ON c.review_key=r.review_key
        LEFT JOIN product p ON p.product_key=r.product_key
        WHERE r.source_code='S05' AND r.kind='product_review' AND c.origin='APP_JEV' AND c.codebook_version=?
          AND r.external_id IN (${chunk.map(() => '?').join(',')})
        ORDER BY r.external_id, c.theme_code`).all(book.version,...chunk) as StoredInsightLabel[]);
    }
    const names = new Map(book.core.map(theme => [theme.code,theme.name] as const));
    for (const item of stored) {
      if (!wanted.has(item.externalId)) continue;
      const entries = labels.get(item.externalId) ?? [];
      entries.push({ code:item.code, name:names.get(item.code) ?? item.code, polarity:item.polarity, status:item.status,
        choice:item.choice, textSha256:item.textSha256, known:names.has(item.code) });
      labels.set(item.externalId,entries);
      if (item.productName) productNames.set(item.externalId,item.productName);
    }
    return { labels, productNames, available:true };
  } catch {
    return { labels:new Map(), productNames:new Map(), available:false };
  } finally {
    db.close();
  }
}

function insightComment(row:ModuleReviewRow, sourceSha256:string, index:number, tags:InsightTag[], productName:string|null):InsightComment {
  return { id:row.reviewId ?? `${sourceSha256}:${index}`, text:row.comment?.trim() ? row.comment : row.attributes.join(' · '),
    rating:Number.isInteger(row.ratingStar) && row.ratingStar! >= 1 && row.ratingStar! <= 5 ? row.ratingStar : null,
    date:row.createdAt ?? row.postedAtLocal ?? null, productName, url:row.sourceUrl, tags };
}

const INSIGHT_THEME_MODEL = 'jev-grouped-theme-v1';
const INSIGHT_THEME_MAX_POINTS = 5;
const INSIGHT_POINT_MAX_WORDS = 20;
const INSIGHT_POINT_MAX_CHARS = 160;
const INSIGHT_SENTENCE_MIN_CHARS = 4;
// Function words only: sentiment and product terms stay in the recurrence score.
const INSIGHT_STOPWORDS = new Set(['la','và','của','có','cho','với','không','được','rất','này','những','các','một',
  'mình','thấy','thì','mà','khi','nếu','nhưng','để','từ','đến','trong','ngoài','trên','dưới','ra','vào','lên','xuống',
  'cũng','vẫn','đã','đang','sẽ','bị','do','vì','nên','hơi','khá','quá','lắm','nhiều','ít','ạ','nhé','nha','nhỉ','đó',
  'kia','ấy','tôi','bạn','em','anh','chị','họ','nó','vậy','thế','rồi','chứ','như','theo','về','giữa','sau','trước',
  'mỗi','mọi','ai','gì','nào','sao','ok','oke','okela','đi','nhá','đấy','ơi','à','ừ','vâng','dạ']);

type InsightSentence = { text:string; key:string; tokens:Set<string>; score:number };
type InsightPointComment = { id:string; index:number; sentences:InsightSentence[] };

function insightFlatten(text:string):string {
  return text.replace(/\s+/g,' ').trim();
}

function insightSentenceKey(text:string):string {
  return insightFlatten(text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' '));
}

function insightTokens(text:string):Set<string> {
  const words = text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter(word => word.length > 1 && !INSIGHT_STOPWORDS.has(word)));
}

function insightSentences(text:string):string[] {
  const sentences:string[] = [];
  for (const line of text.split(/\r?\n+/)) {
    for (const part of line.split(/\s+·\s+|(?<=[.!?…;])\s+/u)) {
      const sentence = insightFlatten(part).replace(/^[\-–—•*]+/u,'').replace(/[\s,;:]+$/u,'');
      if (sentence.length >= INSIGHT_SENTENCE_MIN_CHARS && /[\p{L}\p{N}]/u.test(sentence)) sentences.push(sentence);
    }
  }
  return sentences;
}

const insightCompare = (left:string, right:string):number => left < right ? -1 : left > right ? 1 : 0;

/** Recurrence score: how often a sentence's content words appear across the given comments, length-normalised. */
function insightRecurrence(tokens:Set<string>, frequency:Map<string,number>):number {
  return [...tokens].reduce((total,token) => total + (frequency.get(token) ?? 0),0) / Math.sqrt(Math.max(1,tokens.size));
}

function insightFrequency(groups:Iterable<Set<string>>):Map<string,number> {
  const frequency = new Map<string,number>();
  for (const tokens of groups) for (const token of tokens) frequency.set(token,(frequency.get(token) ?? 0) + 1);
  return frequency;
}

/** The theme's kept, listed comments with their scored sentences (best first); unclear tags are never evidence. */
function insightPointComments(code:string, listed:InsightComment[]):InsightPointComment[] {
  const seen = new Set<string>();
  const parsed:{ id:string; index:number; sentences:{ text:string; key:string; tokens:Set<string> }[] }[] = [];
  listed.forEach((comment,index) => {
    if (seen.has(comment.id) || !comment.tags.some(tag => tag.code === code && tag.status === 'kept')) return;
    seen.add(comment.id);
    const sentences = insightSentences(comment.text).map(text => ({ text, key:insightSentenceKey(text), tokens:insightTokens(text) }));
    if (sentences.length) parsed.push({ id:comment.id, index, sentences });
  });
  const frequency = insightFrequency(parsed.map(comment => new Set(comment.sentences.flatMap(sentence => [...sentence.tokens]))));
  return parsed.map(comment => ({ id:comment.id, index:comment.index,
    sentences:comment.sentences.map(sentence => ({ ...sentence, score:insightRecurrence(sentence.tokens,frequency) }))
      .sort((left,right) => right.score - left.score || insightCompare(left.key,right.key)) }));
}

/** Two sentences say the same thing when they share enough content words (or are the same text). */
function insightSimilar(left:InsightSentence, right:InsightSentence):boolean {
  if (left.key === right.key) return true;
  const small = Math.min(left.tokens.size,right.tokens.size), large = Math.max(left.tokens.size,right.tokens.size);
  if (!small) return false;
  let shared = 0;
  for (const token of left.tokens) if (right.tokens.has(token)) shared++;
  return shared >= Math.min(2,small) && shared / small >= 0.5 && shared / large >= 0.25;
}

/** A customer sentence cut to 20 words and 160 characters, «…» when cut; no quotes added. */
function insightPointText(text:string):string {
  const words = insightFlatten(text).replace(/^["“”'‘’]+|["“”'‘’]+$/gu,'').split(' ').filter(Boolean);
  let chars = [...words.slice(0,INSIGHT_POINT_MAX_WORDS).join(' ')];
  let cut = words.length > INSIGHT_POINT_MAX_WORDS;
  if (chars.length > INSIGHT_POINT_MAX_CHARS - 1) {
    chars = chars.slice(0,INSIGHT_POINT_MAX_CHARS - 1);
    const boundary = chars.lastIndexOf(' ');
    if (boundary >= Math.floor((INSIGHT_POINT_MAX_CHARS - 1) * 0.6)) chars = chars.slice(0,boundary);
    cut = true;
  }
  const flat = chars.join('');
  return cut ? `${flat.replace(/[\s,;:.…\-–—]+$/u,'') || flat}…` : flat;
}

/**
 * Up to 5 points per theme, grouped by shared content words without a model call. Comments are taken in recurrence
 * order; each one joins the first group whose leading sentence it resembles, or leads a new group. A group's point is
 * its most recurring member sentence. Same input, same points.
 */
function insightThemePoints(code:string, listed:InsightComment[]):InsightPoint[] {
  const comments = insightPointComments(code,listed).sort((left,right) =>
    right.sentences[0]!.score - left.sentences[0]!.score || left.index - right.index || insightCompare(left.id,right.id));
  type Member = { comment:InsightPointComment; sentence:InsightSentence };
  const groups:{ leader:InsightSentence; order:number; members:Member[] }[] = [];
  for (const comment of comments) {
    const group = groups.find(item => comment.sentences.some(sentence => insightSimilar(item.leader,sentence)));
    if (group) group.members.push({ comment, sentence:comment.sentences.find(sentence => insightSimilar(group.leader,sentence))! });
    else groups.push({ leader:comment.sentences[0]!, order:groups.length, members:[{ comment, sentence:comment.sentences[0]! }] });
  }
  return groups.sort((left,right) => right.members.length - left.members.length || left.order - right.order)
    .slice(0,INSIGHT_THEME_MAX_POINTS).map(group => {
      const frequency = insightFrequency(group.members.map(member => member.sentence.tokens));
      const best = group.members.map(member => ({ member, score:insightRecurrence(member.sentence.tokens,frequency) }))
        .sort((left,right) => right.score - left.score || right.member.sentence.score - left.member.sentence.score ||
          left.member.comment.index - right.member.comment.index ||
          insightCompare(left.member.sentence.key,right.member.sentence.key))[0]!;
      const commentIds = group.members.map(member => member.comment.id);
      return { text:insightPointText(best.member.sentence.text), count:commentIds.length, commentIds };
    });
}

/**
 * A theme summary groups the kept comments among the theme's listed comments into points; unclear labels are counted
 * but never used. `points` go only to a reader that asks for them; `text` (the points joined) is for older readers.
 */
function insightThemeSummary(definition:LabelCodebook['core'][number], entry:{ keptCount:number }, listed:InsightComment[],
  available:boolean, generatedAt:string|null, withPoints:boolean):InsightSummary {
  if (!available) return { status:'UNAVAILABLE', text:null, model:null, generatedAt:null };
  if (!entry.keptCount) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const points = insightThemePoints(definition.code,listed);
  if (!points.length) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const summary:InsightSummary = { status:'READY', text:points.map(point => point.text).join('; '), model:INSIGHT_THEME_MODEL, generatedAt };
  return withPoints ? { ...summary, points } : summary;
}

function insightSummary(rows:number, read:number, comments:number, themes:InsightTheme[], generatedAt:string|null, available:boolean):InsightSummary {
  if (!available) return { status:'UNAVAILABLE', text:null, model:null, generatedAt:null };
  // EMPTY only when nothing was read; a bucket read entirely as «no theme» still shows its counts.
  if (!read && !comments) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const top = [...themes].filter(theme => theme.count > 0).sort((a,b) => b.count-a.count || a.code.localeCompare(b.code)).slice(0,3)
    .map(theme => `${theme.name} (${theme.count})`).join(', ');
  const polarity = themes.reduce((total,theme) => {
    for (const key of INSIGHT_POLARITIES) total[key] += theme.polarityCounts[key];
    return total;
  }, { khen:0, che:0, ke:0, khong_ro_huong:0 } as Record<InsightPolarity,number>);
  const neutral = polarity.ke + polarity.khong_ro_huong;
  const subject = top ? ` Chủ đề được nhắc nhiều nhất: ${top}.` : '';
  return { status:'READY',
    text:`Jev đã đọc ${read}/${rows} bình luận; ${comments} bình luận có ít nhất 1 chủ đề. Tổng số nhãn: ${polarity.khen} khen, ${polarity.che} chê, ${neutral} trung lập (một bình luận có thể mang nhiều nhãn).${subject} Dòng chưa đủ bằng chứng được giữ là “không rõ phân loại”.`,
    model:'jev-derived-v1', generatedAt };
}

type LabelCoverage = Awaited<ReturnType<typeof reviewProcessLabelCoverage>>;
function insightBucket(rows:ModuleReviewRow[], sourceSha256:string, definitions:LabelCodebook['core'], labelStore:InsightLabelStore, generatedAt:string|null,
  coverage:LabelCoverage, withPoints:boolean):InsightBucket {
  type ThemeAccumulator = { count:number; unclearCount:number; keptCount:number;
    polarityCounts:Record<InsightPolarity,number>; keptPolarityCounts:Record<InsightPolarity,number>; comments:InsightComment[] };
  const byTheme = new Map<string,ThemeAccumulator>(definitions.map(theme => [theme.code,{ count:0, unclearCount:0, keptCount:0,
    polarityCounts:{ khen:0, che:0, ke:0, khong_ro_huong:0 }, keptPolarityCounts:{ khen:0, che:0, ke:0, khong_ro_huong:0 }, comments:[] }]));
  const comments:InsightComment[] = [];
  // «Jev đã đọc X/Y» uses the step 4 card's rule when step 4 has data; otherwise the rows with a stored Jev result.
  const card = coverage ? rows.map(row => row.reviewId ? coverage.get(`S05:${row.reviewId}`) : undefined) : null;
  const read = card ? card.filter(entry => entry?.labelled).length : rows.filter(row => insightRowLabels(row,labelStore).length).length;
  const readOf = card ? card.filter(entry => entry?.eligible).length : rows.length;
  // One population for every number of the bucket: with step 4 data, only the reviews step 4 counts (eligible).
  const counted = (index:number) => !card || card[index]?.eligible === true;
  rows.forEach((row,index) => {
    if (!counted(index)) return;
    const tags = insightRowTags(row,labelStore);
    if (!tags.length) return;
    const comment = insightComment(row,sourceSha256,index,tags,row.reviewId ? labelStore.productNames.get(row.reviewId) ?? null : null);
    comments.push(comment);
    for (const tag of tags) {
      const theme = byTheme.get(tag.code);
      if (!theme) continue;
      theme.count++;
      theme.polarityCounts[tag.polarity]++;
      if (tag.status === 'unclear') theme.unclearCount++;
      else { theme.keptCount++; theme.keptPolarityCounts[tag.polarity]++; }
      theme.comments.push(comment);
    }
  });
  const total = readOf;
  const themes = definitions.map(definition => {
    const entry = byTheme.get(definition.code)!;
    // Points cite only listed comments, so every id is in the list the comments read returns.
    const listed = entry.comments.slice(0,INSIGHT_MAX_COMMENTS);
    return { code:definition.code, name:definition.name, count:entry.count, unclearCount:entry.unclearCount,
      share:total ? entry.count / total : 0, polarityCounts:entry.polarityCounts,
      summary:insightThemeSummary(definition,entry,listed,labelStore.available,generatedAt,withPoints),
      comments:listed };
  });
  return { summary:insightSummary(readOf,read,comments.length,themes,generatedAt,labelStore.available), themes,
    comments:comments.slice(0,INSIGHT_MAX_COMMENTS) };
}

function validateInsightView(value:unknown): asserts value is { format:'review-insights-v1'; runId:string; codebookVersion:string; sources:unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  const view = value as Record<string,unknown>;
  if (view.format !== 'review-insights-v1' || typeof view.runId !== 'string' || typeof view.codebookVersion !== 'string' || !Array.isArray(view.sources)) {
    throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  }
}

function validateInsightSummaryView(value:unknown): asserts value is { format:'review-insights-v2'; runId:string; codebookVersion:string; sources:unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  const view = value as Record<string,unknown>;
  if (view.format !== 'review-insights-v2' || typeof view.runId !== 'string' || typeof view.codebookVersion !== 'string' || !Array.isArray(view.sources)) {
    throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  }
}

/** One label store per run, built from the rows of every step-3 result (result tab and download share it). */
function runInsightLabels(sources:{ rows:ModuleReviewRow[] }[], book:LabelCodebook) {
  return readInsightLabels(sources.flatMap(source => source.rows),book);
}

type InsightSourceView = { sourceSha256:string; kind:VerifiedModuleReviewCollection['kind'];
  status:VerifiedModuleReviewCollection['status']; completedAt:string|null; all:InsightBucket;
  links:{ shopId:string; itemId:string; url:string; insights:InsightBucket }[] };

/** Discover once and build every bucket; callers that already verified the sources pass them in. */
async function insightSources(run:string, discovered?:VerifiedModuleReviewCollection[], withPoints = false) {
  const book = parseLabelCodebook(await readFile(DEFAULT_CODEBOOK_FILE,'utf8'));
  const sources = discovered ?? await discoverModuleReviewSources(run);
  const labelStore = runInsightLabels(sources,book);
  const sourceViews:InsightSourceView[] = [];
  for (const source of sources) {
    const coverage = await reviewProcessLabelCoverage(run,source);
    const links = source.links.map(link => {
      const rows = source.rows.filter(row => row.shopId === link.shopId && row.itemId === link.itemId);
      return { shopId:link.shopId, itemId:link.itemId, url:link.url,
        insights:insightBucket(rows,source.sourceSha256,book.core,labelStore,source.completedAt,coverage,withPoints) };
    });
    sourceViews.push({ sourceSha256:source.sourceSha256, kind:source.kind, status:source.status, completedAt:source.completedAt,
      all:insightBucket(source.rows,source.sourceSha256,book.core,labelStore,source.completedAt,coverage,withPoints), links });
  }
  return { book, sourceViews };
}

/** Read the verified M3 rows and the current Jev codebook labels for the result-tab drilldown. */
export async function reviewInsightsView(run:string, discovered?:VerifiedModuleReviewCollection[]):Promise<unknown> {
  const { book, sourceViews } = await insightSources(run,discovered);
  const view = { format:'review-insights-v1', runId:basename(run), codebookVersion:book.version, sources:sourceViews };
  validateInsightView(view);
  return view;
}

/** Bucket and theme ids travel in a CLI argument, so they are restricted to a conservative charset. */
const INSIGHT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export function insightBucketKey(sourceSha256:string, link:{ shopId:string; itemId:string }|null, index = 0):string {
  if (!link) return `${sourceSha256}:all`;
  const natural = `${sourceSha256}:${link.shopId}.${link.itemId}`;
  return INSIGHT_ID.test(natural) ? natural : `${sourceSha256}:link${index}`;
}

/**
 * v2 keeps every number of v1 and replaces each comment list with its size; `key` is how the UI asks for that list.
 * `withPoints` (app 1.4.0 asks with --points) adds `points` to each READY theme summary; without it the shape stays
 * the one app 1.3.0 checks key by key.
 */
export function reviewInsightsSummaryView(run:string, discovered?:VerifiedModuleReviewCollection[], withPoints = false):Promise<unknown> {
  return insightSources(run,discovered,withPoints).then(({ book, sourceViews }) => {
    const bucket = (value:InsightBucket, key:string) => ({ key, summary:value.summary,
      themes:value.themes.map(({ comments, ...theme }) => ({ ...theme, commentCount:comments.length })),
      commentCount:value.comments.length });
    const view = { format:'review-insights-v2', runId:basename(run), codebookVersion:book.version,
      sources:sourceViews.map(source => ({ sourceSha256:source.sourceSha256, kind:source.kind, status:source.status,
        completedAt:source.completedAt, all:bucket(source.all,insightBucketKey(source.sourceSha256,null)),
        links:source.links.map((link,index) => ({ shopId:link.shopId, itemId:link.itemId, url:link.url,
          insights:bucket(link.insights,insightBucketKey(source.sourceSha256,link,index)) })) })) };
    validateInsightSummaryView(view);
    return view;
  });
}

/** One list of v1 at the place `bucket` (and optional `theme`) names, capped exactly as v1 caps it. */
export async function reviewInsightCommentsView(run:string, bucket:string, theme:string|null = null,
  discovered?:VerifiedModuleReviewCollection[]):Promise<unknown> {
  if (!INSIGHT_ID.test(bucket) || theme !== null && !INSIGHT_ID.test(theme)) throw new ModuleError('REVIEW_DATA_INVALID',2);
  const { sourceViews } = await insightSources(run,discovered);
  for (const source of sourceViews) {
    const buckets = [{ key:insightBucketKey(source.sourceSha256,null), value:source.all },
      ...source.links.map((link,index) => ({ key:insightBucketKey(source.sourceSha256,link,index), value:link.insights }))];
    const found = buckets.find(item => item.key === bucket);
    if (!found) continue;
    if (theme === null) return { format:'review-insight-comments-v1', bucket, theme:null, comments:found.value.comments };
    const selected = found.value.themes.find(item => item.code === theme);
    if (!selected) throw new ModuleError('REVIEW_DATA_INVALID',2);
    return { format:'review-insight-comments-v1', bucket, theme, comments:selected.comments };
  }
  throw new ModuleError('REVIEW_DATA_INVALID',2);
}

/**
 * Every collected comment of one verified step-3 result (no cap, no filter), each with its current Jev tags
 * (empty when the row has no valid label). Same label reading as the result tab.
 */
export function labelledCommentsFile(source:{ runId:string; sourceSha256:string; rows:ModuleReviewRow[] }, book:LabelCodebook,
  labelStore:InsightLabelStore) {
  const comments = source.rows.map((row,index) => {
    const tags = insightRowTags(row,labelStore);
    const view = insightComment(row,source.sourceSha256,index,tags,row.reviewId ? labelStore.productNames.get(row.reviewId) ?? null : null);
    return { id:view.id, text:view.text, comment:row.comment ?? null, attributes:row.attributes, rating:view.rating, date:view.date,
      productName:view.productName, url:view.url, tags:view.tags };
  });
  return { format:'shopee-labelled-comments-v1', runId:source.runId, sourceSha256:source.sourceSha256, codebookVersion:book.version,
    labelsAvailable:labelStore.available, total:comments.length, labelled:comments.filter(comment => comment.tags.length).length, comments };
}

export async function prepareLabelledReviewExport(run:string, sourceSha256:string) {
  const book = parseLabelCodebook(await readFile(DEFAULT_CODEBOOK_FILE,'utf8'));
  const sources = await discoverModuleReviewSources(run);
  const source = sources.find(item => item.sourceSha256 === sourceSha256);
  if (!source) throw new ModuleError('REVIEW_SOURCE_CHANGED',23);
  // Same label store as the result tab (reviewInsightsView), so the file and the screen agree.
  const file = labelledCommentsFile(source,book,runInsightLabels(sources,book));
  return publishLabelledReviewExport(run,source,Buffer.from(`${JSON.stringify(file,null,2)}\n`,'utf8'));
}

export async function reviewDataCommand(args:string[]):Promise<unknown> {
  const [action,runArg,...extra]=args;if(!runArg)throw new ModuleError('USAGE',2);const run=resolve(runArg);
  if(action==='save'||action==='export'||action==='process'||action==='process-auto')compileAll();
  if(action==='view'&&!extra.length)return reviewDataView(run);
  if(action==='stats'&&!extra.length)return reviewStatsView(run);
  if(action==='insights'&&!extra.length)return reviewInsightsView(run);
  if(action==='insights-summary'&&(!extra.length||extra.length===1&&extra[0]==='--points'))return reviewInsightsSummaryView(run,undefined,extra[0]==='--points');
  if(action==='insight-comments'&&(extra.length===1||extra.length===2))return reviewInsightCommentsView(run,extra[0]!,extra[1]??null);
  if(action==='save'&&!extra.length){const value=validateReviewData<ReviewDataSaveInput>('saveInput',await input());return saveModuleReviewData(run,value.sourceSha256);}
  if(action==='export'&&!extra.length){const value=validateReviewData<ReviewDataExportInput>('exportInput',await input());
    return value.format==='labelled-json'?prepareLabelledReviewExport(run,value.sourceSha256):prepareReviewExport(run,value.sourceSha256,value.format);}
  if(action==='read'&&extra.length===1)return readReviewExportBytes(run,extra[0]!);
  if(action==='process-view'&&!extra.length)return reviewProcessView(run,await reviewProcessSettings());
  // runs-progress: the step-4 status of many runs in one call, from the same view (one error-v1 per run that cannot be read).
  if(action==='process-views'){const settings=await reviewProcessSettings();const views:unknown[]=[];
    for(const one of [run,...extra.map(e=>resolve(e))]){try{views.push(await reviewProcessView(one,settings));}
      catch(error){const code=error instanceof ModuleError?error.code:'REVIEW_DATA_FAILED';views.push({format:'error-v1',code,message:code});}}
    return views;}
  if(action==='process-check'&&extra.length===1){await reviewProcessStartable(run,extra[0]!);return {format:'review-process-check-v1'};}
  if((action==='process'||action==='process-auto')&&extra.length===1){
    const deps={settings:await reviewProcessSettings(),client:reviewProcessJevClient(process.env)};
    const state=action==='process'?await runReviewProcess(run,extra[0]!,deps):await runReviewProcessAfterM3(run,extra[0]!,deps);
    return state?reviewProcessStart(run,state):{format:'review-process-check-v1'};
  }
  throw new ModuleError('USAGE',2);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const binary=process.argv[2]==='read';
  void reviewDataCommand(process.argv.slice(2)).then(value=>{
    if(binary&&Buffer.isBuffer(value))process.stdout.write(value);
    else process.stdout.write(JSON.stringify(value)+'\n');
  }).catch(error=>{
    const code=error instanceof ModuleError?error.code:'REVIEW_DATA_FAILED';
    if(binary)process.stderr.write(code+'\n');
    else process.stdout.write(JSON.stringify({format:'error-v1',code,message:code})+'\n');
    process.exitCode=error instanceof ModuleError?error.exitCode:20;
  });
}
