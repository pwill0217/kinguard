import type { RoutingPolicy } from '../config';
import type { DeviceStatus } from '../ai/engine';

export function AboutView({ policy, device }: { policy: RoutingPolicy; device: DeviceStatus }) {
  return (
    <section className="about">
      <div className="card">
        <h1>How Kinguard keeps you safe and private</h1>
        <ol className="pipeline">
          <li>
            <span className="where where-device">On this device</span>
            <div>
              <strong>Read and hide.</strong> Screenshots are read by Gemini Nano on your computer. Phone numbers, emails, card and
              account numbers, names and addresses are swapped for placeholders like <code>[PHONE_1]</code>.
            </div>
          </li>
          <li>
            <span className="where where-device">On this device</span>
            <div>
              <strong>First-pass screen.</strong> Gemini Nano looks for scam warning signs. It's instant, free, and works offline. If
              your device has no on-device AI, the hidden-details version is screened in the cloud instead.
            </div>
          </li>
          <li>
            <span className="where where-cloud">Cloud</span>
            <div>
              <strong>Expert double-check, only when needed.</strong> If the risk is {policy.deepCheckThreshold}/100 or higher, a stronger
              Gemini model reviews the hidden-details version and writes clear next steps.
            </div>
          </li>
          <li>
            <span className="where where-device">On this device</span>
            <div>
              <strong>Put your details back.</strong> The answer is personalised on your screen. The cloud never saw your real details.
            </div>
          </li>
          <li>
            <span className="where where-cloud">Family</span>
            <div>
              <strong>Tell someone you trust.</strong> For high-risk messages ({policy.familyAlertThreshold}+), your family circle gets the
              warning. Never the message itself.
            </div>
          </li>
        </ol>
      </div>

      {device !== 'available' && (
        <div className="card">
          <h2>Turn on private on-device AI (Chrome on a computer)</h2>
          <ol>
            <li>Use Google Chrome 139 or newer on Windows, Mac, Linux or ChromeOS.</li>
            <li>
              Open <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, set it to <strong>Enabled</strong>, and restart
              Chrome.
            </li>
            <li>Come back and press <strong>Turn on private AI</strong> at the top. The one-time download takes a few minutes.</li>
          </ol>
          <p className="muted">Until then, Kinguard still works on any device using the secure cloud, with your details hidden first.</p>
        </div>
      )}

      <div className="card">
        <h2>Built with</h2>
        <p>
          Firebase AI Logic hybrid inference (Gemini Nano on-device, Gemini in the cloud), App Check, Remote Config (live routing
          thresholds), Authentication and Cloud Firestore. Open source under the Apache 2.0 license.
        </p>
      </div>
    </section>
  );
}
