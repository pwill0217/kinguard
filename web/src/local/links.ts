// On-device link inspection. Deterministic signals that feed both models and the UI.

export interface LinkFinding {
  url: string;
  host: string;
  signals: string[];
}

const URLISH = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?)/gi;
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'rb.gy',
  'shorturl.at', 't.ly', 'tiny.cc',
]);
const RISKY_TLDS = new Set([
  'top', 'xyz', 'click', 'zip', 'mov', 'loan', 'work', 'support', 'live', 'rest', 'cam', 'icu', 'buzz',
  'monster', 'gq', 'tk', 'ml', 'cf', 'ga', 'cfd', 'sbs', 'info',
]);
// Brands scammers impersonate -> their real registrable domains.
const BRANDS: Record<string, string[]> = {
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.ca'],
  paypal: ['paypal.com'],
  apple: ['apple.com', 'icloud.com'],
  microsoft: ['microsoft.com', 'live.com', 'outlook.com'],
  netflix: ['netflix.com'],
  usps: ['usps.com'],
  fedex: ['fedex.com'],
  ups: ['ups.com'],
  irs: ['irs.gov'],
  ssa: ['ssa.gov'],
  medicare: ['medicare.gov'],
  chase: ['chase.com'],
  wellsfargo: ['wellsfargo.com'],
  bankofamerica: ['bankofamerica.com'],
  google: ['google.com'],
  facebook: ['facebook.com'],
  walmart: ['walmart.com'],
  coinbase: ['coinbase.com'],
};
const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a' };

function registrable(host: string): string {
  const parts = host.split('.');
  const twoLevel = /^(co|com|org|gov|ac|net)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

export function inspectLinks(text: string): LinkFinding[] {
  const seen = new Set<string>();
  const out: LinkFinding[] = [];
  for (const m of text.matchAll(URLISH)) {
    const raw = m[1].replace(/[.,;:!?]+$/, '');
    // Skip things like "e.g." or file names without a plausible TLD.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (!/\.[a-z]{2,}$/.test(host) || seen.has(host)) continue;
    // Avoid treating email domains as links.
    const idx = m.index ?? 0;
    if (idx > 0 && text[idx - 1] === '@') continue;
    seen.add(host);
    out.push({ url: raw, host, signals: linkSignals(raw, host) });
  }
  return out;
}

export function linkSignals(raw: string, host: string): string[] {
  const s: string[] = [];
  const reg = registrable(host);
  const tld = host.split('.').pop() ?? '';
  if (/^http:\/\//i.test(raw)) s.push('Not a secure (https) link');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) s.push('Link goes to a bare number address instead of a company website');
  if (host.includes('xn--')) s.push('Link uses look-alike foreign letters (punycode)');
  if (SHORTENERS.has(reg)) s.push('Shortened link hides where it really goes');
  if (RISKY_TLDS.has(tld)) s.push(`Website ending ".${tld}" is commonly used by scam sites`);
  if (raw.includes('@')) s.push('Link contains an "@" that can hide the real destination');
  if ((host.match(/-/g) ?? []).length >= 2) s.push('Website name has many hyphens, common in fake sites');
  if (host.split('.').length >= 5) s.push('Unusually long chain of sub-domains');

  const normalized = reg.replace(/[013457@]/g, (c) => LEET[c] ?? c).replace(/-/g, '');
  for (const [brand, real] of Object.entries(BRANDS)) {
    if (real.includes(reg)) return s; // genuine brand domain
    const mentions = host.replace(/-/g, '').includes(brand) || normalized.includes(brand);
    if (mentions) {
      s.push(`Mentions "${brand}" but is not ${brand}'s real website (${real[0]})`);
      break;
    }
  }
  return s;
}
