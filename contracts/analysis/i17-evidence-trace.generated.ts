/* Generated from i17-evidence-trace.schema.json. Do not edit by hand. */

export type Digest = string;
export type Count = number;
export type Pointer = string;

export interface I17EvidenceTrace {
  contractVersion: '1.0.0';
  methodOutputId: Digest;
  sectionId: 'I17';
  sectionTitle: 'Phụ lục và bằng chứng';
  methodId: 'evidence-trace-index';
  methodVersion: '2.0.0';
  bindingPolicyVersion: 'directional-evidence-trace-v1';
  deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT';
  approvalState: 'UNREVIEWED';
  evidenceState: 'RESOLVED_REFERENCES_NOT_SOURCE_TRUTH';
  upstreamBindingSha256: Digest;
  upstreamBinding: {
    sourcePackage: {
      packageId: string;
      version: number;
      manifestArtifactSha256: Digest;
      packageContentSha256: Digest;
    };
    catalogSha256: Digest;
    normalizedInputSha256: Digest;
    metricResultSha256: Digest;
    claimSetSha256: Digest;
    /**
     * @minItems 3
     * @maxItems 4
     */
    methodArtifacts:
      | [MethodArtifact, MethodArtifact, MethodArtifact]
      | [MethodArtifact, MethodArtifact, MethodArtifact, MethodArtifact];
  };
  summary: {
    entryCount: Count;
    resolvedEntryCount: Count;
    unresolvedEntryCount: 0;
    referencedArtifactCount: Count;
    methodArtifactCount: Count;
    claimCount: Count;
  };
  /**
   * @minItems 1
   * @maxItems 120
   */
  entries: [Entry, ...Entry[]];
  /**
   * @minItems 6
   * @maxItems 20
   */
  limitations:
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
  /**
   * @minItems 5
   * @maxItems 16
   */
  reopenConditions:
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
export interface MethodArtifact {
  sectionId: 'M02' | 'M08' | 'M13' | 'I03';
  fileName:
    | 'm02-scope-method.json'
    | 'm08-tablet-quote-method.json'
    | 'm13-provenance-appendix.json'
    | 'i03-research-method.json';
  sha256: Digest;
  methodOutputId: Digest;
  methodId: string;
  methodVersion: '2.0.0';
}
export interface Entry {
  entryId: Digest;
  sectionId: 'M02' | 'M03' | 'M04' | 'M08' | 'M13' | 'I03';
  subjectType: 'METHOD_ARTIFACT' | 'FACT_CLAIM';
  subjectId: string;
  relationType: 'TRACE_FOR' | 'CALCULATION_BASIS';
  resolutionState: 'RESOLVED';
  artifactFile:
    | 'metric-result.json'
    | 'm02-scope-method.json'
    | 'm08-tablet-quote-method.json'
    | 'm13-provenance-appendix.json'
    | 'i03-research-method.json';
  artifactSha256: Digest;
  artifactPointer: Pointer;
  /**
   * @minItems 1
   * @maxItems 8
   */
  supportingPointers:
    | [Pointer]
    | [Pointer, Pointer]
    | [Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer];
  /**
   * @maxItems 2
   */
  denominatorPointers: [] | [Pointer] | [Pointer, Pointer];
  /**
   * @maxItems 2
   */
  coveragePointers: [] | [Pointer] | [Pointer, Pointer];
  /**
   * @maxItems 2
   */
  membershipPointers: [] | [Pointer] | [Pointer, Pointer];
  scopeKey: ('all' | 'wide' | 'core') | null;
  deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT';
  approvalState: 'UNREVIEWED';
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
