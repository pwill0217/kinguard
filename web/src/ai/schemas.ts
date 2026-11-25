// Structured-output schemas. The same Schema object is passed to the cloud model
// (responseSchema) and to Gemini Nano (responseConstraint) so both paths return
// identical JSON shapes.
import { Schema } from 'firebase/ai';
import { CATEGORIES } from './types';

const verdict = Schema.enumString({ enum: ['safe', 'suspicious', 'likely_scam'] });
const category = Schema.enumString({ enum: CATEGORIES });

export const triageSchema = Schema.object({
  properties: {
    riskScore: Schema.integer({ description: '0 = clearly safe, 100 = certainly a scam' }),
    verdict,
    category,
    confidence: Schema.enumString({ enum: ['low', 'medium', 'high'] }),
    redFlags: Schema.array({ items: Schema.string(), description: 'Up to 5 short warning signs, plain words' }),
    summary: Schema.string({ description: 'One plain sentence for an older adult' }),
  },
});

export const piiSchema = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          text: Schema.string({ description: 'The exact characters as they appear in the message' }),
          type: Schema.enumString({ enum: ['PERSON', 'ADDRESS', 'ID', 'DOB', 'ACCOUNT', 'OTHER'] }),
        },
      }),
    }),
  },
});

export const screenshotSchema = Schema.object({
  properties: {
    transcript: Schema.string({ description: 'All readable text in the image, in reading order' }),
    kind: Schema.enumString({ enum: ['sms', 'email', 'social', 'webpage', 'letter', 'other'] }),
  },
});

export const deepSchema = Schema.object({
  properties: {
    riskScore: Schema.integer(),
    verdict,
    category,
    headline: Schema.string({ description: 'Max 10 words, e.g. "This is a fake Amazon message"' }),
    explanation: Schema.string({ description: '2-3 short sentences at a 6th-grade reading level' }),
    redFlags: Schema.array({
      items: Schema.object({ properties: { signal: Schema.string(), why: Schema.string() } }),
    }),
    whatToDo: Schema.array({ items: Schema.string(), description: '3-5 concrete next steps' }),
    howToVerify: Schema.string({ description: 'How to check independently, without using contact info from the message' }),
  },
});
