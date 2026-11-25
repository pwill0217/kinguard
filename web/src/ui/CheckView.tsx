import { useEffect, useRef, useState } from 'react';
import type { ImageInput } from '../ai/engine';
import type { Stage } from '../ai/pipeline';
import { fileToImageInput } from '../local/image';
import { IconImage, IconLock, IconX } from './icons';
import { SAMPLES } from './samples';

export interface CheckRequest {
  text: string;
  image?: ImageInput;
}

const STAGES: { id: Stage; label: string }[] = [
  { id: 'reading', label: 'Reading screenshot' },
  { id: 'redacting', label: 'Hiding your personal details' },
  { id: 'screening', label: 'Looking for scam signs' },
  { id: 'deep', label: 'Expert double-check' },
];

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
  const stageIdx = busy ? STAGES.findIndex((s) => s.id === busy) : -1;

  return (
    <section className="check">
      <header className="page-head">
        <h1>Is this a scam?</h1>
        <p>Paste a text, email or anything you're unsure about.</p>
      </header>

      <div className="card composer">
        <label htmlFor="msg" className="sr-only">Message to check</label>
        <textarea id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the message here…" rows={7} disabled={!!busy} />
        {image && (
          <div className="thumb">
            <img src={image.previewUrl} alt="Screenshot to check" />
            <button className="thumb-x" onClick={() => setImage(null)} disabled={!!busy} aria-label="Remove screenshot"><IconX size={14} /></button>
          </div>
        )}
        <div className="composer-bar">
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <IconImage size={18} /> Screenshot
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
          <span className="fine"><IconLock size={13} /> Personal details are hidden first</span>
        </div>
      </div>
      {imgError && <p className="error">{imgError}</p>}

      <button className="btn btn-primary btn-xl" disabled={!canCheck} onClick={() => onCheck({ text, image: image?.input })}>
        {busy ? 'Checking…' : 'Check it'}
      </button>

      {busy && (
        <ol className="stages" aria-live="polite">
          {STAGES.filter((s) => s.id !== 'reading' || image).map((s) => {
            const i = STAGES.findIndex((x) => x.id === s.id);
            return (
              <li key={s.id} className={i < stageIdx ? 'done' : i === stageIdx ? 'active' : ''}>
                <span className="stage-dot" /> {s.label}
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {!busy && (
        <div className="samples">
          <p className="muted small">Try an example</p>
          <div className="chip-scroll">
            {SAMPLES.map((s) => (
              <button key={s.label} className="chip chip-btn" onClick={() => setText(s.text)}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
