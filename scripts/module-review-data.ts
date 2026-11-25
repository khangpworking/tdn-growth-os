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
// A theme word must be held by at least this share of the theme's kept comments (small-sample noise).
const INSIGHT_LIFT_SUPPORT = 0.03;
// A word of the theme's codebook definition is theme-specific with any lift > 1 (unless a quarter of the bucket
// holds it) and counts double.
const INSIGHT_CUE_MAX_SHARE = 0.25;
const INSIGHT_CUE_WEIGHT = 2;
// Function words only: sentiment and product terms stay in the recurrence score.
const INSIGHT_STOPWORDS = new Set(['la','và','của','có','cho','với','không','được','rất','này','những','các','một',
  'mình','thấy','thì','mà','khi','nếu','nhưng','để','từ','đến','trong','ngoài','trên','dưới','ra','vào','lên','xuống',
  'cũng','vẫn','đã','đang','sẽ','bị','do','vì','nên','hơi','khá','quá','lắm','nhiều','ít','ạ','nhé','nha','nhỉ','đó',
  'kia','ấy','tôi','bạn','em','anh','chị','họ','nó','vậy','thế','rồi','chứ','như','theo','về','giữa','sau','trước',
  'mỗi','mọi','ai','gì','nào','sao','ok','oke','okela','đi','nhá','đấy','ơi','à','ừ','vâng','dạ']);

// Negation words join the next content word (`không_thấm`), so a negated sentence never matches its plain form.
const INSIGHT_NEGATIONS = new Set(['không','chưa','chẳng','chả','ko','k','kg','kh','khg','hông','hổng','hok','hem','đâu','chớ','đừng']);

/** `tokens`: the words a sentence is grouped by (its theme-specific words, or all its words without lift). */
type InsightSentence = { text:string; key:string; tokens:Set<string>; size:number; score:number };
/** A kept comment of the theme: its polarity for the theme and its candidate sentences, best first. */
type InsightPointComment = { id:string; index:number; polarity:InsightPolarity; sentences:InsightSentence[] };
/** Comments that hold a word, over the comments counted (one count per comment, by id). */
type InsightTokenStats = { size:number; frequency:Map<string,number> };
/**
 * Kept-labelled comments of one bucket, for the lift of a theme's words; `multi` when 2+ themes have kept comments
 * with words (lift is used only then); tokens cached per comment.
 */
type InsightBucketWords = { stats:InsightTokenStats; multi:boolean; tokens:(comment:InsightComment) => Set<string> };
/** Theme-specific words with their weight (lift, doubled for a word of the theme's definition) and those words. */
type InsightLift = { weight:Map<string,number>; cues:Set<string> };

function insightFlatten(text:string):string {
  return text.replace(/\s+/g,' ').trim();
}

function insightSentenceKey(text:string):string {
  return insightFlatten(text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' '));
}

/**
 * Content words of a text; a negation word is joined to the next content word as `không_<word>`, and «đánh giá»
 * (a rating, not a price) is one word.
 */
