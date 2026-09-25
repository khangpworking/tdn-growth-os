import { useId, useRef, useState } from 'react';
import { MEDIA_TYPES, demoMediaFromFile, mediaBlocker, uploadBrandMedia, type MediaKind } from './catalog-data-source';
import { runUploads } from './media-upload-runner';

export interface MediaUploadProps {
  readonly mode: 'real' | 'demo';
  readonly brandId: string;
  readonly kind: MediaKind;
  readonly token: string | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly multiple?: boolean;
  /** Bound by the editor to the session that is current when the upload starts (see draft-editor.ts). */
  readonly callbacks: { readonly onStart: () => void; readonly onUploaded: (mediaSha256: string) => void; readonly onEnd: () => void };
  readonly onDemoMedia: (mediaSha256: string, dataUrl: string) => void;
}

/** Picks PNG/JPEG files, checks them locally, then uploads them one by one to the brand's private media. */
export default function MediaUpload(props: MediaUploadProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const upload = (files: readonly File[]) => {
    // Capture everything now: a later render may belong to another editing session.
    const { mode, brandId, kind, token, callbacks, onDemoMedia } = props;
    const problems: string[] = [];
    setMessage(''); setBusy(true);
    void runUploads(files, {
      ...callbacks,
      check: (file) => mediaBlocker(file, kind),
      upload: async (file) => {
        if (mode === 'demo') {
          const media = await demoMediaFromFile(file);
          onDemoMedia(media.mediaSha256, media.dataUrl);
          return media.mediaSha256;
        }
        return (await uploadBrandMedia({ brandId, kind, file, token: token! })).mediaSha256;
      },
      report: (problem) => { problems.push(problem); setMessage(problems.join(' ')); },
    }).finally(() => {
      setBusy(false);
      if (input.current) input.current.value = '';
    });
  };

  const blocked = props.disabled || busy || (props.mode === 'real' && !props.token);
  return <div className="media-upload">
    <input ref={input} id={inputId} className="file-input" type="file" accept={MEDIA_TYPES.join(',')} multiple={props.multiple ?? false} disabled={blocked}
      onChange={(event) => { const files = [...(event.target.files ?? [])]; if (files.length > 0) upload(files); }} />
    <label htmlFor={inputId} className={`button${blocked ? ' is-disabled' : ''}`} aria-disabled={blocked}>{busy ? 'Đang tải ảnh…' : props.label}</label>
    {message && <p className="form-error" role="alert">{message}</p>}
  </div>;
}
