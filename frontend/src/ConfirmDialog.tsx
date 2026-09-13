import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export default function ConfirmDialog({ titleId, descriptionId, title, children, confirmLabel, pending = false, onCancel, onConfirm }: { readonly titleId: string; readonly descriptionId?: string; readonly title: string; readonly children: ReactNode; readonly confirmLabel: string; readonly pending?: boolean; readonly onCancel: () => void; readonly onConfirm: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) { event.preventDefault(); onCancel(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0]!; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); returnFocus?.focus(); };
  }, [onCancel, pending]);
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}><div ref={dialog} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}><h3 id={titleId}>{title}</h3>{children}<div className="confirm-actions"><button ref={cancel} className="button" type="button" disabled={pending} onClick={onCancel}>Hủy</button><button className="button primary" type="button" disabled={pending} onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}
