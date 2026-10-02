// Hash routes for automated research. The run id lives in the URL so a reload resumes the same run
// without browser storage.

export interface ResearchAutomationRoute {
  readonly marketId: string;
  readonly runId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `#/markets/<marketId>/research` (new research) or `#/markets/<marketId>/research/<runId>`. */
export function parseResearchAutomationHash(hash: string): ResearchAutomationRoute | null {
  if (!hash.startsWith('#/') || hash.includes('?')) return null;
  let parts: string[];
  try { parts = hash.slice(2).split('/').map(decodeURIComponent); } catch { return null; }
  if (parts[0] !== 'markets' || parts[2] !== 'research' || !parts[1]) return null;
  if (parts.length === 3) return { marketId: parts[1], runId: null };
  if (parts.length === 4 && UUID.test(parts[3]!)) return { marketId: parts[1], runId: parts[3]! };
  return null;
}

export function researchAutomationHash(marketId: string, runId: string | null = null): string {
  const base = `#/markets/${encodeURIComponent(marketId)}/research`;
  return runId === null ? base : `${base}/${encodeURIComponent(runId)}`;
}
