// The Firebase AI Logic engine. Four models, each with a deliberate inference mode:
//
//  piiModel        ONLY_ON_DEVICE    finds names/addresses in the RAW text. Raw text never goes to the cloud.
//  screenshotModel ONLY_ON_DEVICE    reads screenshots locally (a cloud variant is used only with explicit consent).
//  triageModel     PREFER_ON_DEVICE  fast first-pass verdict on REDACTED text; falls back to the cloud automatically.
//  deepModel       ONLY_IN_CLOUD     stronger cloud model, REDACTED text only, invoked by the routing policy.
import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
  type ObjectSchema,
  type LanguageModelCreateOptions,
} from 'firebase/ai';
import type { AI } from 'firebase/ai';
import type { RoutingPolicy } from '../config';
import { deepSchema, piiSchema, screenshotSchema, triageSchema } from './schemas';
import { deepPrompt, piiPrompt, screenshotPrompt, triagePrompt } from './prompts';
import type { DeepCheck, PiiSpan, ScreenshotReading, Triage } from './types';
import { parseJson, normalizeDeep, normalizeTriage } from './parse';

export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface ImageInput {
  mimeType: 'image/jpeg' | 'image/png';
  base64: string;
}

export interface Engine {
  deviceStatus(): Promise<DeviceStatus>;
  prepareDevice(onProgress?: (fraction: number) => void): Promise<void>;
  findPii(rawText: string): Promise<PiiSpan[]>;
  readScreenshot(image: ImageInput, where: 'device' | 'cloud'): Promise<ScreenshotReading>;
  triage(redactedText: string, linkSignals: string[]): Promise<{ data: Triage; where: 'device' | 'cloud' }>;
  deepCheck(redactedText: string, triage: Triage & { where: string }, linkSignals: string[]): Promise<DeepCheck>;
}

/** Must match on every model so availability checks and sessions agree. */
export const DEVICE_CREATE_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [
    { type: 'text', languages: ['en'] },
    { type: 'image' },
  ],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

type LanguageModelGlobal = {
  availability(options?: unknown): Promise<string>;
};

export async function chromeDeviceStatus(): Promise<DeviceStatus> {
  const lm = (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
  if (!lm) return 'unavailable';
  try {
    const a = await lm.availability(DEVICE_CREATE_OPTIONS);
    return (['available', 'downloadable', 'downloading'].includes(a) ? a : 'unavailable') as DeviceStatus;
  } catch {
    return 'unavailable';
  }
}

function jsonParams(schema: ObjectSchema, mode: InferenceMode, cloudModel: string, temperature = 0.2) {
  return {
    mode,
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
    },
    onDeviceParams: {
      createOptions: DEVICE_CREATE_OPTIONS,
      promptOptions: { responseConstraint: schema },
    },
  };
}

export class FirebaseEngine implements Engine {
  private piiModel: GenerativeModel;
  private screenshotModel: GenerativeModel;
  private screenshotCloudModel: GenerativeModel;
  private triageModel: GenerativeModel;
  private deepModel: GenerativeModel;

  constructor(ai: AI, policy: RoutingPolicy) {
    this.piiModel = getGenerativeModel(ai, jsonParams(piiSchema, InferenceMode.ONLY_ON_DEVICE, policy.hybridCloudModel, 0));
    this.screenshotModel = getGenerativeModel(ai, jsonParams(screenshotSchema, InferenceMode.ONLY_ON_DEVICE, policy.hybridCloudModel, 0));
    this.screenshotCloudModel = getGenerativeModel(ai, jsonParams(screenshotSchema, InferenceMode.ONLY_IN_CLOUD, policy.hybridCloudModel, 0));
    this.triageModel = getGenerativeModel(ai, jsonParams(triageSchema, InferenceMode.PREFER_ON_DEVICE, policy.hybridCloudModel));
    this.deepModel = getGenerativeModel(ai, jsonParams(deepSchema, InferenceMode.ONLY_IN_CLOUD, policy.deepCheckModel));
  }

  deviceStatus() {
    return chromeDeviceStatus();
  }

  async prepareDevice(onProgress?: (fraction: number) => void) {
    // Must run from a user gesture. One download serves every on-device model.
    await this.triageModel.initializeDeviceModel(onProgress);
  }

  async findPii(rawText: string): Promise<PiiSpan[]> {
    const res = await this.piiModel.generateContent(piiPrompt(rawText));
    assertSource(res.response.inferenceSource, InferenceSource.ON_DEVICE, 'PII scan');
    const data = parseJson<{ items?: PiiSpan[] }>(res.response.text());
    return Array.isArray(data.items) ? data.items.filter((i) => i && typeof i.text === 'string') : [];
  }

  async readScreenshot(image: ImageInput, where: 'device' | 'cloud'): Promise<ScreenshotReading> {
    const model = where === 'device' ? this.screenshotModel : this.screenshotCloudModel;
    const res = await model.generateContent([
      screenshotPrompt(),
      { type: 'inlineData', inlineData: { mimeType: image.mimeType, data: image.base64 } },
    ]);
    if (where === 'device') assertSource(res.response.inferenceSource, InferenceSource.ON_DEVICE, 'Screenshot reading');
    const data = parseJson<ScreenshotReading>(res.response.text());
    return { transcript: String(data.transcript ?? ''), kind: data.kind ?? 'other' };
  }

  async triage(redactedText: string, linkSignals: string[]) {
    const res = await this.triageModel.generateContent(triagePrompt(redactedText, linkSignals));
    const where = res.response.inferenceSource === InferenceSource.ON_DEVICE ? 'device' : 'cloud';
    return { data: normalizeTriage(parseJson(res.response.text())), where } as const;
  }

  async deepCheck(redactedText: string, triage: Triage & { where: string }, linkSignals: string[]) {
    const res = await this.deepModel.generateContent(deepPrompt(redactedText, triage, linkSignals));
    return normalizeDeep(parseJson(res.response.text()));
  }
}

function assertSource(actual: string | undefined, expected: string, step: string) {
  // Defence in depth: ONLY_ON_DEVICE already throws rather than falling back, but
  // we verify the SDK's reported source before trusting the privacy guarantee.
  if (actual && actual !== expected) throw new Error(`${step} did not run on this device.`);
}
