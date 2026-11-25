// Last-resort, rules-only screening. Used when neither the on-device model nor the
// cloud is reachable (e.g. an old phone in airplane mode), so the user is never left with nothing.
import type { Category, Verdict } from '../ai/types';

interface Rule {
  re: RegExp;
  weight: number;
  flag: string;
  category?: Category;
}

const RULES: Rule[] = [
  { re: /gift ?cards?|itunes card|google play card|steam card/i, weight: 35, flag: 'Asks for payment with gift cards', category: 'invoice_payment' },
  { re: /bitcoin|crypto|usdt|btc atm|wallet address/i, weight: 25, flag: 'Mentions cryptocurrency payments', category: 'investment_crypto' },
  { re: /wire transfer|western union|moneygram|zelle|cash app|venmo/i, weight: 15, flag: 'Asks for hard-to-reverse money transfers' },
  { re: /\b(urgent|immediately|right away|within (24|48) hours|act now|final notice|last chance)\b/i, weight: 15, flag: 'Creates urgency or a deadline' },
  { re: /don'?t tell|keep (this|it) (a )?secret|between us|don'?t call/i, weight: 30, flag: 'Asks you to keep it secret', category: 'family_emergency' },
  { re: /\b(grandma|grandpa|nana|it'?s me)\b.*\b(jail|arrest|bail|accident|hospital|lawyer)\b|\b(jail|bail|arrested)\b/i, weight: 30, flag: 'Family-emergency story (jail, bail, accident)', category: 'family_emergency' },
  { re: /\b(irs|social security|ssa|medicare|tax(es)? owed|warrant)\b/i, weight: 20, flag: 'Claims to be a government agency', category: 'impersonation_government' },
  { re: /(account|card) (has been |was )?(locked|suspended|compromised|frozen)|unusual (sign-?in|activity)/i, weight: 20, flag: 'Says your account is locked or compromised', category: 'impersonation_bank' },
  { re: /virus|infected|microsoft support|tech(nical)? support|remote access|anydesk|teamviewer/i, weight: 25, flag: 'Tech-support or remote-access request', category: 'tech_support' },
  { re: /you('ve| have)? won|lottery|sweepstakes|prize|claim your reward/i, weight: 25, flag: 'Unexpected prize or winnings', category: 'prize_lottery' },
  { re: /package|parcel|delivery|redeliver|shipping fee|customs fee/i, weight: 10, flag: 'Delivery or shipping problem', category: 'delivery' },
  { re: /verification code|one[- ]time (pass)?code|otp|read (me|back) the code/i, weight: 25, flag: 'Asks for a verification code', category: 'phishing_link' },
  { re: /(verify|confirm|update) your (account|identity|information|payment)/i, weight: 20, flag: 'Asks you to verify personal or payment details', category: 'phishing_link' },
  { re: /guaranteed (returns?|profit)|double your money|investment opportunity/i, weight: 25, flag: 'Promises guaranteed returns', category: 'investment_crypto' },
  { re: /work from home|easy money|hiring.*\$\d+.*(day|hour)/i, weight: 15, flag: 'Too-good-to-be-true job offer', category: 'job_offer' },
  { re: /(my (love|darling|dear))|soul ?mate|stuck overseas|military deployment/i, weight: 15, flag: 'Romance or overseas-stranger story', category: 'romance' },
];

export interface RulesResult {
  riskScore: number;
  verdict: Verdict;
  category: Category;
  redFlags: string[];
}

export function verdictFor(score: number): Verdict {
  return score >= 60 ? 'likely_scam' : score >= 30 ? 'suspicious' : 'safe';
}

export function screenWithRules(text: string, linkSignals: string[] = []): RulesResult {
  let score = 0;
  const flags: string[] = [];
  const catScore = new Map<Category, number>();
  for (const r of RULES) {
    if (r.re.test(text)) {
      score += r.weight;
      flags.push(r.flag);
      if (r.category) catScore.set(r.category, (catScore.get(r.category) ?? 0) + r.weight);
    }
  }
  if (linkSignals.length) {
    score += Math.min(30, linkSignals.length * 12);
    flags.push(...linkSignals.slice(0, 2));
    catScore.set('phishing_link', (catScore.get('phishing_link') ?? 0) + 15);
  }
  score = Math.min(100, score);
  const category = [...catScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (score ? 'other' : 'none');
  return { riskScore: score, verdict: verdictFor(score), category, redFlags: flags.slice(0, 6) };
}
