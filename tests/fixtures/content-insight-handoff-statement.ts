import { randomUUID } from 'node:crypto';
import type { InsightReportStatement } from '../../contracts/analysis/insight-report-statement.generated.js';
export const id = (n: number) => `c1c10000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const at = '2026-10-08T00:00:00.000Z';
export const fullSentence = 'Người chăm sóc muốn duy trì thói quen đều đặn, nhưng họ lo lịch sinh hoạt thay đổi sẽ làm gián đoạn việc chăm sóc.';
export function statement(revisionId: string, patch: Partial<InsightReportStatement> = {}): InsightReportStatement {
  return { contractVersion: '1.0.0', statementId: randomUUID(), revisionId, purchaseStage: 'DESIRE', customer: 'Nhóm chăm sóc giả định',
    hiddenTruth: 'Sự thật ngầm giả định riêng', motivation: 'Động lực giả định riêng', conflict: 'Muốn uống đều, nhưng sợ táo bón', insight: fullSentence,
    threeC: { customer: 'Khách giả định', brand: 'Thương hiệu giả định', category: 'Ngành giả định' },
    evidence: [{ platform: 'shopee', count: 7, denominator: 19 }, { platform: 'tiktok', count: 3 }], confidence: { level: 'WEAK', hypothesis: true }, ...patch };
}
