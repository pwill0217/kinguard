// Check history lives only on this device.
import type { CheckResult } from '../ai/types';

const KEY = 'kinguard.history';
const MAX = 50;

export function loadHistory(): CheckResult[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CheckResult[];
  } catch {
    return [];
  }
}

export function saveToHistory(r: CheckResult): CheckResult[] {
  const list = [r, ...loadHistory().filter((x) => x.id !== r.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota or private mode */
  }
  return list;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
