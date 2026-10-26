import { useState } from 'react';
import type { MetricV3CaptureSpec } from '../../../contracts/analysis/metric-v3-capture-spec.generated';
import { metricV3Category, metricV3Defaults } from '../../../src/shared/metric-v3-preset';
import type { ResearchAutomationAutoRun } from './api';

type Suggestion = NonNullable<ResearchAutomationAutoRun['keyword2Suggestion']>;
export default function MetricV3PresetForm({ suggestion, endDate, disabled, pending, onConfirm }: {
  suggestion: Suggestion; endDate: string; disabled: boolean; pending: boolean;
  onConfirm: (preset: MetricV3CaptureSpec) => void;
}) {
  const [keyword1, setKeyword1] = useState(suggestion.keyword1);
  const [keyword2, setKeyword2] = useState(suggestion.term);
  const suggestedCategory = suggestion.categoryId === metricV3Category.id || metricV3Category.children.some(child => child.id === suggestion.categoryId);
  const [categoryId, setCategoryId] = useState(suggestedCategory ? metricV3Category.id : '');
  const [children, setChildren] = useState(suggestedCategory ? metricV3Category.children.map(child => child.id) : [] as string[]);
  const invalidKeyword = !keyword1.trim() || !keyword2.trim() ? 'Điền đủ hai từ khóa.'
    : keyword1.trim().toLocaleLowerCase() === keyword2.trim().toLocaleLowerCase() ? 'Hai từ khóa cần khác nhau.' : '';
  const invalidCategory = categoryId !== metricV3Category.id || children.length !== 4 || children.some(id => !metricV3Category.children.some(child => child.id === id))
    ? 'Chọn danh mục hợp lệ và đủ 4 danh mục con đã xác minh.' : '';
  const defaults = metricV3Defaults(keyword1, keyword2, endDate);
  const submit = () => {
    if (disabled || pending || invalidKeyword || invalidCategory) return;
    onConfirm(metricV3Defaults(keyword1.normalize('NFC').trim(), keyword2.normalize('NFC').trim(), endDate));
  };
  return <div className="ra-block">
    <h3>Metric v3</h3>
    <p>Kiểm tra phạm vi trước khi thu thập đầy đủ. Chỉ tiếp tục khi bạn xác nhận.</p>
    <fieldset disabled={disabled || pending}>
      <legend>Phạm vi tìm kiếm</legend>
      <p><label>Từ khóa 1 <small className="badge none">AI gợi ý</small><br /><input aria-label="Từ khóa 1" value={keyword1} maxLength={120} onChange={event => setKeyword1(event.target.value)} /></label></p>
      <p><label>Từ khóa 2 <small className="badge none">AI gợi ý</small><br /><input aria-label="Từ khóa 2" value={keyword2} maxLength={80} onChange={event => setKeyword2(event.target.value)} /></label></p>
      {invalidKeyword && <p role="alert" className="ra-message error">{invalidKeyword}</p>}
      <label>Danh mục <small className="badge none">{suggestedCategory ? 'AI gợi ý' : 'Chưa có gợi ý phù hợp'}</small><br />
        <select aria-label="Danh mục" value={categoryId} onChange={event => { setCategoryId(event.target.value); setChildren(event.target.value ? metricV3Category.children.map(child => child.id) : []); }}>
          <option value="">Chọn danh mục</option><option value={metricV3Category.id}>{metricV3Category.label}</option>
        </select>
      </label>
      <div role="group" aria-label="Danh mục con">
        {metricV3Category.children.map(child => <p key={child.id}><label><input type="checkbox" checked={children.includes(child.id)} onChange={event => setChildren(event.target.checked ? [...children, child.id] : children.filter(id => id !== child.id))} /> {child.label}</label></p>)}
      </div>
      <p className="ra-muted">Cây hiện có hỗ trợ danh mục này và đủ 4 danh mục con.</p>
      {invalidCategory && <p role="alert" className="ra-message error">{invalidCategory}</p>}
    </fieldset>
    <dl>
      <dt>Tìm kiếm thông minh <small className="badge none">mặc định</small></dt><dd>Bật</dd>
      <dt>Bộ lọc hữu ích <small className="badge none">mặc định</small></dt><dd>Loại sản phẩm bất thường, quà tặng và sản phẩm đã xóa</dd>
      <dt>Đánh giá <small className="badge none">mặc định</small></dt><dd>Số đánh giá &gt; 2% số đã bán</dd>
      <dt>Loại gian hàng <small className="badge none">mặc định</small></dt><dd>Gian hàng chính hãng và gian hàng thường</dd>
      <dt>Sàn <small className="badge none">mặc định</small></dt><dd>Shopee, Lazada, Tiki, TikTok Shop</dd>
      <dt>Khoảng thời gian <small className="badge none">mặc định</small></dt>
      <dd>30 ngày: {defaults.windows[0]!.period.startDate} – {endDate}; theo tuần</dd>
      <dd>12 tháng (365 ngày): {defaults.windows[1]!.period.startDate} – {endDate}; theo tháng</dd>
      <dd>Giữ số so sánh kỳ trước từ nguồn; không tự suy ra ngày kỳ trước.</dd>
    </dl>
    <button type="button" className="button" disabled={disabled || pending || !!invalidKeyword || !!invalidCategory} onClick={submit}>{pending ? 'Đang gửi yêu cầu…' : 'Xác nhận'}</button>
    {disabled && <p className="ra-muted">Mở khóa OWNER để xác nhận phạm vi.</p>}
  </div>;
}
