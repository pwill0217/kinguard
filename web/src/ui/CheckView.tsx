import { useEffect, useRef, useState } from 'react';
import type { ImageInput } from '../ai/engine';
import type { Stage } from '../ai/pipeline';
import { fileToImageInput } from '../local/image';
import { SAMPLES } from './samples';

export interface CheckRequest {
  text: string;
  image?: ImageInput;
}

const STAGE_TEXT: Record<Stage, string> = {
  reading: 'Reading your screenshot…',
  redacting: 'Hiding your personal details…',
  screening: 'Looking for scam warning signs…',
  deep: 'Getting an expert double-check…',
  done: 'Done',
};

export function CheckView(props: {
  text: string;
  setText: (t: string) => void;
  busy: Stage | null;
  error: string | null;
  onCheck: (req: CheckRequest) => void;
}) {
  const { text, setText, busy, error, onCheck } = props;
  const [image, setImage] = useState<{ input: ImageInput; previewUrl: string } | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addImage(file: Blob) {
    setImgError(null);
    try {
      setImage(await fileToImageInput(file));
    } catch {
      setImgError('That picture could not be opened. Try a screenshot (PNG or JPG).');
    }
  }

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void addImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const canCheck = !busy && (text.trim().length > 0 || image);

  return (
    <section className="card check" aria-labelledby="check-title">
      <h1 id="check-title">Is this a scam?</h1>
      <p className="lead">Paste a text message, email, or anything you're unsure about. Kinguard hides your personal details before anything leaves this device.</p>

      <label htmlFor="msg" className="sr-only">Message to check</label>
      <textarea
        id="msg"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the message here…"
        rows={7}
        disabled={!!busy}
      />

      <div className="row wrap gap">
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          📷 Add a screenshot
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addImage(f);
            e.target.value = '';
          }}
        />
        {image && (
          <div className="thumb">
            <img src={image.previewUrl} alt="Screenshot to check" />
            <button className="link" onClick={() => setImage(null)} disabled={!!busy}>Remove</button>
          </div>
        )}
      </div>
      {imgError && <p className="error">{imgError}</p>}

      <button className="btn btn-primary btn-huge" disabled={!canCheck} onClick={() => onCheck({ text, image: image?.input })}>
        {busy ? STAGE_TEXT[busy] : 'Check it'}
      </button>
      {busy && <div className="progress" aria-hidden="true"><div /></div>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="samples">
        <p className="muted">Or try an example:</p>
        <div className="row wrap gap-sm">
          {SAMPLES.map((s) => (
            <button key={s.label} className="chip" onClick={() => setText(s.text)} disabled={!!busy}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
