import { useId, useRef, useState } from 'react';
import { MEDIA_TYPES, demoMediaFromFile, mediaBlocker, uploadBrandMedia, type MediaKind } from './catalog-data-source';
import { OwnerWriteError } from './data-source';

export interface MediaUploadProps {
  readonly mode: 'real' | 'demo';
  readonly brandId: string;
  readonly kind: MediaKind;
  readonly token: string | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly multiple?: boolean;
  readonly onUploaded: (mediaSha256: string) => void;
  readonly onDemoMedia: (mediaSha256: string, dataUrl: string) => void;
}

/** Picks PNG/JPEG/WebP files, checks them locally, then uploads them one by one to the brand's private media. */
export default function MediaUpload(props: MediaUploadProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const upload = async (files: readonly File[]) => {
    setMessage(''); setBusy(true);
    try {
      for (const file of files) {
        const blocker = mediaBlocker(file, props.kind);
        if (blocker) { setMessage(`${file.name}: ${blocker}`); continue; }
        try {
          if (props.mode === 'demo') {
            const media = await demoMediaFromFile(file);
            props.onDemoMedia(media.mediaSha256, media.dataUrl);
            props.onUploaded(media.mediaSha256);
          } else {
            const receipt = await uploadBrandMedia({ brandId: props.brandId, kind: props.kind, file, token: props.token! });
            props.onUploaded(receipt.mediaSha256);
          }
        } catch (error) {
          setMessage(`${file.name}: ${error instanceof OwnerWriteError ? error.message : 'Không thể tải ảnh lên.'}`);
        }
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const blocked = props.disabled || busy || (props.mode === 'real' && !props.token);
  return <div className="media-upload">
    <input ref={input} id={inputId} className="file-input" type="file" accept={MEDIA_TYPES.join(',')} multiple={props.multiple ?? false} disabled={blocked}
      onChange={(event) => { const files = [...(event.target.files ?? [])]; if (files.length > 0) void upload(files); }} />
    <label htmlFor={inputId} className={`button${blocked ? ' is-disabled' : ''}`} aria-disabled={blocked}>{busy ? 'Đang tải ảnh…' : props.label}</label>
    {message && <p className="form-error" role="alert">{message}</p>}
  </div>;
}
