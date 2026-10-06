// Six-step dossier navigation from the approved prototype. Steps 1–3 are local; 4–6 follow the server run.
import { useEffect, useRef } from 'react';

export interface StepItem {
  readonly label: string;
  readonly note?: string;
  readonly state: 'done' | 'current' | 'upcoming';
  readonly onSelect?: () => void;
}

export default function StepNav({ steps }: { readonly steps: readonly StepItem[] }) {
  const navigation = useRef<HTMLElement>(null);
  const currentIndex = steps.findIndex(step => step.state === 'current');
  useEffect(() => {
    const revealCurrent = () => {
      const list = navigation.current?.querySelector('ol');
      const current = navigation.current?.querySelector<HTMLElement>('[aria-current="step"]');
      if (!list || !current || list.scrollWidth <= list.clientWidth) return;
      const viewport = list.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      const delta = item.left < viewport.left ? item.left - viewport.left : item.right > viewport.right ? item.right - viewport.right : 0;
      if (delta) list.scrollTo({ left: list.scrollLeft + delta, behavior: 'auto' });
    };
    revealCurrent();
    window.addEventListener('resize', revealCurrent);
    return () => window.removeEventListener('resize', revealCurrent);
  }, [currentIndex]);
  return <nav ref={navigation} className="ra-steps-nav" aria-label="Các bước nghiên cứu"><ol>{steps.map((step, index) => {
    const content = <><span className="ra-step-number" aria-hidden="true">{index + 1}</span><span><b>{step.label}</b>{step.note && <small>{step.note}</small>}</span></>;
    return <li key={step.label} className={step.state}>
      {step.onSelect && step.state !== 'current'
        ? <button type="button" onClick={step.onSelect}>{content}<span className="ra-sr">{step.state === 'done' ? ' (đã xong)' : ''}</span></button>
        : <div aria-current={step.state === 'current' ? 'step' : undefined}>{content}<span className="ra-sr">{step.state === 'done' ? ' (đã xong)' : step.state === 'upcoming' ? ' (chưa tới)' : ''}</span></div>}
    </li>;
  })}</ol></nav>;
}
