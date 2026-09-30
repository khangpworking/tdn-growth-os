import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';

type Input = LocatedInsightMethods['input'];

export function locatedInsightFixture(): Input {
  return {
    contractVersion: '1.0.0', codebookId: 'located-evidence-v1-draft',
    profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded',
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    question: 'Which actions and reasons are explicitly stated?', inclusionRule: 'All supplied synthetic records',
    codingUnit: 'LOCATED_RECORD', adjudicationRule: 'Leave disagreement pending',
    sources: [{ logicalPath: 'accounts.json', sha256: '1'.repeat(64) }],
    records: [], brief: null, i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], corpora: [], i13Mentions: [],
  };
}

export function locatedSpan(text: string, quote: string): Input['i04'][number]['span'] {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error('Synthetic fixture quote missing');
  return { start, end: start + quote.length, quote };
}
