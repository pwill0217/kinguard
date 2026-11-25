// Runs on candidate Kinguard origins. The background script only releases text
// to the origin the user configured, so other sites get nothing.
(() => {
  let text = null;
  const post = () => text && window.postMessage({ source: 'kinguard-extension', type: 'check', text }, location.origin);
  chrome.runtime.sendMessage({ type: 'kinguard:pull' }, (res) => {
    if (chrome.runtime.lastError) return;
    text = res?.text || null;
    post();
  });
  // If the app mounts after us, it announces itself and we re-send.
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'kinguard-app' && e.data.type === 'ready') post();
  });
})();
