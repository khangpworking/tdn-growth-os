import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import { ModuleError, validateModuleValue } from './module-pick.js';
import { discoverModuleReviewSources, prepareReviewExport, readReviewExportBytes, validateReviewData, type ModuleReviewRow } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView, saveModuleReviewData } from '../src/modules/raw-db/module-shopee-reviews.js';
import { reviewProcessJevClient, reviewProcessSettings, reviewProcessStart, reviewProcessStartable, reviewProcessView, runReviewProcess,
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
export async function reviewStatsView(run:string):Promise<unknown> {
  const sources=(await discoverModuleReviewSources(run)).map(source=>({sourceSha256:source.sourceSha256,kind:source.kind,
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
type InsightSummary = { status:'READY'|'EMPTY'|'UNAVAILABLE'; text:string|null; model:string|null; generatedAt:string|null };
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

/**
 * Read Jev's persisted APP_JEV labels without changing the application DB. A label is accepted only when
 * its text hash still matches the exact M3 row being displayed; stale labels are ignored as a group.
 */
function readInsightLabels(rows:ModuleReviewRow[], book:LabelCodebook): { labels:Map<string,InsightTag[]>; productNames:Map<string,string>; available:boolean } {
  const labels = new Map<string,InsightTag[]>(), productNames = new Map<string,string>();
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
    const wanted = new Map(rows.flatMap(row => row.reviewId ? [[row.reviewId,row] as const] : []));
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
    const grouped = new Map<string,{ valid:boolean; rows:StoredInsightLabel[] }>();
    for (const item of stored) {
      const row = wanted.get(item.externalId);
      if (!row) continue;
      const entry = grouped.get(item.externalId) ?? { valid:true, rows:[] };
      const attributesJson = row.attributes.length ? JSON.stringify(row.attributes) : null;
      if (item.textSha256 !== insightSha256(codingText(row.comment,attributesJson))) entry.valid = false;
      entry.rows.push(item);
      grouped.set(item.externalId,entry);
      if (item.productName) productNames.set(item.externalId,item.productName);
    }
    const names = new Map(book.core.map(theme => [theme.code,theme.name] as const));
    for (const [externalId,entry] of grouped) {
      if (!entry.valid) continue;
      const tags = entry.rows.filter(item => names.has(item.code)).map(item => ({
        code:item.code, name:names.get(item.code)!, polarity:item.polarity, status:item.status, choice:item.choice,
      }));
      if (tags.length) labels.set(externalId,tags);
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

const INSIGHT_POLARITY_LABELS:Record<InsightPolarity,string> = {
  khen:'khen', che:'chê', ke:'trung lập', khong_ro_huong:'không rõ hướng',
};

const INSIGHT_THEME_MODEL = 'jev-extractive-theme-v1';
const INSIGHT_THEME_MAX_SENTENCES = 3;
const INSIGHT_SENTENCE_MAX_CHARS = 160;
const INSIGHT_SENTENCE_MIN_CHARS = 4;
const INSIGHT_NEAR_DUPLICATE = 0.85;
// Function words only: sentiment and product terms stay in the recurrence score.
const INSIGHT_STOPWORDS = new Set(['la','và','của','có','cho','với','không','được','rất','này','những','các','một',
  'mình','thấy','thì','mà','khi','nếu','nhưng','để','từ','đến','trong','ngoài','trên','dưới','ra','vào','lên','xuống',
  'cũng','vẫn','đã','đang','sẽ','bị','do','vì','nên','hơi','khá','quá','lắm','nhiều','ít','ạ','nhé','nha','nhỉ','đó',
  'kia','ấy','tôi','bạn','em','anh','chị','họ','nó','vậy','thế','rồi','chứ','như','theo','về','giữa','sau','trước',
  'mỗi','mọi','ai','gì','nào','sao','ok','oke','okela','đi','nhá','đấy','ơi','à','ừ','vâng','dạ']);

type InsightSentence = { text:string; key:string; tokens:Set<string>; polarity:InsightPolarity; commentIndex:number; score:number };

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

function insightBoundText(text:string,max:number):string {
  const flat = insightFlatten(text);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0,max), boundary = cut.lastIndexOf(' ');
  return `${(boundary >= Math.floor(max * 0.6) ? cut.slice(0,boundary) : cut).trimEnd()}…`;
}

function insightRank(left:InsightSentence,right:InsightSentence):number {
  return right.score - left.score || left.commentIndex - right.commentIndex ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

/** Scores deduplicated sentences by how often their content words recur across the theme's kept comments. */
function insightEvidence(definition:LabelCodebook['core'][number], entry:{ comments:InsightComment[] }): { usable:number; sentences:InsightSentence[] } {
  const byComment = new Map<string,{ polarity:InsightPolarity; index:number; sentences:{ text:string; key:string; tokens:Set<string> }[] }>();
  entry.comments.forEach((comment,index) => {
    if (byComment.has(comment.id)) return;
    const tag = comment.tags.find(item => item.code === definition.code && item.status === 'kept');
    if (!tag) return;
    const sentences = insightSentences(comment.text).map(text => ({ text, key:insightSentenceKey(text), tokens:insightTokens(text) }));
    if (sentences.length) byComment.set(comment.id,{ polarity:tag.polarity, index, sentences });
  });
  const documentFrequency = new Map<string,number>();
  for (const group of byComment.values()) {
    const tokens = new Set(group.sentences.flatMap(sentence => [...sentence.tokens]));
    for (const token of tokens) documentFrequency.set(token,(documentFrequency.get(token) ?? 0) + 1);
  }
  const seen = new Set<string>(), sentences:InsightSentence[] = [];
  for (const group of byComment.values()) {
    for (const sentence of group.sentences) {
      if (seen.has(sentence.key)) continue;
      seen.add(sentence.key);
      const recurrence = [...sentence.tokens].reduce((total,token) => total + (documentFrequency.get(token) ?? 0),0);
      sentences.push({ text:sentence.text, key:sentence.key, tokens:sentence.tokens, polarity:group.polarity,
        commentIndex:group.index, score:recurrence / Math.sqrt(Math.max(1,sentence.tokens.size)) });
    }
  }
  sentences.sort(insightRank);
  return { usable:byComment.size, sentences };
}

function insightSameContent(left:InsightSentence,right:InsightSentence):boolean {
  if (left.key === right.key) return true;
  if (!left.tokens.size || !right.tokens.size) return false;
  let shared = 0;
  for (const token of left.tokens) if (right.tokens.has(token)) shared++;
  return shared / (left.tokens.size + right.tokens.size - shared) >= INSIGHT_NEAR_DUPLICATE;
}

/** Picks the strongest recurring sentences, then fills remaining slots by rank, keeping content near-duplicates out. */
function insightSelectSentences(sentences:InsightSentence[], keptPolarityCounts:Record<InsightPolarity,number>):InsightSentence[] {
  const selected:InsightSentence[] = [];
  const accepts = (candidate:InsightSentence) => !selected.includes(candidate) &&
    !selected.some(item => item.key === candidate.key || insightSameContent(item,candidate));
  const top = sentences[0]?.score ?? 0;
  for (const polarity of INSIGHT_POLARITIES) {
    if (selected.length >= INSIGHT_THEME_MAX_SENTENCES) break;
    if (!keptPolarityCounts[polarity]) continue;
    const candidate = sentences.find(item => item.polarity === polarity && item.score >= top * 0.5 && accepts(item));
    if (candidate) selected.push(candidate);
  }
  for (const candidate of sentences) {
    if (selected.length >= INSIGHT_THEME_MAX_SENTENCES) break;
    if (accepts(candidate)) selected.push(candidate);
  }
  selected.sort(insightRank);
  return selected;
}

/** A theme summary extracts representative kept evidence; unclear labels are counted but never used or quoted. */
function insightThemeSummary(definition:LabelCodebook['core'][number], entry:{ keptCount:number; unclearCount:number;
  keptPolarityCounts:Record<InsightPolarity,number>; comments:InsightComment[] }, available:boolean,
  generatedAt:string|null):InsightSummary {
  if (!available) return { status:'UNAVAILABLE', text:null, model:null, generatedAt:null };
  if (!entry.keptCount) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const evidence = insightEvidence(definition,entry);
  if (!evidence.usable) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const quote = (sentence:InsightSentence) =>
    `“${insightBoundText(sentence.text,INSIGHT_SENTENCE_MAX_CHARS)}” (${INSIGHT_POLARITY_LABELS[sentence.polarity]})`;
  if (evidence.usable === 1) {
    return { status:'READY', model:INSIGHT_THEME_MODEL, generatedAt,
      text:`Chỉ có 1 bình luận đủ bằng chứng cho chủ đề này: ${quote(evidence.sentences[0]!)}.` };
  }
  const selected = insightSelectSentences(evidence.sentences,entry.keptPolarityCounts);
  return { status:'READY', model:INSIGHT_THEME_MODEL, generatedAt,
    text:`Nội dung tiêu biểu từ các bình luận đã gắn nhãn cho chủ đề này: ${selected.map(quote).join('; ')}.` };
}

function insightSummary(rows:number, comments:number, themes:InsightTheme[], generatedAt:string|null, available:boolean):InsightSummary {
  if (!available) return { status:'UNAVAILABLE', text:null, model:null, generatedAt:null };
  if (!comments) return { status:'EMPTY', text:null, model:null, generatedAt:null };
  const top = [...themes].filter(theme => theme.count > 0).sort((a,b) => b.count-a.count || a.code.localeCompare(b.code)).slice(0,3)
    .map(theme => `${theme.name} (${theme.count})`).join(', ');
  const polarity = themes.reduce((total,theme) => {
    for (const key of INSIGHT_POLARITIES) total[key] += theme.polarityCounts[key];
    return total;
  }, { khen:0, che:0, ke:0, khong_ro_huong:0 } as Record<InsightPolarity,number>);
  const neutral = polarity.ke + polarity.khong_ro_huong;
  const subject = top ? ` Chủ đề được nhắc nhiều nhất: ${top}.` : '';
  return { status:'READY',
    text:`Đã gắn nhãn Jev cho ${comments} trong ${rows} bình luận. Các nhãn gồm ${polarity.khen} khen, ${polarity.che} chê và ${neutral} trung lập.${subject} Dòng chưa đủ bằng chứng được giữ là “không rõ phân loại”.`,
    model:'jev-derived-v1', generatedAt };
}

function insightBucket(rows:ModuleReviewRow[], sourceSha256:string, definitions:LabelCodebook['core'], labelStore:{ labels:Map<string,InsightTag[]>; productNames:Map<string,string>; available:boolean }, generatedAt:string|null):InsightBucket {
  type ThemeAccumulator = { count:number; unclearCount:number; keptCount:number;
    polarityCounts:Record<InsightPolarity,number>; keptPolarityCounts:Record<InsightPolarity,number>; comments:InsightComment[] };
  const byTheme = new Map<string,ThemeAccumulator>(definitions.map(theme => [theme.code,{ count:0, unclearCount:0, keptCount:0,
    polarityCounts:{ khen:0, che:0, ke:0, khong_ro_huong:0 }, keptPolarityCounts:{ khen:0, che:0, ke:0, khong_ro_huong:0 }, comments:[] }]));
  const comments:InsightComment[] = [];
  rows.forEach((row,index) => {
    const tags = row.reviewId ? labelStore.labels.get(row.reviewId) ?? [] : [];
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
  const total = rows.length;
  const themes = definitions.map(definition => {
    const entry = byTheme.get(definition.code)!;
    return { code:definition.code, name:definition.name, count:entry.count, unclearCount:entry.unclearCount,
      share:total ? entry.count / total : 0, polarityCounts:entry.polarityCounts,
      summary:insightThemeSummary(definition,entry,labelStore.available,generatedAt),
      comments:entry.comments.slice(0,INSIGHT_MAX_COMMENTS) };
  });
  return { summary:insightSummary(total,comments.length,themes,generatedAt,labelStore.available), themes,
    comments:comments.slice(0,INSIGHT_MAX_COMMENTS) };
}

function validateInsightView(value:unknown): asserts value is { format:'review-insights-v1'; runId:string; codebookVersion:string; sources:unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  const view = value as Record<string,unknown>;
  if (view.format !== 'review-insights-v1' || typeof view.runId !== 'string' || typeof view.codebookVersion !== 'string' || !Array.isArray(view.sources)) {
    throw new ModuleError('REVIEW_INSIGHTS_INVALID');
  }
}

/** Read the verified M3 rows and the current Jev codebook labels for the result-tab drilldown. */
export async function reviewInsightsView(run:string):Promise<unknown> {
  const book = parseLabelCodebook(await readFile(DEFAULT_CODEBOOK_FILE,'utf8'));
  const sources = await discoverModuleReviewSources(run);
  const allRows = sources.flatMap(source => source.rows);
  const labelStore = readInsightLabels(allRows,book);
  const sourceViews = sources.map(source => {
    const links = source.links.map(link => {
      const rows = source.rows.filter(row => row.shopId === link.shopId && row.itemId === link.itemId);
      return { shopId:link.shopId, itemId:link.itemId, url:link.url,
        insights:insightBucket(rows,source.sourceSha256,book.core,labelStore,source.completedAt) };
    });
    return { sourceSha256:source.sourceSha256, kind:source.kind, status:source.status, completedAt:source.completedAt,
      all:insightBucket(source.rows,source.sourceSha256,book.core,labelStore,source.completedAt), links };
  });
  const view = { format:'review-insights-v1', runId:basename(run), codebookVersion:book.version, sources:sourceViews };
  validateInsightView(view);
  return view;
}

export async function reviewDataCommand(args:string[]):Promise<unknown> {
  const [action,runArg,...extra]=args;if(!runArg)throw new ModuleError('USAGE',2);const run=resolve(runArg);
  if(action==='view'&&!extra.length)return reviewDataView(run);
  if(action==='stats'&&!extra.length)return reviewStatsView(run);
  if(action==='insights'&&!extra.length)return reviewInsightsView(run);
  if(action==='save'&&!extra.length){const value=validateReviewData<ReviewDataSaveInput>('saveInput',await input());return saveModuleReviewData(run,value.sourceSha256);}
  if(action==='export'&&!extra.length){const value=validateReviewData<ReviewDataExportInput>('exportInput',await input());return prepareReviewExport(run,value.sourceSha256,value.format);}
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
