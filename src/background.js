import { findExisting, planMerge, countDuplicates } from "./dedupe.js";
import { urlKey } from "./url-key.js";

// 起動直後のセッション復元で作られるタブは対象外にする
const STARTUP_GRACE_MS = 10_000;
const FRESH_KEY = "freshTabs";
const STARTUP_KEY = "startupAt";

async function getFresh() {
  const { [FRESH_KEY]: ids = [] } = await chrome.storage.session.get(FRESH_KEY);
  return new Set(ids);
}

async function setFresh(set) {
  await chrome.storage.session.set({ [FRESH_KEY]: [...set] });
}

async function inStartupGrace() {
  const { [STARTUP_KEY]: at = 0 } = await chrome.storage.session.get(STARTUP_KEY);
  return Date.now() - at < STARTUP_GRACE_MS;
}

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.session.set({ [STARTUP_KEY]: Date.now() });
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (await inStartupGrace()) return;
  const fresh = await getFresh();
  fresh.add(tab.id);
  await setFresh(fresh);
  updateBadge();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const fresh = await getFresh();
  if (fresh.delete(tabId)) await setFresh(fresh);
  updateBadge();
});

chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url) updateBadge();
});

chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  // 新規タブページなど対象外の URL は最初の http(s) 遷移まで待つ
  if (!urlKey(url)) return;
  const fresh = await getFresh();
  if (!fresh.has(tabId)) return;
  fresh.delete(tabId);
  await setFresh(fresh);

  let newTab;
  try {
    newTab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  const tabs = await chrome.tabs.query({});
  const existing = findExisting(tabs, newTab, url);
  if (!existing) return;

  if (existing.url === url) {
    await chrome.tabs.reload(existing.id);
    await chrome.tabs.update(existing.id, { active: true });
  } else {
    await chrome.tabs.update(existing.id, { url, active: true });
  }
  await chrome.windows.update(existing.windowId, { focused: true });
  await chrome.tabs.remove(tabId);
});

// アイコンクリックで既存の重複タブを統合
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  const ids = planMerge(tabs);
  if (ids.length) await chrome.tabs.remove(ids);
  updateBadge();
});

async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const n = countDuplicates(tabs);
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
}

updateBadge();
