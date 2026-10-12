import type { PersonaBinding, PersonaModelRequest, PersonaModelResponse, PersonaSnapshot, PersonaEvidenceCard, PersonaProposal,
  PersonaAttribute, PersonaRetainedCandidates } from '../../../../contracts/analysis/automation-insight-persona.generated.js';
import { readPrivatePersonaEvidence } from './insight-persona-evidence.js';
import { checkPersonaSource, checkPersonaBinding, checkPersonaTaxonomy, checkPersonaClassifications, checkPersonaSynthesis,
  personaDigest, personaCandidatesValid, personaSnapshotValid } from './insight-persona-contracts.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
export type PersonaEvidenceHandle = Awaited<ReturnType<typeof readPrivatePersonaEvidence>>;
export interface PersonaSourceContext { binding: PersonaBinding; evidence: PersonaEvidenceHandle }
export interface PersonaStageSource extends PersonaSourceContext { request: PersonaModelRequest; previous: PersonaSnapshot | null }
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function invalid(): never { throw new TypeError('INVALID_INSIGHT_PERSONA_STAGE'); }

/** Checks the entire frozen lineage before any root/model/artifact write. */
export function checkPersonaStage(source: PersonaStageSource): void {
  const safe = checkPersonaSource(source.evidence.publicSource());
  checkPersonaBinding(source.binding, safe);
  if (!same(source.request.binding, source.binding)) invalid();
  const previous = source.previous;
  if (source.request.stage === 'TAXONOMY') {
    if (previous !== null || !same(source.request.recordIndexes, safe.taxonomySample.recordIndexes)) invalid();
    return;
  }
  if (!previous || !personaSnapshotValid(previous) || !same(previous.binding, source.binding) || !previous.taxonomy ||
    previous.codebookSha256 !== personaDigest(previous.taxonomy)) invalid();
  const seen = new Set(previous.classifications.map(row => row.recordIndex));
  if (seen.size !== previous.classifications.length || previous.classifications.some(row => !safe.eligibleRecordIndexes.includes(row.recordIndex))) invalid();
  const remaining = safe.eligibleRecordIndexes.filter(index => !seen.has(index));
  if (previous.classificationComplete !== (remaining.length === 0)) invalid();
  if (source.request.stage === 'CLASSIFY') {
    // Existing100 transport boundary, source order, no model-selected skipping.
    if (!remaining.length || !same(source.request.recordIndexes, remaining.slice(0, 100)) || previous.cards.length || previous.personas.length) invalid();
  } else if (remaining.length || source.request.recordIndexes.length) invalid();
}
const shortage = 'Chưa đủ bằng chứng để đề xuất từ 3 đến 6 chân dung. Các thẻ đủ nguồn vẫn được giữ; chưa có kết luận về toàn bộ khách hàng.';
const dropped = 'Đã bỏ các mục không đủ nguồn hoặc không có thuộc tính trích nguyên văn. Mọi thẻ và chân dung được giữ đều là đề xuất, chờ chủ duyệt.';

/** Pure source-policy projection. The closure proves author/product minimums;
 * semantic topic/situation grouping is always an AI proposal, never truth or release. */
