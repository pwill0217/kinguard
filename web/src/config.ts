// Routing policy, tunable live from Firebase Remote Config without shipping a new build.
import { fetchAndActivate, getValue } from 'firebase/remote-config';
import type { RemoteConfig } from 'firebase/remote-config';

export interface RoutingPolicy {
  /** Risk score (0-100) from on-device triage at or above which we escalate to the cloud deep check. */
  deepCheckThreshold: number;
  /** Risk score at or above which the family circle is alerted. */
  familyAlertThreshold: number;
  /** Cloud model for the hybrid triage fallback (cheap, fast). */
  hybridCloudModel: string;
  /** Stronger cloud model for the deep check on redacted text. */
  deepCheckModel: string;
  /** Escalate low-confidence on-device verdicts even when below the threshold. */
  escalateLowConfidence: boolean;
  /** Max characters analysed per check (keeps on-device prompts under the token cap). */
  maxInputChars: number;
}

export const DEFAULT_POLICY: RoutingPolicy = {
  deepCheckThreshold: 35,
  familyAlertThreshold: 70,
  hybridCloudModel: 'gemini-3.5-flash-lite',
  deepCheckModel: 'gemini-3.8-flash',
  escalateLowConfidence: true,
  maxInputChars: 6000,
};

const KEYS: Record<keyof RoutingPolicy, string> = {
  deepCheckThreshold: 'deep_check_threshold',
  familyAlertThreshold: 'family_alert_threshold',
  hybridCloudModel: 'hybrid_cloud_model',
  deepCheckModel: 'deep_check_model',
  escalateLowConfidence: 'escalate_low_confidence',
  maxInputChars: 'max_input_chars',
};

export async function loadPolicy(rc: RemoteConfig | null): Promise<RoutingPolicy> {
  if (!rc) return DEFAULT_POLICY;
  rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
  rc.defaultConfig = Object.fromEntries(
    Object.entries(DEFAULT_POLICY).map(([k, v]) => [KEYS[k as keyof RoutingPolicy], v as string | number | boolean]),
  );
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or not yet published: defaults apply.
  }
  return {
    deepCheckThreshold: getValue(rc, KEYS.deepCheckThreshold).asNumber() || DEFAULT_POLICY.deepCheckThreshold,
    familyAlertThreshold: getValue(rc, KEYS.familyAlertThreshold).asNumber() || DEFAULT_POLICY.familyAlertThreshold,
    hybridCloudModel: getValue(rc, KEYS.hybridCloudModel).asString() || DEFAULT_POLICY.hybridCloudModel,
    deepCheckModel: getValue(rc, KEYS.deepCheckModel).asString() || DEFAULT_POLICY.deepCheckModel,
    escalateLowConfidence: getValue(rc, KEYS.escalateLowConfidence).asBoolean(),
    maxInputChars: getValue(rc, KEYS.maxInputChars).asNumber() || DEFAULT_POLICY.maxInputChars,
  };
}
