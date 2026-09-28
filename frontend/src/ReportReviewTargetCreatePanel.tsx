import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  createReportReviewTarget,
  loadReportReviewTarget,
  ReportReviewTargetDataError,
} from './report-review-data-source';
import { routeToHash } from './routing';

interface Props {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly interpretationId: string;
  readonly interpretationNumber: number;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

export default function ReportReviewTargetCreatePanel(props: Props) {
  const [intendedUse, setIntendedUse] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const validUse = intendedUse.length > 0 && intendedUse.length <= 300 && intendedUse.trim() === intendedUse;
  const blocked = !props.writesAvailable || !props.ownerToken || !validUse || pending;

  const submit = async () => {
    if (blocked || !props.ownerToken) return;
    setPending(true);
    setMessage('');
    try {
      const receipt = await createReportReviewTarget({
        reportId: props.reportId,
        reportVersion: props.reportVersion,
        interpretationId: props.interpretationId,
        intendedUse,
        token: props.ownerToken,
      });
      const target = await loadReportReviewTarget(receipt.reviewTargetId);
      if (target.report.reportId !== props.reportId || target.report.version !== props.reportVersion || target.interpretation.interpretationId !== props.interpretationId || target.approvalScope.intendedUse !== intendedUse) {
        throw new ReportReviewTargetDataError('integrity', 'Gói review đọc lại không khớp snapshot vừa gửi.');
      }
      props.notify(receipt.exactRetry ? 'Đã xác minh lại gói review bất biến hiện có.' : 'Đã chuẩn bị gói review bất biến. Chưa có quyết định phê duyệt.');
      props.navigate(routeToHash.reviewTarget(receipt.reviewTargetId));
    } catch (error) {
      const problem = error instanceof ReportReviewTargetDataError ? error : new ReportReviewTargetDataError('connection', 'Không thể chuẩn bị gói review.');
      setMessage(problem.kind === 'unauthorized'
        ? 'OWNER đang khóa hoặc token không còn hợp lệ. Mở khóa lại rồi gửi đúng snapshot này.'
        : problem.kind === 'not_found'
          ? 'Report hoặc lần diễn giải đã chọn không còn khả dụng. Tải lại dữ liệu trước khi thử lại.'
          : problem.kind === 'integrity'
            ? 'Dữ liệu không vượt qua kiểm tra toàn vẹn. Không có gói review nào được mở.'
            : problem.message);
    } finally {
      setPending(false);
      setConfirming(false);
    }
  };

  return <section className="review-target-create" aria-labelledby={`review-target-create-${props.interpretationId}`}>
    <div>
      <p className="eyebrow">Chuẩn bị cho người duyệt</p>
      <h6 id={`review-target-create-${props.interpretationId}`}>Tạo gói review từ snapshot này</h6>
      <p>Gói sẽ khóa đúng report v{props.reportVersion}, lần diễn giải {props.interpretationNumber} và mục đích bạn nhập. Đây chưa phải phê duyệt.</p>
    </div>
    <label htmlFor={`review-target-use-${props.interpretationId}`}>
      Mục đích sử dụng
      <textarea
        id={`review-target-use-${props.interpretationId}`}
        maxLength={300}
        rows={3}
        value={intendedUse}
        onChange={(event) => { setIntendedUse(event.target.value); setMessage(''); }}
        placeholder="Ví dụ: Review nội bộ cơ hội thị trường trước khi lập danh sách ứng viên."
      />
    </label>
    <div className="review-target-create-footer">
      <span>{intendedUse.length}/300</span>
      <button className="button primary" type="button" disabled={blocked} onClick={() => setConfirming(true)}>
        {pending ? 'Đang xác minh…' : 'Chuẩn bị gói review'}
      </button>
    </div>
    {!props.writesAvailable && <p className="review-target-guidance">Runtime hiện chỉ đọc. Cần bật OWNER API cục bộ để chuẩn bị gói.</p>}
    {props.writesAvailable && !props.ownerToken && <p className="review-target-guidance">Mở khóa OWNER cục bộ ở thanh trên để dùng thao tác này.</p>}
    {intendedUse.length > 0 && !validUse && <p className="review-target-guidance error" role="alert">Mục đích phải từ 1–300 ký tự và không có khoảng trắng thừa ở đầu hoặc cuối.</p>}
    {message && <p className="review-target-guidance error" role="alert">{message}</p>}
    {confirming && <ConfirmDialog
      titleId="review-target-confirm-title"
      descriptionId="review-target-confirm-description"
      title="Khóa snapshot này thành gói review?"
      confirmLabel="Chuẩn bị đúng snapshot"
      pending={pending}
      onCancel={() => setConfirming(false)}
      onConfirm={() => void submit()}
    >
      <div id="review-target-confirm-description" className="review-target-confirmation">
        <p><strong>Báo cáo:</strong> v{props.reportVersion}</p>
        <p><strong>Nhận định AI:</strong> lần {props.interpretationNumber}</p>
        <p><strong>Mục đích:</strong> {intendedUse}</p>
        <p>Hành động này tạo một gói bất biến để đọc lại. Nó không ghi APPROVE, HOLD hoặc REJECT.</p>
      </div>
    </ConfirmDialog>}
  </section>;
}
