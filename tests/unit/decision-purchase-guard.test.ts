import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAuthoredPurchaseProposal, hasDecisionPurchaseProposal } from '../../src/modules/analysis/research-automation/decision-purchase-guard.js';

test('U16 general purchase and trial-order proposals are blocked in Vietnamese and English', () => {
  for (const text of [
    'Mua sản phẩm đối thủ để kiểm tra chất lượng', 'Buy a competitor product to assess its quality',
    'Mua sản phẩm để kiểm tra', 'Purchase the product to inspect its quality',
    'Đặt hàng thử sản phẩm đối thủ', 'Order a competitor product for testing',
    'Place a trial order to inspect quality', 'Đặt một đơn hàng để đánh giá chất lượng',
    'Buying a product for testing is a proposed prerequisite',
    'Không chỉ mua sản phẩm để kiểm tra', 'Không thể không mua sản phẩm để kiểm tra',
    'Do not review public data; instead purchase a competitor product',
    'Không mua sản phẩm này nhưng mua sản phẩm khác để kiểm tra',
    'Do not buy this product and buy another one',
    'Do not buy this product or recommend purchasing another one',
    'Sau khi đã mua sản phẩm, kiểm tra chất lượng',
    'Review quality in order to buy a sample',
    'Order a competitor’s product to assess quality',
    "Order a competitor's product to assess quality",
    'Order two units of the competitor product for quality assessment',
    'Order three low-cost competitor products for testing',
    'No purchase is needed; order a competitor product for testing',
    'No purchase is needed to assess quality and buy a sample',
    'No purchase is needed to assess quality or order a competitor product',
    'Not only order a competitor product but inspect its quality',
  ]) assert.equal(hasAuthoredPurchaseProposal(text), true, text);
});

test('explicit prohibitions and descriptive retained/public evidence remain available', () => {
  for (const text of [
    'Không mua sản phẩm đối thủ; chỉ đánh giá qua nguồn công khai và dữ liệu chủ cung cấp',
    'Không đề xuất mua sản phẩm để kiểm tra chất lượng',
    'Do not buy a competitor product to assess quality', 'Never purchase a sample',
    'Không mua hay đặt hàng thử sản phẩm', 'Do not buy products or place an order',
    'Assess quality without purchasing products', 'Avoid buying a competitor product',
    'Khách hàng đã mua sản phẩm, theo lời tự báo cáo',
    'Nguồn ghi nhận khách hàng mua sản phẩm',
    'Review reports a customer buying a product',
    'Nguồn ghi mua tặng; cần kiểm tra nhu cầu người nhận.', 'Nguồn synthetic nêu mua tặng.',
    'Review owner purchase history and public reviews',
    'Review purchase behavior in public sources', 'Đối chiếu hành vi mua qua nguồn công khai',
    'Order retained source entries for review',
    'Đối chiếu lịch sử mua hàng do chủ cung cấp',
    'Review public data in order to assess quality',
    'No purchase is needed to assess quality; use public sources and owner data',
    'No purchase required for quality assessment',
    'No purchase is necessary; review public evidence',
    'Order source records about the product for quality review',
    'Order competitor product records by rating',
    'Order product reviews by date',
    'Order public reviews by product rating',
    'Review order history for the competitor product',
    'Source states the customer ordered a product',
  ]) assert.equal(hasAuthoredPurchaseProposal(text), false, text);
});

test('every nested authored field is guarded; source evidence is not an argument to the guard', () => {
  const fields = ['text', 'conciseEvidenceLinkedRationale', 'assumptions', 'unknowns', 'evidenceGaps',
    'limitations', 'conditions', 'prerequisites', 'immediateTask', 'proposedOwner', 'proposedDeadline'];
  for (const field of fields) {
    assert.equal(hasDecisionPurchaseProposal([{ [field]: field === 'text' ? 'Mua sản phẩm để kiểm tra chất lượng' : ['Buy a product to assess quality'] }]), true, field);
  }
  assert.equal(hasDecisionPurchaseProposal([{ counterevidenceRelations: [{ compatibility: { scope: 'Purchase a product to inspect it' } }] }]), true);
  assert.equal(hasDecisionPurchaseProposal([{ text: 'Assess public reviews; do not buy products', citedClaimRefs: ['claim-synthetic'] }]), false);
  assert.equal(hasDecisionPurchaseProposal([{ text: 'Review public evidence', citedClaimRefs: ['buy'], counterevidenceRefs: ['mua'], counterevidenceRelations: [{ claimRef: 'purchase' }] }]), false);
  assert.equal(hasDecisionPurchaseProposal([{ counterevidenceRelations: [{ compatibility: { scope: 'Order two units of the competitor product for quality assessment' } }] }]), true);
});
