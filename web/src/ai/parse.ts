import { CATEGORIES, type Category, type Confidence, type DeepCheck, type Triage, type Verdict } from './types';
import { verdictFor } from '../local/rules';

export function parseJson<T = Record<string, unknown>>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('Model returned malformed JSON');
  }
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
const strArr = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x)).filter(Boolean).slice(0, max);

function asVerdict(v: unknown, score: number): Verdict {
  // Keep the verdict consistent with the score: small models sometimes disagree with themselves.
  const fromScore = verdictFor(score);
  return v === 'safe' || v === 'suspicious' || v === 'likely_scam'
    ? (Math.abs(rank(v) - rank(fromScore)) > 1 ? fromScore : v)
    : fromScore;
}
const rank = (v: Verdict) => ({ safe: 0, suspicious: 1, likely_scam: 2 })[v];
const asCategory = (c: unknown): Category => (CATEGORIES.includes(c as Category) ? (c as Category) : 'other');

export function normalizeTriage(raw: Record<string, unknown>): Triage {
  const riskScore = clamp(raw.riskScore);
  const confidence = (['low', 'medium', 'high'].includes(raw.confidence as string) ? raw.confidence : 'medium') as Confidence;
  return {
    riskScore,
    verdict: asVerdict(raw.verdict, riskScore),
    category: riskScore < 20 ? 'none' : asCategory(raw.category),
    confidence,
    redFlags: strArr(raw.redFlags, 5),
    summary: str(raw.summary, 'Checked.'),
  };
}

export function normalizeDeep(raw: Record<string, unknown>): DeepCheck {
  const riskScore = clamp(raw.riskScore);
  const flags = (Array.isArray(raw.redFlags) ? raw.redFlags : [])
    .map((f) => (typeof f === 'string' ? { signal: f, why: '' } : { signal: str((f as Record<string, unknown>)?.signal), why: str((f as Record<string, unknown>)?.why) }))
    .filter((f) => f.signal)
    .slice(0, 6);
  return {
    riskScore,
    verdict: asVerdict(raw.verdict, riskScore),
    category: riskScore < 20 ? 'none' : asCategory(raw.category),
    headline: str(raw.headline, 'Here is what we found'),
    explanation: str(raw.explanation),
    redFlags: flags,
    whatToDo: strArr(raw.whatToDo, 5),
    howToVerify: str(raw.howToVerify),
  };
}
