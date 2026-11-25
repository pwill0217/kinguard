// The hybrid pipeline: read -> redact (device) -> triage (device, cloud fallback)
// -> route by policy -> deep check (cloud, redacted only) -> re-hydrate (device).
import type { RoutingPolicy } from '../config';
import { inspectLinks } from '../local/links';
import { describeCounts, Redactor, rehydrateDeep } from '../local/redact';
import { screenWithRules } from '../local/rules';
import type { DeviceStatus, Engine, ImageInput } from './engine';
import type { CheckResult, DeepCheck, LedgerEntry, Triage, Verdict, Where } from './types';

export type Stage = 'reading' | 'redacting' | 'screening' | 'deep' | 'done';

export interface CheckInput {
  text: string;
  image?: ImageInput;
  /** User explicitly agreed to send the screenshot to the cloud (only asked when on-device is unavailable). */
  allowCloudImage?: boolean;
  /** User asked for a cloud double-check even if the first pass looked safe. */
  forceDeep?: boolean;
}

export interface Env {
  online: boolean;
  device: DeviceStatus;
}

export class NeedsImageConsentError extends Error {
  constructor() {
    super('This device cannot read images privately. Ask before sending the screenshot to the cloud.');
  }
}

export class NothingToCheckError extends Error {
  constructor() {
    super('Paste a message or add a screenshot first.');
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function runCheck(
  input: CheckInput,
  engine: Engine,
  policy: RoutingPolicy,
  env: Env,
  onStage: (s: Stage) => void = () => {},
): Promise<CheckResult> {
  const ledger: LedgerEntry[] = [];
  const deviceReady = env.device === 'available';
  let text = input.text.trim();

  // 1. Screenshots are read locally whenever possible.
  if (input.image) {
    onStage('reading');
    const t0 = now();
    if (deviceReady) {
      const reading = await engine.readScreenshot(input.image, 'device');
      ledger.push({ step: 'Read your screenshot', where: 'device', note: 'The image never left this device.', ms: now() - t0 });
      text = [text, reading.transcript].filter(Boolean).join('\n\n');
    } else if (env.online && input.allowCloudImage) {
      const reading = await engine.readScreenshot(input.image, 'cloud');
      ledger.push({ step: 'Read your screenshot', where: 'cloud', sent: '(the screenshot image, with your permission)', ms: now() - t0 });
      text = [text, reading.transcript].filter(Boolean).join('\n\n');
    } else if (env.online) {
      throw new NeedsImageConsentError();
    } else {
      throw new Error('Reading screenshots needs either private on-device AI or an internet connection.');
    }
  }
  if (!text) throw new NothingToCheckError();
  const truncated = text.length > policy.maxInputChars;
  if (truncated) text = text.slice(0, policy.maxInputChars);

  // 2. Hide personal details before anything can reach the cloud.
  onStage('redacting');
  const t1 = now();
  const redactor = new Redactor();
  let redacted = redactor.redactPatterns(text);
  let piiNote = 'Pattern check (phone numbers, emails, card and account numbers).';
  if (deviceReady) {
    try {
      const spans = await engine.findPii(text);
      redacted = redactor.redactSpans(redacted, spans as never);
      piiNote = 'Pattern check plus on-device AI scan for names and addresses.';
    } catch {
      piiNote += ' On-device name scan was unavailable this time.';
    }
  }
  const redaction = redactor.result(redacted);
  const piiSummary = describeCounts(redaction.counts);
  ledger.push({ step: `Hid personal details: ${piiSummary}`, where: 'device', note: piiNote, ms: now() - t1 });

  const links = inspectLinks(text);
  const linkSignals = links.flatMap((l) => l.signals.map((s) => `${l.host}: ${s}`));
  if (links.length) {
    ledger.push({
      step: `Checked ${links.length} link${links.length > 1 ? 's' : ''}`,
      where: 'device',
      note: linkSignals.length ? `${linkSignals.length} warning sign(s) found.` : 'No link warning signs.',
    });
  }

  // 3. First-pass screen: Gemini Nano on-device, cloud fallback, rules as a last resort.
  onStage('screening');
  let triage: Triage & { where: Where };
  const t2 = now();
  if (deviceReady || env.online) {
    try {
      const r = await engine.triage(redaction.text, linkSignals);
      triage = { ...r.data, where: r.where };
      ledger.push({
        step: 'First-pass scam screen',
        where: r.where,
        sent: r.where === 'cloud' ? redaction.text : undefined,
        note: r.where === 'device' ? 'Gemini Nano, on this device. Free and private.' : 'Private AI is not available here, so the redacted text was screened in the cloud.',
        ms: now() - t2,
      });
    } catch (e) {
      triage = rulesTriage(text, linkSignals);
      ledger.push({ step: 'First-pass scam screen', where: 'rules', note: `AI screen failed (${(e as Error).message}); used built-in rules.` });
    }
  } else {
    triage = rulesTriage(text, linkSignals);
    ledger.push({ step: 'First-pass scam screen', where: 'rules', note: 'Offline with no on-device AI: used built-in rules.' });
  }

  // 4. Route by policy (tunable in Remote Config).
  const wantsDeep =
    input.forceDeep ||
    triage.riskScore >= policy.deepCheckThreshold ||
    (policy.escalateLowConfidence && triage.confidence === 'low' && triage.riskScore >= 15) ||
    triage.where === 'rules';
  let deep: DeepCheck | undefined;
  let deepPending: CheckResult['deepPending'] = null;
  if (wantsDeep && env.online) {
    onStage('deep');
    const t3 = now();
    try {
      deep = await engine.deepCheck(redaction.text, triage, linkSignals);
      ledger.push({ step: 'Expert double-check', where: 'cloud', sent: redaction.text, note: `Escalated: first-pass risk ${triage.riskScore}/100 (threshold ${policy.deepCheckThreshold}).`, ms: now() - t3 });
    } catch (e) {
      deepPending = 'error';
      ledger.push({ step: 'Expert double-check', where: 'cloud', note: `Could not reach the cloud (${(e as Error).message}).` });
    }
  } else if (wantsDeep) {
    deepPending = 'offline';
    ledger.push({ step: 'Expert double-check', where: 'cloud', note: 'You are offline. It will run when you reconnect.' });
  } else {
    deepPending = 'below_threshold';
  }

  onStage('done');
  return assemble({ text, redacted: redaction.text, map: redaction.map, piiSummary, hadImage: !!input.image, links, triage, deep, deepPending, ledger, truncated });
}

/** Finish a deep check that was postponed (offline) or requested afterwards. */
export async function completeDeepCheck(prev: CheckResult, engine: Engine, policy: RoutingPolicy): Promise<CheckResult> {
  const linkSignals = prev.links.flatMap((l) => l.signals.map((s) => `${l.host}: ${s}`));
  const t = now();
  const deep = await engine.deepCheck(prev.redacted, prev.triage, linkSignals);
  const ledger = [
    ...prev.ledger.filter((e) => !(e.step === 'Expert double-check' && !e.sent)),
    { step: 'Expert double-check', where: 'cloud' as Where, sent: prev.redacted, note: `Requested after first pass (threshold ${policy.deepCheckThreshold}).`, ms: now() - t },
  ];
  return assemble({ ...prev, text: prev.original, map: prev.piiMap, deep, deepPending: null, ledger, truncated: false });
}

function rulesTriage(text: string, linkSignals: string[]): Triage & { where: Where } {
  const r = screenWithRules(text, linkSignals.map((s) => s.split(': ').slice(1).join(': ')));
  return {
    ...r,
    confidence: 'low',
    summary: r.redFlags.length ? `Found ${r.redFlags.length} common scam warning sign(s).` : 'No common scam warning signs found.',
    where: 'rules',
  };
}

const DEFAULT_STEPS: Record<Verdict, string[]> = {
  likely_scam: [
    'Do not reply, click links, or call any number in the message.',
    'Never pay with gift cards, wire transfers, or crypto.',
    'Do not share codes, passwords, or account numbers.',
    'Talk to someone you trust before doing anything.',
  ],
  suspicious: [
    'Slow down. Real companies give you time.',
    'Do not use the links or phone numbers in the message.',
    'Contact the company using a number you already know.',
  ],
  safe: ['No action needed. If anything feels off later, check again.'],
};
const HEADLINE: Record<Verdict, string> = {
  likely_scam: 'This looks like a scam',
  suspicious: 'Be careful with this one',
  safe: 'This looks safe',
};

function assemble(a: {
  text: string;
  redacted: string;
  map: Record<string, string>;
  piiSummary: string;
  hadImage: boolean;
  links: { host: string; signals: string[] }[];
  triage: Triage & { where: Where };
  deep?: DeepCheck;
  deepPending: CheckResult['deepPending'];
  ledger: LedgerEntry[];
  truncated: boolean;
  id?: string;
  createdAt?: number;
}): CheckResult {
  const t = a.triage;
  const base = a.deep
    ? { ...a.deep }
    : {
        riskScore: t.riskScore,
        verdict: t.verdict,
        category: t.category,
        headline: HEADLINE[t.verdict],
        explanation: t.summary,
        redFlags: t.redFlags.map((signal) => ({ signal, why: '' })),
        whatToDo: DEFAULT_STEPS[t.verdict],
        howToVerify: t.verdict === 'safe' ? '' : 'Look up the official phone number or website yourself (on a bill, card, or the company\'s real site) and contact them directly.',
      };
  if (!base.whatToDo.length) base.whatToDo = DEFAULT_STEPS[base.verdict];
  if (a.truncated) base.explanation += ' (Only the first part of a very long message was checked.)';
  return {
    id: a.id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
    createdAt: a.createdAt ?? Date.now(),
    original: a.text,
    redacted: a.redacted,
    piiMap: a.map,
    piiSummary: a.piiSummary,
    hadImage: a.hadImage,
    links: a.links.map((l) => ({ host: l.host, signals: l.signals })),
    triage: t,
    deep: a.deep,
    final: rehydrateDeep(base, a.map),
    shareable: { verdict: base.verdict, riskScore: base.riskScore, category: base.category, headline: base.headline, explanation: base.explanation },
    deepPending: a.deepPending,
    ledger: a.ledger,
  };
}
