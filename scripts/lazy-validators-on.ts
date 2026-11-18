import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableLazyValidators } from '../src/platform/lazy-validator.js';

// `module-review-sampling` is also imported as a library (shopee-module-review-data), so only a
// process actually started as one of the three read-view entries in THIS folder turns lazy mode on.
// The started path is compared with the exact resolved paths of those three files, never by name.
const real = (path: string): string => { try { return realpathSync(path); } catch { return resolve(path); } };
const here = dirname(fileURLToPath(import.meta.url));
const views = ['module-run-view.ts', 'module-review-sampling.ts', 'module-review-data.ts'].map(name => real(resolve(here, name)));
const entry = process.argv[1] ? real(resolve(process.argv[1])) : '';
if (views.includes(entry)) enableLazyValidators();
