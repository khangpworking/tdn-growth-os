import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentPromptLibrary, ContentPromptLibraryIntegrityError, SYSTEM_LAYERS, SYSTEM_PROMPTS } from '../../src/modules/flow/content-prompt-library.js';
import { validateContentPromptCreateRequest } from '../../src/modules/flow/validation.js';

const library = new ContentPromptLibrary();

test('there is exactly one default system prompt per type and each is valid prompt content', () => {
  assert.deepEqual(SYSTEM_PROMPTS.map((entry) => entry.promptType).sort(), ['ANGLE', 'BIG_IDEA', 'CAPTION', 'POSTER']);
  assert.ok(SYSTEM_PROMPTS.every((entry) => entry.isDefault && /^system-[a-z0-9-]{3,60}$/.test(entry.id)));
  for (const entry of SYSTEM_PROMPTS) {
    const { prompt } = library.read(entry.id, entry.version);
    assert.doesNotMatch(prompt.creativeText, /\{\{[A-Z_]+\}\}|LOCKED_INPUT_JSON|HỢP ĐỒNG OUTPUT|OUTPUT TUYỆT ĐỐI/, entry.id);
    validateContentPromptCreateRequest({ contractVersion: '1.0.0', promptKey: 'copy-check', promptType: entry.promptType, prompt });
  }
});

test('system layers hold the locked-data, safety and output rules for every type', () => {
  for (const promptType of ['BIG_IDEA', 'ANGLE', 'CAPTION', 'POSTER'] as const) {
    const layer = library.layer(promptType);
    assert.equal(layer.version, 1);
    assert.equal(layer.sha256, SYSTEM_LAYERS[promptType].sha256);
  }
  assert.match(library.layer('BIG_IDEA').text, /DỮ LIỆU KHÓA VÀ AN TOÀN[\s\S]*HỢP ĐỒNG OUTPUT TUYỆT ĐỐI/);
  assert.match(library.layer('ANGLE').text, /DỮ LIỆU KHÓA[\s\S]*OUTPUT TUYỆT ĐỐI/);
  assert.match(library.layer('CAPTION').text, /hệ thống tự thêm khối liên hệ/);
  assert.doesNotMatch(library.layer('CAPTION').text, /required_information/);
  assert.match(library.layer('POSTER').text, /\{\{CAPTION_CONTENT\}\}[\s\S]*\{\{BRAND_JSON_LINE\}\}/);
});

test('a system prompt file that changed without a new version is refused', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-prompt-library-'));
  try {
    fs.cpSync(path.join('prompts', 'content'), root, { recursive: true });
    const copy = new ContentPromptLibrary(root);
    assert.equal(copy.read('system-angle-social').entry.version, 1);
    fs.appendFileSync(path.join(root, 'library', 'angle-social-v3.md'), 'Thêm một dòng.\n');
    assert.throws(() => copy.read('system-angle-social'), ContentPromptLibraryIntegrityError);
    fs.rmSync(path.join(root, 'system', 'poster-v1.md'));
    assert.throws(() => copy.layer('POSTER'), ContentPromptLibraryIntegrityError);
    assert.throws(() => copy.read('system-unknown'), ContentPromptLibraryIntegrityError);
    assert.throws(() => copy.read('system-angle-social', 2), ContentPromptLibraryIntegrityError);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
