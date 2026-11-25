// Main-thread controller for the Kokoro voice. Plays streamed chunks gaplessly with
// Web Audio, and falls back to the browser's built-in voice if Kokoro can't load.
import { useSyncExternalStore } from 'react';

export const VOICES = [
  { id: 'af_heart', label: 'Heart', note: 'Warm, American' },
  { id: 'af_bella', label: 'Bella', note: 'Bright, American' },
  { id: 'am_michael', label: 'Michael', note: 'Calm, American' },
  { id: 'bf_emma', label: 'Emma', note: 'Gentle, British' },
] as const;

export type VoiceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface State {
  status: VoiceStatus;
  progress: number;
  speaking: boolean;
  usingFallback: boolean;
  voice: string;
  speed: number;
}

const PREFS = 'kinguard.voice';

function loadPrefs(): { voice: string; speed: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    return { voice: p.voice ?? 'af_heart', speed: p.speed ?? 0.95 };
  } catch {
    return { voice: 'af_heart', speed: 0.95 };
  }
}

class VoiceController {
  private worker: Worker | null = null;
  private ctx: AudioContext | null = null;
  private nextStart = 0;
  private currentId = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private pendingDone = false;
  private listeners = new Set<() => void>();
  state: State = { status: 'idle', progress: 0, speaking: false, usingFallback: false, ...loadPrefs() };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  setVoice(voice: string, speed = this.state.speed) {
    this.set({ voice, speed });
    try {
      localStorage.setItem(PREFS, JSON.stringify({ voice, speed }));
    } catch {
      /* ignore */
    }
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return null;
    }
    this.worker.onmessage = (e) => this.onMessage(e.data);
    this.worker.onerror = () => this.set({ status: 'error' });
    return this.worker;
  }

  /** Start the one-time model download (about 90 MB, cached by the browser afterwards). */
  preload() {
    const w = this.ensureWorker();
    if (!w) return this.set({ status: 'error' });
    if (this.state.status === 'idle' || this.state.status === 'error') {
      this.set({ status: 'loading', progress: 0 });
      w.postMessage({ type: 'load' });
    }
  }

  private onMessage(m: { type: string; id?: number; fraction?: number; samples?: Float32Array; sampleRate?: number; message?: string }) {
    if (m.type === 'progress') this.set({ progress: m.fraction ?? 0 });
    else if (m.type === 'ready') this.set({ status: 'ready', progress: 1 });
    else if (m.type === 'error') this.set({ status: 'error' });
    else if (m.id !== this.currentId) return;
    else if (m.type === 'chunk' && m.samples && m.sampleRate) this.play(m.samples, m.sampleRate);
    else if (m.type === 'done') this.finishWhenDrained();
    else if (m.type === 'speak-error') this.set({ speaking: false, status: 'error' });
  }

  private play(samples: Float32Array, sampleRate: number) {
    const ctx = (this.ctx ??= new AudioContext());
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const start = Math.max(ctx.currentTime + 0.05, this.nextStart);
    src.start(start);
    this.nextStart = start + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.pendingDone && this.sources.size === 0) this.set({ speaking: false });
    };
  }

  private finishWhenDrained() {
    this.pendingDone = true;
    if (this.sources.size === 0) this.set({ speaking: false });
  }

  /** Must be called from a click (browsers only allow audio after a user gesture). */
  async speak(text: string) {
    this.stop();
    const ctx = (this.ctx ??= new AudioContext());
    await ctx.resume();
    const w = this.ensureWorker();
    if (!w || this.state.status === 'error') return this.fallback(text);
    if (this.state.status === 'idle') this.preload();
    this.currentId += 1;
    this.pendingDone = false;
    this.nextStart = 0;
    this.set({ speaking: true, usingFallback: false });
    w.postMessage({ type: 'speak', id: this.currentId, text, voice: this.state.voice, speed: this.state.speed });
  }

  private fallback(text: string) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.state.speed;
    u.onend = () => this.set({ speaking: false });
    speechSynthesis.speak(u);
    this.set({ speaking: true, usingFallback: true });
  }

  stop() {
    if (this.worker) this.worker.postMessage({ type: 'cancel', id: this.currentId });
    this.currentId += 1;
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.set({ speaking: false });
  }
}

export const voice = new VoiceController();

export function useVoice() {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot);
}
