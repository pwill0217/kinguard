export type Verdict = 'safe' | 'suspicious' | 'likely_scam';
export type Confidence = 'low' | 'medium' | 'high';
export type Category =
  | 'none'
  | 'impersonation_government'
  | 'impersonation_bank'
  | 'tech_support'
  | 'family_emergency'
  | 'romance'
  | 'prize_lottery'
  | 'delivery'
  | 'job_offer'
  | 'investment_crypto'
  | 'phishing_link'
  | 'invoice_payment'
  | 'other';

export const CATEGORIES: Category[] = [
  'none', 'impersonation_government', 'impersonation_bank', 'tech_support', 'family_emergency', 'romance',
  'prize_lottery', 'delivery', 'job_offer', 'investment_crypto', 'phishing_link', 'invoice_payment', 'other',
];

export const CATEGORY_LABEL: Record<Category, string> = {
  none: 'No scam pattern',
  impersonation_government: 'Fake government agency',
  impersonation_bank: 'Fake bank or company alert',
  tech_support: 'Fake tech support',
  family_emergency: 'Family emergency scam',
  romance: 'Romance scam',
  prize_lottery: 'Fake prize or lottery',
  delivery: 'Fake delivery notice',
  job_offer: 'Fake job offer',
  investment_crypto: 'Investment or crypto scam',
  phishing_link: 'Phishing link',
  invoice_payment: 'Fake bill or payment demand',
  other: 'Other warning signs',
};

export type Where = 'device' | 'cloud' | 'rules';

/** Output of the fast first-pass screen (on-device when available). */
export interface Triage {
  riskScore: number;
  verdict: Verdict;
  category: Category;
  confidence: Confidence;
  redFlags: string[];
  summary: string;
}

/** Output of the cloud deep check (runs on redacted text only). */
export interface DeepCheck {
  riskScore: number;
  verdict: Verdict;
  category: Category;
  headline: string;
  explanation: string;
  redFlags: { signal: string; why: string }[];
  whatToDo: string[];
  howToVerify: string;
}

export interface PiiSpan {
  text: string;
  type: 'PERSON' | 'ADDRESS' | 'ID' | 'DOB' | 'ACCOUNT' | 'OTHER';
}

export interface ScreenshotReading {
  transcript: string;
  kind: 'sms' | 'email' | 'social' | 'webpage' | 'letter' | 'other';
}

export interface LedgerEntry {
  step: string;
  where: Where;
  /** Exactly what was sent to the cloud, if anything. */
  sent?: string;
  note?: string;
  ms?: number;
}

export interface CheckResult {
  id: string;
  createdAt: number;
  original: string;
  redacted: string;
  piiSummary: string;
  hadImage: boolean;
  links: { host: string; signals: string[] }[];
  triage: Triage & { where: Where };
  deep?: DeepCheck;
  /** Final verdict shown to the user (deep check wins when present). */
  final: {
    riskScore: number;
    verdict: Verdict;
    category: Category;
    headline: string;
    explanation: string;
    redFlags: { signal: string; why: string }[];
    whatToDo: string[];
    howToVerify: string;
  };
  /** Placeholder -> real value. Stays on this device; used to re-hydrate cloud answers. */
  piiMap: Record<string, string>;
  /** Redacted (placeholder) version of the verdict: the only form ever shared with family. */
  shareable: { verdict: Verdict; riskScore: number; category: Category; headline: string; explanation: string };
  /** Cloud deep check still owed (offline, or user may request one). */
  deepPending: 'offline' | 'below_threshold' | 'error' | null;
  ledger: LedgerEntry[];
}
