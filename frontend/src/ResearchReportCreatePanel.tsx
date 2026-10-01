import { useEffect, useId, useRef, useState } from 'react';
import type { ResearchGenerationInputs, ResearchGenerationReceipt, ResearchGenerationRequest } from '../../contracts/api/research-generation-api.generated';
import { createResearchReport, loadResearchGenerationInputs, ResearchGenerationClientError } from './research-generation-client';

export interface ResearchReportCreatePanelProps {
  readonly workspaceId: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly onCreated: (receipt: ResearchGenerationReceipt) => void;
}

export default function ResearchReportCreatePanel({ workspaceId, ownerToken, writesAvailable, onCreated }: ResearchReportCreatePanelProps) {
  const id = useId();
  const [inventory, setInventory] = useState<ResearchGenerationInputs | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectionId, setSelectionId] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'error' | 'done'>('idle');
  const [failure, setFailure] = useState<ResearchGenerationClientError | null>(null);
  const [receipt, setReceipt] = useState<ResearchGenerationReceipt | null>(null);
  const operation = useRef<ResearchGenerationRequest | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const session = useRef({ workspaceId, ownerToken, writesAvailable });
  if (session.current.workspaceId !== workspaceId || session.current.ownerToken !== ownerToken || session.current.writesAvailable !== writesAvailable) {
    session.current = { workspaceId, ownerToken, writesAvailable };
  }
  const priorWorkspace = useRef(workspaceId);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (priorWorkspace.current !== workspaceId) {
      priorWorkspace.current = workspaceId;
      operation.current = null; busy.current = false;
      setSelectionId(''); setStatus('idle'); setFailure(null); setReceipt(null);
    }
    setInventory(null); setLoadError('');
    if (!writesAvailable || !ownerToken) { setLoadState('idle'); return; }
    const controller = new AbortController();
    let active = true;
    setLoadState('loading');
    void loadResearchGenerationInputs(workspaceId, ownerToken, controller.signal).then(value => {
      if (!active) return;
      setInventory(value); setLoadState('ready');
    }).catch(error => {
      if (!active) return;
      setLoadState('error');
      setLoadError(error instanceof ResearchGenerationClientError ? error.message : 'Chưa tải được danh sách nguồn.');
    });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, ownerToken, writesAvailable, reload]);

  const selected = inventory?.workspaceId === workspaceId ? inventory.choices.find(choice => choice.selectionId === selectionId) : undefined;
  const lockedOperation = status === 'pending' || status === 'error' || status === 'done';
  const canChooseAgain = status === 'done' || (status === 'error' && (failure?.kind === 'source' || failure?.kind === 'selection'));

  async function submit() {
    if (busy.current || !ownerToken || !writesAvailable || (!operation.current && !selected)) return;
    if (!operation.current) operation.current = {
      contractVersion: '1.0.0', workspaceId, selectionId: selected!.selectionId, requestKey: crypto.randomUUID(),
    };
    const body = operation.current;
    const activeSession = session.current;
    busy.current = true; setStatus('pending'); setFailure(null);
    const current = () => mounted.current && session.current === activeSession && operation.current === body;
    try {
      const value = await createResearchReport(body, ownerToken);
      if (!current()) return;
      setReceipt(value); setStatus('done');
      onCreated(value);
    } catch (error) {
      if (!current()) return;
      setFailure(error instanceof ResearchGenerationClientError ? error : new ResearchGenerationClientError('connection', 'Chưa xác nhận được kết quả.'));
      setStatus('error');
    } finally {
      if (operation.current === body) {
        busy.current = false;
        if (mounted.current && session.current.workspaceId === body.workspaceId && session.current !== activeSession) {
          setStatus('error');
          setFailure(new ResearchGenerationClientError('connection', 'Phiên OWNER đã đổi trong khi đang tạo. Mở khóa và thử lại cùng yêu cầu để xác nhận kết quả.'));
        }
      }
    }
  }

  function chooseAgain() {
    if (busy.current) return;
    operation.current = null; setSelectionId(''); setStatus('idle'); setFailure(null); setReceipt(null);
    setReload(value => value + 1);
  }

  return <section className="report-version-summary" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Tạo báo cáo mới</h4>
    <p className="report-limit">Chọn nguồn đã nhập và kiểm tra kỳ dữ liệu. Báo cáo lưu được phần có đủ bằng chứng; các phần còn thiếu vẫn được ghi rõ.</p>
    {!writesAvailable ? <p className="report-prompt">Chế độ hiện tại chưa cho phép tạo báo cáo.</p>
      : !ownerToken ? <p className="report-prompt">Mở khóa OWNER ở đầu trang để chọn nguồn và tạo báo cáo.</p>
      : <>
        {loadState === 'loading' && <p className="report-loading" role="status">Đang kiểm tra danh sách nguồn đã lưu…</p>}
        {loadState === 'error' && <div className="report-message error" role="alert"><p>{loadError}</p><button className="button" type="button" onClick={() => setReload(value => value + 1)}>Tải lại nguồn</button></div>}
        {loadState === 'ready' && inventory?.choices.length === 0 && <div className="report-message"><strong>Chưa có nguồn phù hợp</strong><p>Cần package đã nhập với workbook Metric Shopee Sheet1 và manifest nêu rõ phạm vi, kỳ đo. Nhập nguồn bằng công cụ intake hiện có rồi tải lại.</p><button className="button" type="button" onClick={() => setReload(value => value + 1)}>Tải lại nguồn</button></div>}
        {loadState === 'ready' && inventory && inventory.choices.length > 0 && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label className="report-version-picker" htmlFor={`${id}-source`}>Nguồn cho báo cáo
            <select id={`${id}-source`} value={selectionId} disabled={lockedOperation} required onChange={event => setSelectionId(event.target.value)}>
              <option value="">Chọn package và bộ dữ liệu…</option>
              {inventory.choices.map(choice => <option key={choice.selectionId} value={choice.selectionId}>{choice.sourceLabel} · v{choice.packageVersion} · {choice.workbookPath} · {choice.labelsPath ? `Phân loại: ${choice.labelsPath}` : 'Chưa có phân loại'}</option>)}
            </select>
          </label>
          {selected && <div className="report-message">
            <strong>{selected.sourceName}</strong>
            <p>Kỳ dữ liệu: {selected.period.start} đến {selected.period.end}. {selected.period.basis}</p>
            <p>{selected.labelsPath ? 'Có file phân loại. Khi tạo, hệ thống kiểm tra độ phủ trước khi chạy phương pháp quy mô.' : 'Chưa có phân loại: chỉ tạo báo cáo nguồn một phần, chưa chạy phương pháp M03 đã chuẩn bị.'}</p>
            <p>Chưa chọn báo giá theo viên. Báo cáo chưa có nhận định AI và chưa được duyệt.</p>
          </div>}
          <div className="report-actions"><button className="button primary" type="submit" disabled={status === 'pending' || status === 'done' || (!selected && !operation.current)}>{status === 'pending' ? 'Đang tạo báo cáo…' : status === 'error' ? 'Thử lại cùng yêu cầu' : 'Tạo báo cáo mới'}</button></div>
        </form>}
      </>}
    {status === 'pending' && <p className="report-prompt" role="status">Đang xác minh nguồn và lưu báo cáo. Chỉ gửi một yêu cầu; thao tác này không gọi AI.</p>}
    {status === 'error' && failure && <div className="report-message error" role="alert"><p>{failure.message}</p><p>Yêu cầu và nguồn đang được giữ nguyên. Thử lại để xác nhận kết quả, tránh tạo bản trùng.</p></div>}
    {status === 'done' && receipt && <div className="report-message" role="status"><strong>Đã lưu báo cáo v{receipt.version}{receipt.exactRetry ? ' từ yêu cầu trước' : ''}.</strong><p>{receipt.profile === 'source-backed-v1' ? 'Báo cáo nguồn một phần; phương pháp M03 đã chuẩn bị chưa chạy.' : 'Báo cáo đã ghép các phương pháp hiện hỗ trợ.'} Bản nháp chưa duyệt.</p></div>}
    {canChooseAgain && <div className="report-actions"><button className="button" type="button" onClick={chooseAgain}>{status === 'done' ? 'Chọn nguồn cho báo cáo khác' : 'Chọn lại nguồn'}</button></div>}
  </section>;
}
