import ConfirmDialog from '../ConfirmDialog';

/** Confirmation copy only; its caller owns the exact frozen request and explicit authenticated action. */
export default function InsightCrosscheckConfirmation({ proposalLabel, eligibleCount, firstExecutionIds, secondModel, pending = false, onCancel, onConfirm }: {
  proposalLabel: string; eligibleCount: number; firstExecutionIds: readonly string[]; secondModel: string;
  pending?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const sampleCount = Math.min(200, eligibleCount);
  return <ConfirmDialog titleId="ic-crosscheck-confirm-title" descriptionId="ic-crosscheck-confirm-description"
    title="Gửi mẫu mã hóa cho model thứ hai?" confirmLabel="Gửi model thứ hai" pending={pending} onCancel={onCancel} onConfirm={onConfirm}>
    <p id="ic-crosscheck-confirm-description">Dùng đúng {proposalLabel} đã chọn và bộ mã đã lưu. Model thứ hai nhận nguyên văn nguồn cùng nghĩa của mã, không nhận nhãn hay gán mã của lượt đầu.</p>
    <p>{eligibleCount <= 200 ? `Dùng toàn bộ ${sampleCount} bản ghi nguồn đủ điều kiện.` : `Chọn đúng 200 trong ${eligibleCount} bản ghi nguồn đủ điều kiện.`} Hạt chọn mẫu và danh sách nguồn được lưu trước khi gửi; thử lại giữ đúng mẫu cũ.</p>
    <p>Model thứ hai: {secondModel}. Máy chủ kiểm tra cấu hình này khác mọi model trong chuỗi lượt đầu trước khi gọi.</p><details><summary>Thực thi lượt đầu đã lưu</summary>{firstExecutionIds.map(id => <p key={id}><code>{id}</code></p>)}</details>
    <p>Chỉ lưu hai kết quả và liệt kê khác biệt nguyên dạng. Chưa có thống kê độ nhất quán U11; kết quả vẫn là đề xuất AI chờ xem xét, chưa được duyệt hay phát hành.</p>
    <p>Thao tác này có thể gọi model tối đa hai lô và có thể phát sinh phí theo cấu hình máy chủ. Hủy ở đây chưa gửi model.</p>
  </ConfirmDialog>;
}
