import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '../src/config';
import type { DeviceStatus, Engine, ImageInput } from '../src/ai/engine';
import { completeDeepCheck, NeedsImageConsentError, runCheck } from '../src/ai/pipeline';
import type { DeepCheck, Triage } from '../src/ai/types';
import { normalizeTriage, parseJson } from '../src/ai/parse';

const SCAM = "Grandma it's me Jake. Lawyer Daniel Brooks will call from 415-555-0182. Don't tell Mom, pay bail with gift cards.";

/** Records exactly what each model was given so we can assert on privacy. */
class SpyEngine implements Engine {
  calls: { fn: string; input: string; where?: string }[] = [];
  constructor(private status: DeviceStatus, private triageScore = 85, private triageWhere: 'device' | 'cloud' = 'device') {}
  async deviceStatus() { return this.status; }
  async prepareDevice() {}
  async findPii(raw: string) {
    this.calls.push({ fn: 'findPii', input: raw, where: 'device' });
    return [{ text: 'Daniel Brooks', type: 'PERSON' as const }, { text: 'Jake', type: 'PERSON' as const }];
  }
  async readScreenshot(_img: ImageInput, where: 'device' | 'cloud') {
    this.calls.push({ fn: 'readScreenshot', input: '<image>', where });
    return { transcript: 'Call 415-555-0182 now', kind: 'sms' as const };
  }
  async triage(text: string) {
    this.calls.push({ fn: 'triage', input: text, where: this.triageWhere });
    const data: Triage = { riskScore: this.triageScore, verdict: this.triageScore > 60 ? 'likely_scam' : 'safe', category: 'family_emergency', confidence: 'high', redFlags: ['Asks for gift cards'], summary: 'Scam.' };
    return { data, where: this.triageWhere };
  }
  async deepCheck(text: string): Promise<DeepCheck> {
    this.calls.push({ fn: 'deepCheck', input: text, where: 'cloud' });
    return { riskScore: 95, verdict: 'likely_scam', category: 'family_emergency', headline: 'Fake grandchild emergency', explanation: 'Do not call [PHONE_1]. [PERSON_1] is not a real lawyer.', redFlags: [], whatToDo: ['Hang up'], howToVerify: 'Call your grandson directly.' };
  }
}

const img: ImageInput = { mimeType: 'image/png', base64: 'AAAA' };

