import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { DemoState } from './model';
import { generatedWorkspaceKey, ownerWorkspaceDisabled, OwnerWriteError, submitOwnerWorkspaceAndReload } from './data-source';

export default function WorkspaceCreatePanel({ mode, ownerToken, reloadReal, onCreated, onCancel, onDemoCreate }: { readonly mode: 'real' | 'demo'; readonly ownerToken: string | null; readonly reloadReal: () => Promise<DemoState>; readonly onCreated: (workspaceId: string) => void; readonly onCancel: () => void; readonly onDemoCreate: (id: string, title: string, description: string) => void }) {
  const [workspaceKey] = useState(() => generatedWorkspaceKey());
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [pending, setPending] = useState(false); const inFlight = useRef(false); const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (inFlight.current) return;
    const cleanTitle = title.trim(); const cleanDescription = description.trim();
    if (!cleanTitle || cleanTitle.length > 200 || cleanDescription.length > 1000) { setMessage('Kiểm tra lại tiêu đề và mô tả.'); return; }
    if (mode === 'demo') { onDemoCreate(`market-demo-${Date.now().toString(36)}`, cleanTitle, cleanDescription); return; }
    if (!ownerToken) return; inFlight.current = true; setPending(true); setMessage('');
    try {
      const outcome = await submitOwnerWorkspaceAndReload({ workspaceKey, title: cleanTitle, ...(cleanDescription ? { description: cleanDescription } : {}), token: ownerToken }, reloadReal);
      if (outcome.kind === 'conflict') setMessage('Định danh workspace đã được dùng với nội dung khác. Portfolio mới nhất đã được tải lại; hãy hủy form để bắt đầu với định danh mới.');
      else onCreated(outcome.receipt.workspaceId);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'connection') setMessage('Kết nối không rõ kết quả. Form giữ nguyên định danh; hãy thử gửi lại an toàn.');
      else setMessage(error instanceof OwnerWriteError ? error.message : 'Không thể tạo workspace.');
    } finally { inFlight.current = false; setPending(false); }
  };
  return <section className="surface surface-pad create-research"><h2>{mode === 'real' ? 'Tạo vùng nghiên cứu thị trường' : 'Tạo nghiên cứu minh họa'}</h2><p className="muted">Thao tác này chỉ tạo một vùng nghiên cứu trống. Hệ thống chưa thu thập dữ liệu, chạy phân tích hoặc gọi nhà cung cấp.</p><form onSubmit={(event) => void submit(event)}><label>Tên thị trường hoặc cơ hội<input className="search" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} autoFocus placeholder="Ví dụ: Chăm sóc giấc ngủ" /></label><label>Mô tả — không bắt buộc<textarea className="search" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>{message && <p className="form-error" role="alert">{message}</p>}<div className="form-actions"><button className="button primary" type="submit" disabled={mode === 'real' ? ownerWorkspaceDisabled({ unlocked: ownerToken !== null, pending, title }) : pending}>{pending ? 'Đang tạo…' : mode === 'real' ? 'Tạo workspace trống' : 'Tạo workspace demo'}</button><button className="button" type="button" disabled={pending} onClick={onCancel}>Hủy</button></div></form>{mode === 'real' && !ownerToken && <p className="decision-note">Mở khóa OWNER cục bộ ở thanh phía trên để bật gửi.</p>}</section>;
}
