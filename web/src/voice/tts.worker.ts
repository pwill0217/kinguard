/// <reference lib="webworker" />
// Kokoro-82M text-to-speech, running entirely on the user's device in a worker
// so the page stays responsive. Audio is streamed back sentence by sentence.
import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type InMsg =
  | { type: 'load' }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'cancel'; id: number };

let ttsPromise: Promise<KokoroTTS> | null = null;
let cancelled = new Set<number>();
const fileProgress = new Map<string, { loaded: number; total: number }>();

function load(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          fileProgress.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of fileProgress.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          postMessage({ type: 'progress', fraction: total ? loaded / total : 0 });
        }
      },
    })
      .then((tts) => {
        postMessage({ type: 'ready' });
        return tts;
      })
      .catch((e) => {
        ttsPromise = null;
        postMessage({ type: 'error', message: String((e as Error)?.message ?? e) });
        throw e;
      });
  }
  return ttsPromise;
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    load().catch(() => {});
    return;
  }
  if (msg.type === 'cancel') {
    cancelled.add(msg.id);
    return;
  }
  if (msg.type === 'speak') {
    try {
      const tts = await load();
      for await (const { audio } of tts.stream(msg.text, { voice: msg.voice as never, speed: msg.speed })) {
        if (cancelled.has(msg.id)) break;
        const samples = audio.audio as Float32Array;
        postMessage({ type: 'chunk', id: msg.id, samples, sampleRate: audio.sampling_rate }, { transfer: [samples.buffer] });
      }
      postMessage({ type: 'done', id: msg.id });
    } catch (err) {
      postMessage({ type: 'speak-error', id: msg.id, message: String((err as Error)?.message ?? err) });
    } finally {
      cancelled.delete(msg.id);
      if (cancelled.size > 50) cancelled = new Set();
    }
  }
};
