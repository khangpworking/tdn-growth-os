import { routeToHash } from './routing';

const STEPS = ['Insight', 'Big Idea', 'Góc nội dung', 'Caption & Poster'] as const;

/** The campaign flow after the brief: every step links except the one on screen. */
export default function CampaignSteps({ campaignId, current }: { readonly campaignId: string; readonly current: 0 | 1 | 2 | 3 }) {
  const href = [routeToHash.campaignInsight(campaignId), routeToHash.campaignBigIdea(campaignId), routeToHash.campaignAngle(campaignId), routeToHash.packageNew(campaignId, [])];
  return <ol className="insight-steps" aria-label="Các bước chiến dịch">{STEPS.map((step, index) => <li key={step} className={index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}>
    {index !== current ? <a href={href[index]}><b>{step}</b></a> : <b>{step}</b>}
    <small>{index < current ? 'Đã qua' : index === current ? 'Đang làm' : 'Tiếp theo'}</small>
  </li>)}</ol>;
}