describe('hybrid pipeline privacy guarantees', () => {
  it('never sends raw personal details to any non-device step', async () => {
    const e = new SpyEngine('available');
    const r = await runCheck({ text: SCAM }, e, DEFAULT_POLICY, { online: true, device: 'available' });
    const leaving = e.calls.filter((c) => c.where === 'cloud' || c.fn === 'triage');
    for (const c of leaving) {
      expect(c.input).not.toContain('415-555-0182');
      expect(c.input).not.toContain('Daniel Brooks');
      expect(c.input).not.toContain('Jake');
    }
    // The raw text only reached the on-device PII scanner.
    expect(e.calls.find((c) => c.fn === 'findPii')?.input).toContain('Daniel Brooks');
    // The ledger shows exactly what was sent, and it is redacted.
    for (const l of r.ledger.filter((l) => l.sent)) expect(l.sent).not.toContain('415-555-0182');
  });

  it('re-hydrates the cloud answer on the device, but keeps the shareable version redacted', async () => {
    const e = new SpyEngine('available');
    const r = await runCheck({ text: SCAM }, e, DEFAULT_POLICY, { online: true, device: 'available' });
    expect(r.deep).toBeDefined();
    expect(r.final.explanation).toContain('415-555-0182');
    expect(r.final.explanation).toContain('Daniel Brooks');
    expect(r.shareable.explanation).not.toContain('415-555-0182');
    expect(r.shareable.explanation).toContain('[PHONE_1]');
  });

  it('skips the cloud deep check below the Remote Config threshold', async () => {
    const e = new SpyEngine('available', 10);
    const r = await runCheck({ text: 'See you at lunch Thursday!' }, e, DEFAULT_POLICY, { online: true, device: 'available' });
    expect(e.calls.some((c) => c.fn === 'deepCheck')).toBe(false);
    expect(r.deepPending).toBe('below_threshold');
    expect(r.ledger.some((l) => l.sent)).toBe(false);
  });

  it('respects a stricter threshold from Remote Config', async () => {
    const e = new SpyEngine('available', 50);
    await runCheck({ text: SCAM }, e, { ...DEFAULT_POLICY, deepCheckThreshold: 60 }, { online: true, device: 'available' });
    expect(e.calls.some((c) => c.fn === 'deepCheck')).toBe(false);
  });

  it('works offline on-device and postpones the deep check, then completes it', async () => {
    const e = new SpyEngine('available');
    const r = await runCheck({ text: SCAM }, e, DEFAULT_POLICY, { online: false, device: 'available' });
    expect(r.deepPending).toBe('offline');
    expect(r.triage.where).toBe('device');
    const done = await completeDeepCheck(r, e, DEFAULT_POLICY);
    expect(done.deepPending).toBeNull();
    expect(done.final.headline).toBe('Fake grandchild emergency');
    expect(done.final.explanation).toContain('415-555-0182');
  });

  it('without on-device AI: skips the model PII scan and still only sends redacted text', async () => {
    const e = new SpyEngine('unavailable', 85, 'cloud');
    const r = await runCheck({ text: SCAM }, e, DEFAULT_POLICY, { online: true, device: 'unavailable' });
    expect(e.calls.some((c) => c.fn === 'findPii')).toBe(false);
    expect(r.triage.where).toBe('cloud');
    for (const c of e.calls) expect(c.input).not.toContain('415-555-0182');
  });

  it('falls back to rules when nothing is available', async () => {
    const e = new SpyEngine('unavailable');
    const r = await runCheck({ text: SCAM }, e, DEFAULT_POLICY, { online: false, device: 'unavailable' });
    expect(r.triage.where).toBe('rules');
    expect(r.final.verdict).toBe('likely_scam');
    expect(e.calls).toHaveLength(0);
  });

  it('reads screenshots on-device, and asks consent before using the cloud', async () => {
    const dev = new SpyEngine('available');
    await runCheck({ text: '', image: img }, dev, DEFAULT_POLICY, { online: true, device: 'available' });
    expect(dev.calls.find((c) => c.fn === 'readScreenshot')?.where).toBe('device');

    const noDev = new SpyEngine('unavailable', 85, 'cloud');
    await expect(runCheck({ text: '', image: img }, noDev, DEFAULT_POLICY, { online: true, device: 'unavailable' })).rejects.toBeInstanceOf(NeedsImageConsentError);
    const r = await runCheck({ text: '', image: img, allowCloudImage: true }, noDev, DEFAULT_POLICY, { online: true, device: 'unavailable' });
    expect(r.ledger[0]).toMatchObject({ where: 'cloud', step: 'Read your screenshot' });
  });
});

describe('model output parsing', () => {
  it('parses fenced JSON and normalizes out-of-range values', () => {
    const t = normalizeTriage(parseJson('```json\n{"riskScore": 140, "verdict": "safe", "category": "bogus", "redFlags": ["a", 3, ""], "summary": "x"}\n```'));
    expect(t.riskScore).toBe(100);
    expect(t.verdict).toBe('likely_scam'); // verdict made consistent with score
    expect(t.category).toBe('other');
    expect(t.redFlags).toEqual(['a']);
  });
});

import { isTransient } from '../src/ai/engine';
describe('cloud resilience', () => {
  it('treats overload errors as transient but not auth errors', () => {
    expect(isTransient(new Error('[500 ] This model is currently experiencing high demand.'))).toBe(true);
    expect(isTransient(new Error('[429 ] Resource exhausted'))).toBe(true);
    expect(isTransient(new Error('[401 ] Firebase App Check token is invalid.'))).toBe(false);
  });
});
