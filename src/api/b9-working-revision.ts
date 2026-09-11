import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^wr1_[A-Za-z0-9_-]{43}$/;

/** Public optimistic-concurrency token deliberately distinct from the persisted content digest. */
export function b9WorkingRevision(verifiedWorkingDigest: string): string {
  if (!SHA256.test(verifiedWorkingDigest)) throw new Error('Verified B9 working digest is invalid');
  return `wr1_${createHash('sha256').update('tdn:b9-working-revision:v1\0').update(verifiedWorkingDigest).digest('base64url')}`;
}

export function validB9WorkingRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION.test(value);
}

export function matchesB9WorkingRevision(revision: string, verifiedWorkingDigest: string): boolean {
  const expected = Buffer.from(b9WorkingRevision(verifiedWorkingDigest));
  const actual = Buffer.from(revision);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
