import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Candidate, CandidateBasket, DemoState } from './model';
import { generatedBasketKey, ownerBasketDisabled, OwnerWriteError, submitOwnerBasketAndReload } from './data-source';

interface CandidateBasketPanelProps {
  readonly mode: 'real' | 'demo';
  readonly marketId: string;
  readonly candidates: readonly Candidate[];
  readonly baskets: readonly CandidateBasket[];
  readonly ownerToken: string | null;
  readonly reloadReal: () => Promise<DemoState>;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
  readonly onDemoFreeze: (input: { id: string; key: string; version: number; candidateIds: readonly string[] }) => void;
}

export default function CandidateBasketPanel({ mode, marketId, candidates, baskets, ownerToken, reloadReal, onSaved, onCancel, onDemoFreeze }: CandidateBasketPanelProps) {
  const familyKeys = useMemo(() => [...new Set(baskets.map((basket) => basket.key))].sort(), [baskets]);
  const [newBasketKey] = useState(() => generatedBasketKey());
  const [family, setFamily] = useState<string>('new');
  const basketKey = family === 'new' ? newBasketKey : family;
  // Keep the explicit target version and selected revisions stable for ambiguous retries.
  const [versionByFamily] = useState(() => new Map(familyKeys.map((key) => [key, Math.max(...baskets.filter((basket) => basket.key === key).map((basket) => basket.version)) + 1])));
  const version = family === 'new' ? 1 : (versionByFamily.get(family) ?? 1);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [requestSnapshot, setRequestSnapshot] = useState<{ basketKey: string; version: number; candidates: readonly { candidateId: string; candidateVersion: number; label: string }[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const inFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const toggle = (id: string) => { setRequestSnapshot(null); setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  const changeFamily = (key: string) => {
    setFamily(key);
    setSelected([]);
    setRequestSnapshot(null);
    setMessage('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || selected.length === 0) return;
    const members = selected.map((id) => candidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is Candidate => Boolean(candidate)).map((candidate) => ({ candidateId: candidate.id, candidateVersion: candidate.version, label: candidate.name }));
    if (members.length !== selected.length) return;
    const snapshot = requestSnapshot ?? { basketKey, version, candidates: members };
    setRequestSnapshot(snapshot);
    if (mode === 'demo' || ownerToken) setConfirm(true);
  };
  const freeze = async () => {
    if (inFlight.current) return;
    if (!requestSnapshot || requestSnapshot.candidates.length === 0) return;
    const selections = requestSnapshot.candidates.map(({ candidateId, candidateVersion }) => ({ candidateId, candidateVersion }));
    if (mode === 'demo') { onDemoFreeze({ id: `basket-demo-${Date.now().toString(36)}`, key: requestSnapshot.basketKey, version: requestSnapshot.version, candidateIds: requestSnapshot.candidates.map((item) => item.candidateId) }); return; }
    if (!ownerToken) return;
    inFlight.current = true;
    setPending(true);
    setConfirm(false);
    setMessage('');
    try {
      const outcome = await submitOwnerBasketAndReload({ workspaceId: marketId, basketKey: requestSnapshot.basketKey, version: requestSnapshot.version, candidates: selections, token: ownerToken }, reloadReal);
      if (outcome.kind === 'conflict') setMessage('Ứng viên hoặc rổ đã thay đổi. Dữ liệu mới nhất đã được tải lại; lựa chọn hiện tại được giữ để đối chiếu. Đóng biểu mẫu rồi mở lại trước khi tạo phiên bản mới.');
      else onSaved();
    } catch (error) {
      setMessage(error instanceof OwnerWriteError ? error.message : 'Không thể đóng băng rổ ứng viên.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  useEffect(() => {
    if (!confirm) return;
    confirmButton.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending) setConfirm(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirm, pending]);

  return <section className="candidate-editor basket-editor" aria-labelledby="basket-title">
    <div className="heading compact"><div><h3 id="basket-title">Đóng băng rổ ứng viên</h3><p>Đóng băng rổ chỉ tạo snapshot bất biến của các phiên bản ứng viên đã chọn. Thao tác này chưa tạo quyết định B7 và chưa tạo workspace sản phẩm.</p></div></div>
    <form onSubmit={submit}>
      <label className="basket-family">Nhóm rổ
        <select value={family} onChange={(event) => changeFamily(event.target.value)} disabled={pending}>
          <option value="new">Tạo rổ mới · phiên bản 1</option>
          {familyKeys.map((key, index) => <option value={key} key={key}>Rổ {index + 1} · tạo phiên bản {versionByFamily.get(key) ?? 1}</option>)}
        </select>
        <small>{family === 'new' ? 'Một nhóm lịch sử mới với định danh kỹ thuật được tạo tự động.' : `Phiên bản mới nối tiếp lịch sử bất biến của Rổ ${familyKeys.indexOf(family) + 1}.`}</small>
      </label>
      <fieldset><legend>Ứng viên đưa vào snapshot v{version}</legend>{candidates.map((candidate) => <label className="basket-choice" key={candidate.id}><input type="checkbox" checked={selected.includes(candidate.id)} disabled={pending} onChange={() => toggle(candidate.id)} /><span><strong>{candidate.name}</strong>{candidate.summary && <small>{candidate.summary}</small>}<small>EXPLORING · phiên bản hiện tại v{candidate.version}</small></span></label>)}</fieldset>
      {message && <p className="form-error" role="alert">{message}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={mode === 'real' ? ownerBasketDisabled({ unlocked: ownerToken !== null, pending, selectedCount: selected.length }) : pending || selected.length === 0}>{pending ? 'Đang đóng băng…' : 'Đóng băng rổ cơ hội'}</button><button className="button" type="button" disabled={pending} onClick={onCancel}>Hủy</button></div>
    </form>
    {mode === 'real' && !ownerToken && <p className="decision-note">Mở khóa OWNER cục bộ ở thanh phía trên để bật đóng băng.</p>}
    <p className="caption">Định danh rổ được tạo tự động và không thể chỉnh sửa. Sau lỗi kết nối, thử lại trong biểu mẫu này dùng đúng nhóm rổ, phiên bản dự kiến và lựa chọn.</p>
    {confirm && <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="basket-confirm-title" aria-describedby="basket-confirm-description"><h3 id="basket-confirm-title">Xác nhận đóng băng rổ cơ hội</h3><p><strong>{family === 'new' ? 'Rổ mới' : `Rổ ${familyKeys.indexOf(family) + 1}`} · phiên bản {requestSnapshot?.version}</strong></p><p id="basket-confirm-description">Rổ này sẽ giữ nguyên các phiên bản ứng viên đã chọn. Chỉnh sửa ứng viên sau này không thay đổi snapshot này.</p><ul>{requestSnapshot?.candidates.map((item) => <li key={item.candidateId}>{item.label} · v{item.candidateVersion} · ID …{item.candidateId.slice(-8)}</li>)}</ul><div className="confirm-actions"><button ref={confirmButton} className="button" type="button" disabled={pending} onClick={() => setConfirm(false)}>Quay lại</button><button className="button primary" type="button" disabled={pending} onClick={() => void freeze()}>Đóng băng rổ cơ hội</button></div></div></div>}
  </section>;
}
