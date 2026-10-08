export type PageIndexPdfState =
  | 'INDEXING'
  | 'READY'
  | 'FAILED'
  | 'SKIPPED_LOW_BALANCE'
  | 'SKIPPED_USAGE_LIMIT'
  | 'DISABLED';

export interface PageIndexPdfDocument {
  readonly fileName: string;
  readonly sourceSha256: string;
  readonly state: PageIndexPdfState;
}

export interface PageIndexPdfNoticeProps {
  readonly documents: readonly PageIndexPdfDocument[];
  /** True while new PDFs are not being sent (low balance, usage limit or disabled). */
  readonly paused: boolean;
  readonly pausedCopy?: string;
}

/** Per-PDF run-page copy. Missing stays missing; a failed file never contributes a quote. */
export function pageIndexPdfStateCopy(state: PageIndexPdfState): { readonly label: string; readonly detail: string } {
  switch (state) {
    case 'INDEXING': return { label: 'Đang lập chỉ mục', detail: 'PDF đang được gửi lập chỉ mục; trích dẫn sẽ có sau khi xong.' };
    case 'READY': return { label: 'Sẵn sàng', detail: 'PDF đã lập chỉ mục xong và có thể cho trích dẫn đã kiểm chứng.' };
    case 'FAILED': return { label: 'Lỗi — báo cáo không có trích dẫn từ tài liệu này', detail: 'Không lập chỉ mục được tài liệu này; báo cáo không dùng trích dẫn nào từ đây.' };
    case 'SKIPPED_LOW_BALANCE':
    case 'SKIPPED_USAGE_LIMIT': return { label: 'Bỏ qua vì số dư thấp', detail: 'Chưa gửi tài liệu này để giữ số dư; báo cáo không có trích dẫn từ đây.' };
    case 'DISABLED': return { label: 'Đã tắt', detail: 'Lập chỉ mục tự động đang tắt; tài liệu này không được gửi.' };
  }
}

/**
 * Run-page list of PDF indexing states with the paused warning banner.
 * Pure presentation: states come from the server-provided ledger snapshot.
 */
export default function PageIndexPdfNotice({ documents, paused, pausedCopy }: PageIndexPdfNoticeProps) {
  if (documents.length === 0 && !paused) return null;
  return <section className="ra-block" aria-labelledby="ra-pageindex-title">
    <h3 id="ra-pageindex-title">Tài liệu PDF</h3>
    {paused && <div className="ra-message error" role="alert"><p>{pausedCopy ?? 'Đã tạm dừng gửi PDF mới vì số dư thấp.'}</p></div>}
    {documents.length === 0
      ? <p className="ra-muted">Phiên này chưa dùng tài liệu PDF nào.</p>
      : <ul className="ra-source-list">{documents.map(document => {
        const copy = pageIndexPdfStateCopy(document.state);
        return <li key={document.sourceSha256}><div style={{ overflowWrap: 'anywhere' }}><b>{document.fileName}</b></div><span className="status-pill">{copy.label}</span><p className="ra-muted">{copy.detail}</p></li>;
      })}</ul>}
  </section>;
}
