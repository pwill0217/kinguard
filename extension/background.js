// Kinguard extension: hands selected text (or the page's text) to the Kinguard web app,
// where Firebase AI Logic runs. Text is passed through extension storage and a
// same-origin postMessage bridge, never through a URL.
const DEFAULT_APP_URL = 'https://kinguard-3e9fb.web.app/';
const MAX_CHARS = 8000;
const FRESH_MS = 2 * 60 * 1000;

async function appUrl() {
  const { appUrl } = await chrome.storage.sync.get('appUrl');
  return appUrl || DEFAULT_APP_URL;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'kg-selection', title: 'Check with Kinguard', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'kg-page', title: 'Check this page with Kinguard', contexts: ['page'] });
});

async function pageText(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (max) => {
        const sel = String(window.getSelection() || '').trim();
        if (sel) return sel.slice(0, max);
        const main = document.querySelector('main, article, [role="main"]') || document.body;
        return `${document.title}\n${location.hostname}\n\n${main.innerText}`.slice(0, max);
      },
      args: [MAX_CHARS],
    });
    return res?.result || '';
  } catch {
    return '';
  }
}

async function handOff(text) {
  const clean = String(text || '').trim().slice(0, MAX_CHARS);
  if (!clean) return;
  const url = await appUrl();
  await chrome.storage.session.set({ pending: { text: clean, origin: new URL(url).origin, at: Date.now() } });
  await chrome.tabs.create({ url });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'kg-selection') return handOff(info.selectionText);
  if (info.menuItemId === 'kg-page' && tab?.id) return handOff(await pageText(tab.id));
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) handOff(await pageText(tab.id));
});

// The bridge content script asks for the pending text. Only the configured
// Kinguard origin can receive it, and only once.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'kinguard:pull') return;
  (async () => {
    const { pending } = await chrome.storage.session.get('pending');
    const senderOrigin = sender.origin || (sender.url ? new URL(sender.url).origin : '');
    if (pending && pending.origin === senderOrigin && Date.now() - pending.at < FRESH_MS) {
      await chrome.storage.session.remove('pending');
      sendResponse({ text: pending.text });
    } else {
      sendResponse({ text: null });
    }
  })();
  return true;
});
