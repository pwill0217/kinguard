import { describe, expect, it } from 'vitest';
import { describeCounts, redactPatternsOnly, Redactor, rehydrate, rehydrateDeep } from '../src/local/redact';

describe('pattern redaction', () => {
  it('hides phones, emails, SSNs, valid cards and long numbers but keeps money and brands', () => {
    const input =
      'Call 415-555-0182 or email jake.miller@gmail.com. SSN 123-45-6789. Card 4111 1111 1111 1111. ' +
      'Code 482913. Pay $2,500 to Amazon.';
    const r = redactPatternsOnly(input);
    expect(r.text).not.toContain('415-555-0182');
    expect(r.text).not.toContain('jake.miller@gmail.com');
    expect(r.text).not.toContain('123-45-6789');
    expect(r.text).not.toContain('4111 1111 1111 1111');
    expect(r.text).not.toContain('482913');
    expect(r.text).toContain('$2,500');
    expect(r.text).toContain('Amazon');
    expect(r.text).toContain('[PHONE_1]');
    expect(r.text).toContain('[EMAIL_1]');
    expect(r.counts.CARD).toBe(1);
  });

  it('does not treat a Luhn-invalid digit run as a card', () => {
    const r = redactPatternsOnly('Order 1234 5678 9012 3456 shipped');
    expect(r.counts.CARD).toBeUndefined();
  });

  it('strips URL query strings that can carry personal data, keeps the domain', () => {
    const r = redactPatternsOnly('Go to https://usps-help.top/track?id=MARGARET.HILL@gmail.com now');
    expect(r.text).toContain('https://usps-help.top/track?[link details removed]');
    expect(r.text).not.toContain('MARGARET');
  });

  it('reuses one placeholder for repeated values', () => {
    const r = redactPatternsOnly('Call 415-555-0182. Again: 415-555-0182.');
    expect(r.text.match(/\[PHONE_1\]/g)).toHaveLength(2);
    expect(r.counts.PHONE).toBe(1);
  });
});

describe('model span redaction', () => {
  it('redacts names found by the on-device model, ignores invented and brand spans', () => {
    const red = new Redactor();
    const text = red.redactPatterns('Grandma it is Jake. My lawyer Daniel Brooks will call. Amazon too.');
    const out = red.redactSpans(text, [
      { text: 'Daniel Brooks', type: 'PERSON' },
      { text: 'Jake', type: 'PERSON' },
      { text: 'Nobody Here', type: 'PERSON' },
      { text: 'Amazon', type: 'PERSON' },
    ]);
    expect(out).not.toContain('Daniel Brooks');
    expect(out).not.toContain('Jake');
    expect(out).toContain('Amazon');
    expect(out).toContain('[PERSON_1]');
  });
});

describe('rehydration', () => {
  it('restores originals locally, including nested objects', () => {
    const map = { '[PHONE_1]': '415-555-0182', '[PERSON_1]': 'Daniel Brooks' };
    expect(rehydrate('Do not call [PHONE_1] from [PERSON_1].', map)).toBe('Do not call 415-555-0182 from Daniel Brooks.');
    expect(rehydrateDeep({ a: ['[PHONE_1]'], b: { c: '[PERSON_1]' }, n: 3 }, map)).toEqual({
      a: ['415-555-0182'],
      b: { c: 'Daniel Brooks' },
      n: 3,
    });
    expect(rehydrate('Unknown [CARD_9] stays', map)).toBe('Unknown [CARD_9] stays');
  });

  it('describes counts in plain words', () => {
    expect(describeCounts({ PHONE: 2, PERSON: 1 })).toBe('2 phone numbers, 1 name');
    expect(describeCounts({})).toBe('nothing personal found');
  });
});
