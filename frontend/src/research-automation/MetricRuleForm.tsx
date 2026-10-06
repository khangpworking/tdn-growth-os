import { useState, type FormEvent } from 'react';
import type { AutomationMetricRulebook } from '../../../contracts/analysis/automation-metric-rule-adoption.generated';

type Props = { disabled: boolean; existing?: AutomationMetricRulebook; onPrepare: (rulebook: AutomationMetricRulebook) => void };
const labels = { CORE_CANDIDATE: 'Ứng viên cốt lõi', ADJACENT: 'Liền kề', OUTSIDE: 'Ngoài phạm vi', UNKNOWN: 'Chưa xác định' };
const keys = Object.keys(labels) as (keyof typeof labels)[];
const emptyGroup = () => ({ key: crypto.randomUUID(), label: '', definition: '' });

export default function MetricRuleForm({ disabled, existing, onPrepare }: Props) {
  const [draft, setDraft] = useState<AutomationMetricRulebook>(() => existing
    ? { ...existing, revision: existing.revision + 1, definitions: { ...existing.definitions }, groups: structuredClone(existing.groups) }
    : { ruleId: crypto.randomUUID(), revision: 1, title: '', definitions: { CORE_CANDIDATE: '', ADJACENT: '', OUTSIDE: '', UNKNOWN: '' }, groups: [emptyGroup()], wideUnknownPolicy: 'exclude' });
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (disabled) return;
    if (![draft.title, ...Object.values(draft.definitions), ...draft.groups.flatMap(group => [group.label, group.definition])].every(value => value.trim())) {
      setError('Điền tên, đủ bốn định nghĩa và định nghĩa cho mỗi nhóm.'); return;
    }
    if (new TextEncoder().encode(JSON.stringify(draft)).length > 15 * 1024) {
      setError('Quy tắc vượt giới hạn một lần gửi. Rút gọn định nghĩa trước khi xem lại; hệ thống không tự cắt nội dung.'); return;
    }
    setError(''); onPrepare(structuredClone(draft));
  };
  return <form onSubmit={submit} className="ra-rule-form">
    <fieldset disabled={disabled}><legend>{existing ? `Soạn quy tắc bản ${draft.revision}` : 'Quy tắc phân loại mới'}</legend>
      <label className="ra-label">Tên quy tắc<input className="ra-field" required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      {keys.map(key => <label className="ra-label" key={key}>Định nghĩa: {labels[key]}<textarea className="ra-field" required maxLength={2000} rows={3} value={draft.definitions[key]}
        onChange={event => setDraft({ ...draft, definitions: { ...draft.definitions, [key]: event.target.value } })} /></label>)}
      <p className="ra-muted">Chưa xác định được giữ để xem, không tính vào WIDE. Bạn định nghĩa khi nào dùng từng phân loại; hệ thống không điền quy tắc thay bạn.</p>
      <h5>Các nhóm sản phẩm</h5>
      {draft.groups.map((group, index) => <div className="ra-rule-group" key={group.key}>
        <label className="ra-label">Tên nhóm {index + 1}<input className="ra-field" required maxLength={200} value={group.label} onChange={event => setDraft({ ...draft, groups: draft.groups.map(item => item.key === group.key ? { ...item, label: event.target.value } : item) as AutomationMetricRulebook['groups'] })} /></label>
        <label className="ra-label">Định nghĩa nhóm {index + 1}<textarea className="ra-field" required maxLength={2000} rows={2} value={group.definition} onChange={event => setDraft({ ...draft, groups: draft.groups.map(item => item.key === group.key ? { ...item, definition: event.target.value } : item) as AutomationMetricRulebook['groups'] })} /></label>
        <button type="button" className="button" disabled={draft.groups.length === 1} onClick={() => setDraft({ ...draft, groups: draft.groups.filter(item => item.key !== group.key) as AutomationMetricRulebook['groups'] })}>Bỏ nhóm {index + 1}</button>
      </div>)}
      <button type="button" className="button" disabled={draft.groups.length >= 100} onClick={() => setDraft({ ...draft, groups: [...draft.groups, emptyGroup()] })}>Thêm nhóm</button>
      <p className="ra-muted">Bước tiếp theo chỉ xác nhận quy tắc. Chưa duyệt các dòng sản phẩm hoặc tạo báo cáo.</p>
      {error && <p className="ra-problem" role="alert">{error}</p>}
      <button type="submit" className="button primary">Xem lại quy tắc</button>
    </fieldset>
  </form>;
}