export function projectPersonaResponse(source: PersonaStageSource, response: PersonaModelResponse): PersonaRetainedCandidates {
  checkPersonaStage(source);
  const safe = source.evidence.publicSource();
  let snapshot: PersonaSnapshot;
  if (source.request.stage === 'TAXONOMY') {
    if (response.contractVersion !== 'insight-persona-taxonomy-response-v1') invalid();
    const taxonomy = checkPersonaTaxonomy(response.taxonomy, safe);
    snapshot = { contractVersion: 'insight-persona-snapshot-v1', binding: source.binding, taxonomy,
      codebookSha256: personaDigest(taxonomy), classifications: [], cards: [], personas: [], insufficiency: null,
      classificationComplete: false, status: 'PROPOSED', releaseEligibility: 'UNAVAILABLE' };
  } else if (source.request.stage === 'CLASSIFY') {
    if (response.contractVersion !== 'insight-persona-classification-response-v1') invalid();
    const batch = checkPersonaClassifications(response, safe, source.previous!.taxonomy!, source.request.recordIndexes);
    const classifications = [...source.previous!.classifications, ...batch.records];
    snapshot = { ...source.previous!, classifications, classificationComplete: classifications.length === safe.eligibleRecordIndexes.length };
  } else {
    if (response.contractVersion !== 'insight-persona-synthesis-response-v1') invalid();
    checkPersonaSynthesis(response, safe, source.previous!.taxonomy!, new Set(source.previous!.classifications
      .filter(row => row.status === 'CLASSIFIED').map(row => row.recordIndex)));
    // Attribute values are literal source words, not free demographic/need claims.
    // A structurally valid unsupported interpretation is dropped, not promoted.
    const literal = (attribute: PersonaAttribute) => attribute.quotes.some(quote => quote.span.quote === attribute.value);
    const cards = new Map<string, PersonaEvidenceCard>();
    const byKey = new Map<string, { card: PersonaEvidenceCard; selections: typeof response.cards[number]['quotes'] }>();
    let omitted = false;
    for (const candidate of response.cards) {
      const proof = source.evidence.card(candidate.quotes);
      if (!proof.eligible || proof.authorEvidence === 'INSUFFICIENT' || !literal(candidate.situation)) { omitted = true; continue; }
      const attributes = candidate.attributes.filter(literal); if (attributes.length !== candidate.attributes.length) omitted = true;
      const card: PersonaEvidenceCard = { cardId: proof.cardId, cardKey: candidate.cardKey, situation: candidate.situation,
        quotes: proof.quotes as PersonaEvidenceCard['quotes'], attributes, recordIndexes: proof.recordIndexes as PersonaEvidenceCard['recordIndexes'],
        authorEvidence: proof.authorEvidence, identityLimitation: proof.identityLimitation, status: 'PROPOSED' };
      if (!cards.has(card.cardId)) cards.set(card.cardId, card);
      byKey.set(candidate.cardKey, { card: cards.get(card.cardId)!, selections: candidate.quotes });
    }
    const personas = new Map<string, PersonaProposal>();
    for (const candidate of response.personas) {
      const selected = candidate.cardKeys.map(key => byKey.get(key));
      const attributes = candidate.attributes.filter(literal);
      if (selected.some(card => !card) || !attributes.length) { omitted = true; continue; }
      const proof = source.evidence.persona(selected.map(card => card!.selections));
      if (!proof.eligible || proof.authorEvidence === 'INSUFFICIENT') { omitted = true; continue; }
      const cardIds = [...new Set(selected.map(item => item!.card.cardId))].sort();
      // Rewording the same evidence cannot manufacture three separate personas.
      const personaId = personaDigest(['persona-selected-card-set-v1', safe.corpus.artifactSha256, cardIds]);
      if (personas.has(personaId)) { omitted = true; continue; }
      personas.set(personaId, { personaId, cardIds: cardIds as PersonaProposal['cardIds'], attributes: attributes as PersonaProposal['attributes'],
        recordIndexes: proof.recordIndexes as PersonaProposal['recordIndexes'], authorEvidence: proof.authorEvidence,
        broaderScopeEligible: true, sampleSize: proof.sampleSize, sampleSizeLabel: proof.sampleSizeLabel, label: proof.label,
        identityLimitation: proof.identityLimitation, status: 'PROPOSED', releaseEligibility: 'UNAVAILABLE' });
    }
    const qualified = [...personas.values()];
    snapshot = { ...source.previous!, cards: [...cards.values()], personas: (qualified.length >= 3 ? qualified : []) as PersonaSnapshot['personas'],
      insufficiency: qualified.length < 3 ? shortage : omitted ? dropped : null };
  }
  const candidates = { contractVersion: 'insight-persona-candidates-v1' as const, binding: source.binding,
    request: source.request, response, snapshot };
  if (!personaCandidatesValid(candidates)) invalid();
  return structuredClone(candidates);
}
