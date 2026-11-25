// Deterministic stand-in engine used ONLY by automated tests and UI screenshots
// (enabled with VITE_MOCK_ENGINE=1). Real builds always use FirebaseEngine.
import { screenWithRules } from '../local/rules';
import type { DeviceStatus, Engine } from './engine';
import type { DeepCheck, PiiSpan, Triage } from './types';

export class MockEngine implements Engine {
  constructor(private status: DeviceStatus = 'available') {}
  async deviceStatus() {
    return this.status;
  }
  async prepareDevice() {
    this.status = 'available';
  }
  async findPii(raw: string): Promise<PiiSpan[]> {
    const names = raw.match(/\b(?:Grandma|Grandpa)?\s?[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? [];
    return names.filter((n) => !/^(Dear|Social Security|Amazon|Your )/.test(n)).map((text) => ({ text: text.trim(), type: 'PERSON' }));
  }
  async readScreenshot() {
    return { transcript: 'USPS: Your package is on hold. Pay $1.99 at usps-redelivery.top/pay', kind: 'sms' as const };
  }
  async triage(text: string, linkSignals: string[]) {
    const r = screenWithRules(text, linkSignals);
    const data: Triage = {
      ...r,
      confidence: r.riskScore > 50 ? 'high' : 'medium',
      summary: r.riskScore > 50 ? 'This message has several signs of a scam.' : 'This message looks ordinary.',
    };
    return { data, where: this.status === 'available' ? ('device' as const) : ('cloud' as const) };
  }
  async deepCheck(text: string, triage: Triage): Promise<DeepCheck> {
    const scam = triage.riskScore >= 50;
    return {
      riskScore: Math.max(triage.riskScore, scam ? 92 : 40),
      verdict: scam ? 'likely_scam' : 'suspicious',
      category: triage.category,
      headline: scam ? 'This is almost certainly a scam' : 'Be careful with this message',
      explanation: scam
        ? `Scammers pretend to be someone you trust and push you to act fast. ${text.includes('[PHONE_1]') ? 'Do not call [PHONE_1].' : ''}`.trim()
        : 'Some parts of this message are unusual. Check with the company directly before doing anything.',
      redFlags: triage.redFlags.map((signal) => ({ signal, why: 'Real organizations do not ask for this.' })),
      whatToDo: ['Do not reply or click anything.', 'Call a family member you trust.', 'Block the sender.'],
      howToVerify: 'Call the person or company using a number you already have, not one from the message.',
    };
  }
}
