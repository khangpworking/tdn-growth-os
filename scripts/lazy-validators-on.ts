import { resolve } from 'node:path';
import { enableLazyValidators } from '../src/platform/lazy-validator.js';

// `module-review-sampling` is also imported as a library (shopee-module-review-data), so only a
// process actually started as one of the three read-view entries turns lazy mode on.
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (/[\\/]module-(?:run-view|review-sampling|review-data)\.(?:ts|js)$/.test(entry)) enableLazyValidators();
