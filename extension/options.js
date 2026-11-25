const input = document.getElementById('url');
const status = document.getElementById('status');
chrome.storage.sync.get('appUrl').then(({ appUrl }) => { input.value = appUrl || 'http://localhost:5173/'; });
document.getElementById('save').addEventListener('click', async () => {
  try {
    const u = new URL(input.value.trim());
    if (!/^https:$|^http:$/.test(u.protocol)) throw new Error();
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error();
    await chrome.storage.sync.set({ appUrl: u.href });
    status.textContent = 'Saved.';
  } catch {
    status.textContent = 'Please enter a valid https:// address.';
  }
});
