// Deterministic, on-device PII redaction + re-hydration.
// Anything that leaves the device passes through here first.

export type PiiKind =
  | 'EMAIL'
  | 'PHONE'
  | 'CARD'
  | 'SSN'
  | 'ACCOUNT'
  | 'PERSON'
  | 'ADDRESS'
  | 'ID'
  | 'DOB'
  | 'OTHER';

export interface Redaction {
  /** Text safe to send to the cloud. */
  text: string;
  /** placeholder (e.g. "[PHONE_1]") -> original value. Never leaves the device. */
  map: Record<string, string>;
  /** Count per kind, for the privacy ledger. */
  counts: Partial<Record<PiiKind, number>>;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
// 13-19 digits optionally separated by spaces or dashes (validated with Luhn below).
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
// Phone numbers: +1 (555) 123-4567, 555-123-4567, 555.123.4567, +44 20 7946 0958 ...
const PHONE = /(?<![\w$])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}(?!\w)/g;
// Long bare digit runs (account numbers, one-time codes). Not money: no leading $ and no separators.
const ACCOUNT = /(?<![$\d.,])\b\d{6,}\b(?![.,]\d)/g;
// Query strings can carry emails, tokens and tracking IDs: keep the domain/path, drop the query.
const URL_QUERY = /(https?:\/\/[^\s?#]+)\?[^\s#]+/gi;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export class Redactor {
  private map: Record<string, string> = {};
  private reverse = new Map<string, string>();
  private counters: Partial<Record<PiiKind, number>> = {};

  placeholderFor(kind: PiiKind, value: string): string {
    const key = `${kind}:${value.toLowerCase()}`;
    const existing = this.reverse.get(key);
    if (existing) return existing;
    const n = (this.counters[kind] ?? 0) + 1;
    this.counters[kind] = n;
    const ph = `[${kind}_${n}]`;
    this.map[ph] = value;
    this.reverse.set(key, ph);
    return ph;
  }

  /** Regex pass: emails, SSNs, cards, phones, long numbers, URL query strings. */
  redactPatterns(input: string): string {
    let text = input.replace(URL_QUERY, (_m, base: string) => `${base}?[link details removed]`);
    text = text.replace(EMAIL, (m) => this.placeholderFor('EMAIL', m));
    text = text.replace(SSN, (m) => this.placeholderFor('SSN', m));
    text = text.replace(CARD, (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && luhnValid(digits) ? this.placeholderFor('CARD', m) : m;
    });
    text = text.replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 ? this.placeholderFor('PHONE', m.trim()) : m;
    });
    text = text.replace(ACCOUNT, (m) => this.placeholderFor('ACCOUNT', m));
    return text;
  }

  /**
   * Apply spans found by the on-device model (names, street addresses, IDs...).
   * Spans the model invented (not literally present in the text) are ignored.
   */
  redactSpans(text: string, spans: { text: string; type: PiiKind }[]): string {
    const usable = spans
      .map((s) => ({ ...s, text: s.text.trim() }))
      .filter((s) => s.text.length >= 3 && !/^\[[A-Z]+_\d+\]$/.test(s.text) && text.includes(s.text))
      .filter((s) => !COMMON_WORDS.has(s.text.toLowerCase()))
      // Longest first so "Mary Ann Smith" wins over "Mary".
      .sort((a, b) => b.text.length - a.text.length);
    let out = text;
    for (const s of usable) {
      const ph = this.placeholderFor(s.type, s.text);
      out = out.split(s.text).join(ph);
    }
    return out;
  }

  result(text: string): Redaction {
    return { text, map: { ...this.map }, counts: { ...this.counters } };
  }
}

// Words a small model sometimes flags that should stay readable (brands/agencies are scam signals).
const COMMON_WORDS = new Set([
  'irs', 'social security', 'medicare', 'amazon', 'apple', 'microsoft', 'paypal', 'bank', 'police',
  'fbi', 'usps', 'fedex', 'ups', 'dhl', 'walmart', 'google', 'netflix', 'grandma', 'grandpa', 'mom', 'dad',
  'customer', 'sir', 'madam', 'dear',
]);

export function redactPatternsOnly(input: string): Redaction {
  const r = new Redactor();
  return r.result(r.redactPatterns(input));
}

/** Put the user's real details back into cloud output, on the device, for display only. */
export function rehydrate(text: string, map: Record<string, string>): string {
  return text.replace(/\[([A-Z]+_\d+)\]/g, (m) => map[m] ?? m);
}

export function rehydrateDeep<T>(value: T, map: Record<string, string>): T {
  if (typeof value === 'string') return rehydrate(value, map) as T;
  if (Array.isArray(value)) return value.map((v) => rehydrateDeep(v, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rehydrateDeep(v, map)]),
    ) as T;
  }
  return value;
}

export function describeCounts(counts: Partial<Record<PiiKind, number>>): string {
  const labels: Record<PiiKind, string> = {
    EMAIL: 'email address', PHONE: 'phone number', CARD: 'card number', SSN: 'Social Security number',
    ACCOUNT: 'account or code number', PERSON: 'name', ADDRESS: 'address', ID: 'ID number',
    DOB: 'date of birth', OTHER: 'personal detail',
  };
  const parts = Object.entries(counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${n} ${labels[k as PiiKind]}${n! > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'nothing personal found';
}
