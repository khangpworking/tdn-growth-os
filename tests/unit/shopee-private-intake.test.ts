import assert from 'node:assert/strict';
import test from 'node:test';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';

const keyId = '11111111-1111-4111-8111-111111111111';
const salt = () => Buffer.alloc(32, 7);
const row = (authorId: unknown) => ({ reviewId: '1001', shopId: '2001', itemId: '3001', comment: '  Synthetic verbatim 😀\nReview.  ', ratingStar: 5, authorId,
  author: 'PRIVATE_DISPLAY_NAME', authorPortrait: 'https://example.test/PRIVATE_AVATAR', profileUrl: 'https://example.test/PRIVATE_PROFILE',
  username: 'PRIVATE_USERNAME', unknown: { authorId: 'PRIVATE_NESTED_ID' } });
const sanitize = (intake: ReturnType<typeof createShopeePrivateIntake>, values: unknown[]) => JSON.parse(intake.sanitizePage(Buffer.from(JSON.stringify(values))).toString());

test('fixed documented field hashes consistently within Shopee, freezes salt and never substitutes names/locators', () => {
  const originalSalt = salt(); const intake = createShopeePrivateIntake({ salt: originalSalt, keyId }); originalSalt.fill(0);
  const result = sanitize(intake, [row('918273645'), row(918273645), row('918273646')]);
  assert.equal(result[0].authorIdentity.hash, result[1].authorIdentity.hash);
  assert.notEqual(result[0].authorIdentity.hash, result[2].authorIdentity.hash);
  assert.notEqual(result[0].authorIdentity.hash, sanitize(createShopeePrivateIntake({ salt: Buffer.alloc(32, 8), keyId }), [row('918273645')])[0].authorIdentity.hash);
  assert.equal(result[0].comment, row('918273645').comment);
  const { authorId: _removed, ...missing } = row('918273645');
  assert.deepEqual(sanitize(intake, [missing])[0].authorIdentity, { state: 'MISSING', hash: null });
  for (const invalid of [null, 0, -1, '', '00', 'name', 'https://example.test/profile', 9007199254740992, {}]) {
    assert.deepEqual(sanitize(intake, [row(invalid)])[0].authorIdentity, { state: 'INVALID', hash: null });
  }
  const serialized = JSON.stringify({ intake, result });
  for (const secret of ['918273645', 'PRIVATE_DISPLAY_NAME', 'PRIVATE_AVATAR', 'PRIVATE_PROFILE', 'PRIVATE_USERNAME', 'PRIVATE_NESTED_ID', salt().toString('hex')]) assert.equal(serialized.includes(secret), false);
});

test('private config requires explicit byte salt and a nonsecret UUID; quotation PII remains verbatim', () => {
  for (const configuration of [{ salt: Buffer.alloc(31), keyId }, { salt: salt(), keyId: salt().toString('hex') }, { salt: Buffer.from(keyId), keyId }]) {
    assert.throws(() => createShopeePrivateIntake(configuration), /Private/);
  }
  const text = 'Synthetic source quote: name PERSON_IN_QUOTE, phone 0123456789, author ID 918273645.';
  const result = sanitize(createShopeePrivateIntake({ salt: salt(), keyId }), [{ ...row('918273645'), comment: text }, null]);
  assert.equal(result[0].comment, text, 'metadata privacy is not full free-text sanitization');
  assert.equal(result[1].comment, null);
  assert.throws(() => sanitize(createShopeePrivateIntake({ salt: salt(), keyId }), [{ ...row('918273645'), comment: 'x'.repeat(20001) }]), /exceeds/);
});

test('unverified mapping and forged raw-page mechanics fail closed before returning a private capture', async () => {
  const intake = createShopeePrivateIntake({ salt: salt(), keyId });
  const unverified = { ...intake, profile: { ...intake.profile, field: 'username' } };
  assert.throws(() => new FixtureShopeeCollector(Buffer.from('[]'), unverified as unknown as typeof intake), /Unverified private Shopee field mapping/);
  const forged = { ...intake, sanitizePage: (bytes: Buffer) => bytes };
  await assert.rejects(new FixtureShopeeCollector(Buffer.from(JSON.stringify([row('918273645')])), forged).collect([
    { platform: 'shopee', shopId: '2001', itemId: '3001', productUrl: 'https://shopee.vn/product/2001/3001' }]), /Invalid private Shopee rows/);
});
