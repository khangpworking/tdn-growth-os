import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentPromptContent, ContentPromptModel, ContentPromptType } from '../../../contracts/flow/content-prompt-create-request.generated.js';

/**
 * Read-only system prompts ("Hệ thống") and system layers for Content Studio (Task 048c).
 * The texts live in `prompts/content/` and were split from the original Content Studio
 * templates: the creative layer of each template is the default library prompt of its
 * type, and the locked-data/safety/output rules are the type's system layer, which the
 * generation slices (050/051) add to every call. Every file is pinned by SHA-256, so a
 * change must be a new version, never a silent edit.
 */

export class ContentPromptLibraryIntegrityError extends Error {}

export interface SystemPromptEntry {
  readonly id: string;
  readonly promptType: ContentPromptType;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly recommendedModel: ContentPromptModel;
  readonly tags: readonly string[];
  readonly isDefault: boolean;
  readonly file: string;
  readonly sha256: string;
}

export interface SystemLayerEntry {
  readonly promptType: ContentPromptType;
  readonly version: number;
  readonly file: string;
  readonly sha256: string;
}

export const SYSTEM_PROMPTS: readonly SystemPromptEntry[] = [
  {
    id: 'system-big-idea-strategic', promptType: 'BIG_IDEA', version: 1, name: 'Big Idea chiến lược v3.1',
    description: 'Biến Insight thành một Big Idea có creative leap, qua Gate A/B và các bài kiểm tra chất lượng. Chuyển từ Content Studio v3.1.',
    recommendedModel: 'gpt-5.6-sol', tags: ['chiến lược', 'Content Studio v3.1'], isDefault: true,
    file: 'library/big-idea-strategic-v3.1.md', sha256: '89ebebca757b525a269c0da93bc92c0695c5a907c664cfadb23a151ca8e6280f',
  },
  {
    id: 'system-angle-social', promptType: 'ANGLE', version: 1, name: 'Góc khai thác mạng xã hội v3',
    description: 'Một lát cắt cụ thể của Big Idea, đủ cho một bài Facebook, tránh văn mẫu AI. Chuyển từ Content Studio v3.',
    recommendedModel: 'gpt-5.6-sol', tags: ['Facebook', 'Content Studio v3'], isDefault: true,
    file: 'library/angle-social-v3.md', sha256: 'bdee71f7a72df7f02186b8f77879209440d4d70cfd5f78fef71edd40318dfe31',
  },
  {
    id: 'system-caption-facebook', promptType: 'CAPTION', version: 1, name: 'Caption Facebook v3',
    description: 'Một bài Facebook hoàn chỉnh từ góc đã chọn, giọng người Việt tự nhiên, không claim ngoài dữ liệu. Chuyển từ Content Studio v3.',
    recommendedModel: 'gpt-5.6-sol', tags: ['Facebook', 'Content Studio v3'], isDefault: true,
    file: 'library/caption-facebook-v3.md', sha256: 'efb5a5150b919950c86eabe0f6392f1a053bbd4495e2d8d2b6215529702450a9',
  },
  {
    id: 'system-poster-b2b-infographic', promptType: 'POSTER', version: 1, name: 'Poster infographic B2B v2',
    description: 'Poster infographic doanh nghiệp: bố cục module, đọc tốt trên điện thoại, không bịa dữ kiện. Chuyển từ Poster Master Prompt v2 (tiếng Anh).',
    recommendedModel: 'gpt-image-2', tags: ['infographic', 'B2B', 'Poster Master v2'], isDefault: true,
    file: 'library/poster-b2b-infographic-v2.md', sha256: 'd22566f549e1ac0193596d12c4b87e302e19f8dfd94d86ec0492645cd6c5e098',
  },
];

export const SYSTEM_LAYERS: Readonly<Record<ContentPromptType, SystemLayerEntry>> = {
  BIG_IDEA: { promptType: 'BIG_IDEA', version: 1, file: 'system/big-idea-v1.md', sha256: '33a17a7d4da8a8469af81a839c25cbdd7915b616a6d20ea1a20b06592c093c79' },
  ANGLE: { promptType: 'ANGLE', version: 1, file: 'system/angle-v1.md', sha256: 'f526dedb7cc3cbee4fe4def0c889bce50613b46e049e8dbc95515b9cc91ed858' },
  CAPTION: { promptType: 'CAPTION', version: 1, file: 'system/caption-v1.md', sha256: '6d146db8b550230c6a8b04328a400e5b888f2ae3b856786aabcd2d880603ae2c' },
  POSTER: { promptType: 'POSTER', version: 1, file: 'system/poster-v1.md', sha256: '8bb9d08dc3218a94ee3acc4a1658554c7953fafeeccfdcad4951ef21769d9b00' },
};

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'prompts', 'content');

export class ContentPromptLibrary {
  readonly #root: string;

  constructor(root: string = DEFAULT_ROOT) { this.#root = root; }

  list(): readonly SystemPromptEntry[] { return SYSTEM_PROMPTS; }

  find(id: string, version?: number): SystemPromptEntry | undefined {
    return SYSTEM_PROMPTS.find((entry) => entry.id === id && (version === undefined || entry.version === version));
  }

  /** The verified system prompt as prompt content (creative layer only). */
  read(id: string, version?: number): { readonly entry: SystemPromptEntry; readonly prompt: ContentPromptContent } {
    const entry = this.find(id, version);
    if (!entry) throw new ContentPromptLibraryIntegrityError(`Unknown system prompt: ${id}`);
    const creativeText = this.#verifiedText(entry.file, entry.sha256);
    return { entry, prompt: { name: entry.name, description: entry.description, creativeText, recommendedModel: entry.recommendedModel, tags: [...entry.tags] as ContentPromptContent['tags'] } };
  }

  /** The verified system layer text for a prompt type. */
  layer(promptType: ContentPromptType): SystemLayerEntry & { readonly text: string } {
    const entry = SYSTEM_LAYERS[promptType];
    return { ...entry, text: this.#verifiedText(entry.file, entry.sha256) };
  }

  #verifiedText(file: string, expected: string): string {
    let bytes: Buffer;
    try { bytes = fs.readFileSync(path.join(this.#root, ...file.split('/'))); }
    catch { throw new ContentPromptLibraryIntegrityError(`System prompt file is missing: ${file}`); }
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new ContentPromptLibraryIntegrityError(`System prompt file changed without a new version: ${file}`);
    return bytes.toString('utf8').trim();
  }
}