function insightTokens(text:string):Set<string> {
  const words = text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = new Set<string>();
  let negated = false;
  for (let index = 0; index < words.length; index++) {
    let word = words[index]!;
    if (word === 'đánh' && words[index + 1] === 'giá') { word = 'đánh_giá'; index++; }
    if (INSIGHT_NEGATIONS.has(word)) { negated = true; continue; }
    if (word.length <= 1 || INSIGHT_STOPWORDS.has(word)) continue;
    tokens.add(negated ? `không_${word}` : word);
    negated = false;
  }
  return tokens;
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

const insightKept = (comment:InsightComment, code?:string):boolean =>
  comment.tags.some(tag => tag.status === 'kept' && (code === undefined || tag.code === code));

function insightTokenStats(comments:InsightComment[], tokens:(comment:InsightComment) => Set<string>):InsightTokenStats {
  const seen = new Set<string>(), sets:Set<string>[] = [];
  for (const comment of comments) {
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    sets.push(tokens(comment));
  }
  return { size:sets.length, frequency:insightFrequency(sets) };
}

/** Word statistics of a bucket: its comments with at least one kept label (unclear labels are not evidence). */
function insightBucketWords(comments:InsightComment[]):InsightBucketWords {
  const cache = new Map<InsightComment,Set<string>>();
  const tokens = (comment:InsightComment) => {
    let value = cache.get(comment);
    if (!value) cache.set(comment,value = new Set(insightSentences(comment.text).flatMap(sentence => [...insightTokens(sentence)])));
    return value;
  };
  const kept = comments.filter(comment => insightKept(comment));
  const themes = new Set(kept.filter(comment => tokens(comment).size)
    .flatMap(comment => comment.tags.filter(tag => tag.status === 'kept').map(tag => tag.code)));
  return { stats:insightTokenStats(kept,tokens), multi:themes.size > 1, tokens };
}

/**
 * The theme-specific words of a theme with their lift: (share of the theme's kept comments with the word) / (share of
 * the bucket's kept-labelled comments with it). Words every theme shares (delivery, packing) stay near 1. A word is
 * specific when lift > 1, at least halfway from the theme's share to 1 of its comments are in the theme
 * (lift ≥ (1 + P) / 2P, P = the theme's share of the bucket), and enough theme comments hold it (small-sample noise:
 * INSIGHT_LIFT_SUPPORT of the theme's comments, at least 1). Words of the theme's codebook definition (`cues`) need
 * only lift > 1 and weigh double. `null` (no lift, every sentence may be a point) only when the bucket has one theme
 * with kept comments; with 2+ themes the map may be empty, and then the theme has no point.
 */
function insightThemeLift(definition:LabelCodebook['core'][number], themeComments:InsightComment[],
  words:InsightBucketWords):InsightLift|null {
  if (!words.multi) return null;
  const theme = insightTokenStats(themeComments.filter(comment => insightKept(comment,definition.code)),words.tokens);
  const lift = new Map<string,number>();
  if (!theme.size) return { weight:lift, cues:new Set() };
  const share = theme.size / words.stats.size, min = (1 + share) / (2 * share);
  const support = Math.max(1,Math.ceil(theme.size * INSIGHT_LIFT_SUPPORT));
  const bucketShare = (token:string) => (words.stats.frequency.get(token) ?? 0) / words.stats.size;
  // Words of the theme's own codebook definition (name and «include»), except words common to the whole bucket.
  const cues = new Set([...insightTokens(`${definition.name} ${definition.include ?? ''}`)]
    .filter(token => bucketShare(token) < INSIGHT_CUE_MAX_SHARE));
  for (const [token,count] of theme.frequency) {
    const value = (count / theme.size) / ((words.stats.frequency.get(token) ?? count) / words.stats.size);
    if (value > 1 && count >= support && (value >= min - 1e-9 || cues.has(token))) {
      lift.set(token,cues.has(token) ? value * INSIGHT_CUE_WEIGHT : value);
    }
  }
  return { weight:lift, cues:new Set([...cues].filter(token => lift.has(token))) };
}

/**
 * The theme's kept, listed comments with their candidate sentences (best first); unclear tags are never evidence.
 * With lift: a sentence is a candidate only when it holds a theme-specific word; its score is the recurrence of those
 * words weighted by lift; a sentence holding a word of the theme's definition goes before one without; the comment
 * keeps its best sentence only, and a comment without a candidate is not cited.
 * Without lift (one theme in the bucket): every sentence, plain recurrence.
 */
function insightPointComments(code:string, listed:InsightComment[], lift:InsightLift|null):InsightPointComment[] {
  const seen = new Set<string>();
  const parsed:{ id:string; index:number; polarity:InsightPolarity; sentences:{ text:string; key:string; tokens:Set<string> }[] }[] = [];
  listed.forEach((comment,index) => {
    const tag = comment.tags.find(item => item.code === code && item.status === 'kept');
    if (seen.has(comment.id) || !tag) return;
    seen.add(comment.id);
    const sentences = insightSentences(comment.text).map(text => ({ text, key:insightSentenceKey(text), tokens:insightTokens(text) }));
    if (sentences.length) parsed.push({ id:comment.id, index, polarity:tag.polarity, sentences });
  });
  const frequency = insightFrequency(parsed.map(comment => new Set(comment.sentences.flatMap(sentence => [...sentence.tokens]))));
  const points:InsightPointComment[] = [];
  for (const comment of parsed) {
    const sentences = comment.sentences.map(sentence => {
      if (!lift) return { ...sentence, size:sentence.tokens.size, score:insightRecurrence(sentence.tokens,frequency) };
      const specific = new Set([...sentence.tokens].filter(token => lift.weight.has(token)));
      // The best clause decides: a long sentence that also talks about delivery is scored on its theme clause.
      const score = Math.max(...sentence.text.split(/[,;:]\s*/u).map(clause => {
        const tokens = insightTokens(clause);
        return [...tokens].filter(token => specific.has(token))
          .reduce((total,token) => total + (frequency.get(token) ?? 0) * lift.weight.get(token)!,0) / Math.sqrt(Math.max(1,tokens.size));
      }));
      return { text:sentence.text, key:sentence.key, tokens:specific, size:sentence.tokens.size, score };
    }).filter(sentence => sentence.tokens.size);
    const cued = (sentence:InsightSentence) => lift && [...sentence.tokens].some(token => lift.cues.has(token)) ? 1 : 0;
    sentences.sort((left,right) => cued(right) - cued(left) || right.score - left.score || insightCompare(left.key,right.key));
    if (sentences.length) {
      points.push({ id:comment.id, index:comment.index, polarity:comment.polarity, sentences:lift ? sentences.slice(0,1) : sentences });
    }
  }
  return points;
}

/** The keys a sentence can be a point by: its grouping words when it has 1–2, else every pair of them. */
function insightSentenceKeys(sentence:InsightSentence):string[][] {
  const tokens = [...sentence.tokens].sort(insightCompare);
  if (tokens.length <= 2) return [tokens];
  const keys:string[][] = [];
  for (let left = 0; left < tokens.length; left++) {
    for (let right = left + 1; right < tokens.length; right++) keys.push([tokens[left]!,tokens[right]!]);
  }
  return keys;
}

const insightHolds = (comment:InsightPointComment, key:string[]) =>
  comment.sentences.some(sentence => key.every(token => sentence.tokens.has(token)));

/**
 * The clause of a long sentence that holds the point's main theme word, so the bullet is the part about the theme:
 * a sentence over 12 words is cut at commas and the clause with `focus` is kept, with «…» where text was left out.
 */
function insightPointClause(text:string, focus:string|null):string {
  const flat = insightFlatten(text);
  if (!focus || flat.split(' ').length <= 12) return flat;
  const word = focus.replace(/^không_/u,'');
  // A comma splits clauses with or without a space around it («nhanh,đóng gói», «kỹ càng ,tác dụng»).
  const clauses = flat.split(/\s*[,;]\s*/u).filter(Boolean);
  const index = clauses.findIndex(clause => insightTokens(clause).has(focus) || insightTokens(clause).has(word));
  if (index < 0 || clauses.length === 1) return flat;
  const clause = clauses[index]!.replace(/[\s:]+$/u,'');
  return `${index > 0 ? '…' : ''}${clause}${index < clauses.length - 1 ? '…' : ''}`;
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
  return cut && !flat.endsWith('…') ? `${flat.replace(/[\s,;:.…\-–—]+$/u,'') || flat}…` : flat;
}

/**
 * Up to 5 points per theme without a model call. A point has a key: the grouping words of one comment's sentence when
 * it has 1–2, else 2 of them. Its members are the remaining comments of the same polarity with a sentence holding the
 * whole key (a negated word is another word), so every member says the point's thing. Points are taken greedily: the
 * key the most remaining comments hold (then a 2-word key, the higher-scored comment, the key's words); the point's
 * text is its best-scored member sentence holding the key. Same input, same points.
 */
function insightThemePoints(code:string, listed:InsightComment[], lift:InsightLift|null):InsightPoint[] {
  let pool = insightPointComments(code,listed,lift).sort((left,right) =>
    right.sentences[0]!.score - left.sentences[0]!.score || left.index - right.index || insightCompare(left.id,right.id));
  const points:InsightPoint[] = [];
  while (pool.length && points.length < INSIGHT_THEME_MAX_POINTS) {
    // How many remaining comments of each polarity hold each key.
    const held = new Map<string,number>();
    for (const comment of pool) {
      const keys = new Set(comment.sentences.flatMap(sentence => insightSentenceKeys(sentence).map(key => key.join(' '))));
      for (const sentence of comment.sentences) for (const token of sentence.tokens) keys.add(token);
      for (const key of keys) held.set(`${comment.polarity}|${key}`,(held.get(`${comment.polarity}|${key}`) ?? 0) + 1);
    }
    let best:{ comment:InsightPointComment; key:string[]; count:number }|null = null;
    for (const comment of pool) {
      for (const key of insightSentenceKeys(comment.sentences[0]!)) {
        const count = held.get(`${comment.polarity}|${key.join(' ')}`) ?? 0;
        if (!best || count > best.count || count === best.count && key.length > best.key.length) best = { comment, key, count };
      }
    }
    const { comment:owner, key } = best!;
    const members = pool.filter(comment => comment.polarity === owner.polarity && insightHolds(comment,key));
    // The text: a member sentence holding the key whose words the members share most. With lift, the share is the
    // mean over its words (so it claims no more than the members say), within 0.1 of the best, then the best score;
    // without lift, the length-normalised recurrence in the point.
    const holders = insightFrequency(members.map(member => new Set(member.sentences.flatMap(sentence => [...sentence.tokens]))));
    const shared = (sentence:InsightSentence) => {
      const total = [...sentence.tokens].reduce((sum,token) => sum + (holders.get(token) ?? 0) / members.length,0);
      return lift ? total / Math.max(1,sentence.tokens.size) : total / Math.sqrt(Math.max(1,sentence.tokens.size));
    };
    const options = members.flatMap(member => member.sentences.filter(sentence => key.every(token => sentence.tokens.has(token)))
      .map(sentence => ({ sentence, index:member.index, shared:shared(sentence) })));
    const top = Math.max(...options.map(option => option.shared));
    const close = (value:number) => lift ? value >= top - 0.1 - 1e-9 : value >= top - 1e-9;
    const text = options.filter(option => close(option.shared))
      .sort((left,right) => right.sentence.score - left.sentence.score || left.index - right.index ||
        insightCompare(left.sentence.key,right.sentence.key))[0]!.sentence.text;
    // The clause shown for a long sentence holds the key word with the highest lift.
    const focus = lift ? [...key].sort((left,right) => lift.weight.get(right)! - lift.weight.get(left)! || insightCompare(left,right))[0]! : null;
    const commentIds = members.map(member => member.id);
    points.push({ text:insightPointText(insightPointClause(text,focus)), count:commentIds.length, commentIds });
    const ids = new Set(commentIds);
    pool = pool.filter(comment => !ids.has(comment.id));
  }
  return points.sort((left,right) => right.count - left.count);
}

/**
 * A theme summary groups the kept comments among the theme's listed comments into points; unclear labels are counted
 * but never used. No point (for example only talk shared with other themes) is EMPTY in both views, with no text.
 * `points` go only to a reader that asks for them; `text` (the points joined) is for older readers.
 */
function insightThemeSummary(definition:LabelCodebook['core'][number], entry:{ keptCount:number; comments:InsightComment[] },
  listed:InsightComment[], words:InsightBucketWords, available:boolean, generatedAt:string|null, withPoints:boolean):InsightSummary {
  if (!available) return { status:'UNAVAILABLE', text:null, model:null, generatedAt:null };
  if (!entry.keptCount) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const points = insightThemePoints(definition.code,listed,insightThemeLift(definition,entry.comments,words));
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
  const words = insightBucketWords(comments);
  const themes = definitions.map(definition => {
    const entry = byTheme.get(definition.code)!;
    // Points cite only listed comments, so every id is in the list the comments read returns.
    const listed = entry.comments.slice(0,INSIGHT_MAX_COMMENTS);
    return { code:definition.code, name:definition.name, count:entry.count, unclearCount:entry.unclearCount,
      share:total ? entry.count / total : 0, polarityCounts:entry.polarityCounts,
      summary:insightThemeSummary(definition,entry,listed,words,labelStore.available,generatedAt,withPoints),
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
