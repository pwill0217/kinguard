import { describe, expect, it } from 'vitest';
import { inspectLinks } from '../src/local/links';
import { screenWithRules } from '../src/local/rules';

describe('link inspection', () => {
  it('flags brand look-alikes, risky TLDs and insecure links', () => {
    const [f] = inspectLinks('Verify at http://amaz0n-account-secure.com/verify');
    expect(f.host).toBe('amaz0n-account-secure.com');
    expect(f.signals.join(' ')).toMatch(/not amazon's real website/i);
    expect(f.signals.join(' ')).toMatch(/https/);
    const [g] = inspectLinks('pay at usps-redelivery-help.top/pay');
    expect(g.signals.join(' ')).toMatch(/\.top/);
  });

  it('trusts genuine brand domains', () => {
    const [f] = inspectLinks('Track it at https://www.amazon.com/orders');
    expect(f.signals).toEqual([]);
  });

  it('flags shorteners and ignores email domains', () => {
    const links = inspectLinks('Mail me at bob@example.com or open https://bit.ly/abc');
    expect(links.map((l) => l.host)).toEqual(['bit.ly']);
    expect(links[0].signals.join(' ')).toMatch(/Shortened/);
  });
});

describe('rules fallback', () => {
  it('scores the grandparent scam as likely scam', () => {
    const r = screenWithRules("Grandma it's me, I got arrested and need bail. Don't tell Mom. Pay with gift cards.");
    expect(r.verdict).toBe('likely_scam');
    expect(r.category).toBe('family_emergency');
  });
  it('scores an ordinary appointment reminder as safe', () => {
    const r = screenWithRules('Reminder: your appointment with Dr. Patel is Thursday at 10:30 AM.');
    expect(r.verdict).toBe('safe');
  });
});
