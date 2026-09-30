import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import type { VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

type Input = DescriptiveMarketMethods['input'];
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);

/** Synthetic source-normalized declarations for unit and real service package-intake tests. */
export function descriptiveMarketFixture(): {
  logicalPath: string;
  descriptor: Omit<Input, 'sourcePackage'>;
  files: VerifiedSourcePackageFile[];
} {
  const scope: Input['scope'] = {
    universe: 'Synthetic stores A and B', geography: 'Synthetic area', frame: 'January source table',
    inclusionRule: 'Both declared stores', exclusionRule: 'None', variantRule: 'Same source-defined search event',
  };
  const question = 'What searches does this synthetic source report?';
  const profileBytes = readFileSync(new URL('../../docs/research/method-configurations-v1/market-profile.md', import.meta.url));
  const adoptionBytes = readFileSync(new URL('../../docs/research/method-configurations-v1-adoption.md', import.meta.url));
  const configuration = {
    profileId: 'source-bound-descriptive-market-v1' as const, profileVersion: '1.0.0' as const,
    policyRevision: 'A41-adoption-2026-10-01', profileSha256: sha(profileBytes), adoptionSha256: sha(adoptionBytes),
  };
  const proof = {
    additive: true, aggregationUnit: 'source store partition', sourceKeyNamespace: 'synthetic-source/store',
    requiredMemberKeys: ['A', 'B'] as [string, ...string[]],
  };
  const literals = ['12', '8'].map(value => ({
    sourceWording: `${value} reported searches`, entityLabel: null,
    measureLiteral: 'Reported searches', measureDefinition: 'Source-defined search event count', unit: 'search events',
    period: { start: '2026-01-01', end: '2026-01-31', timezone: 'Asia/Bangkok', basis: 'source reporting month' },
    scope, observation: { state: 'observed_value' as const, value, precision: 'exact' as const },
  }));
  const sourceBytes = json({ observations: literals, storeKeys: ['A', 'B'], membershipProof: proof });
  const sourceSha256 = sha(sourceBytes);
  const observations: Input['m05'] = literals.map((literal, index) => ({
    ...literal, source: { sourceSha256, locator: `/observations/${index}` },
    aggregation: {
      ...proof, members: [{ sourceKey: index === 0 ? 'A' : 'B', source: { sourceSha256, locator: `/storeKeys/${index}` } }],
      proof: { sourceSha256, locator: '/membershipProof' },
    },
  }));
  const configBytes = json({ run: { configuration, question, scope } });
  const configSha256 = sha(configBytes);
  const descriptor: Omit<Input, 'sourcePackage'> = {
    contractVersion: '1.0.0', configuration: { ...configuration, runConfiguration: { sourceSha256: configSha256, locator: '/run' } },
    sources: [
      { logicalPath: 'descriptive/source.json', sha256: sourceSha256, evidenceFamily: 'synthetic-market', providerProvenance: 'synthetic' },
      { logicalPath: 'descriptive/config.json', sha256: configSha256, evidenceFamily: 'owner-declaration', providerProvenance: 'synthetic' },
    ],
    question, scope, m05: observations, m06: [], m07: [], peerSet: null, m09: [],
  };
  const file = (path: string, bytes: Buffer, evidenceFamily: string, mediaType = 'application/json'): VerifiedSourcePackageFile => ({
    path, bytes, sha256: sha(bytes), byteSize: bytes.byteLength, mediaType, evidenceFamily,
    representationRole: 'structured', independence: 'non_independent', providerProvenance: 'synthetic',
    provenanceBasis: 'Synthetic fixture declarations; authority documents are exact adopted bytes',
  });
  const logicalPath = 'descriptive/input.json';
  return {
    logicalPath, descriptor,
    files: [
      file(logicalPath, json(descriptor), 'normalized-descriptive-input'),
      file('descriptive/source.json', sourceBytes, 'synthetic-market'),
      file('descriptive/config.json', configBytes, 'owner-declaration'),
      file('descriptive/market-profile.md', profileBytes, 'method-authority', 'text/markdown'),
      file('descriptive/adoption.md', adoptionBytes, 'method-authority', 'text/markdown'),
    ],
  };
}
