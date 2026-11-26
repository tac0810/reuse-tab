import { findExisting, planMerge, countDuplicates } from "./dedupe.js";
import { urlKey } from "./url-key.js";

// 起動直後のセッション復元で作られるタブは対象外にする
const STARTUP_GRACE_MS = 10_000;
let startupAt = 0;

// 新規作成され、まだ最初の http(s) 遷移を終えていないタブ。
// イベントがほぼ同時に届くため、await を挟まず同期的に更新する。
const fresh = new Set();

const inStartupGrace = () => Date.now() - startupAt < STARTUP_GRACE_MS;

function markFresh(tabId) {
  if (inStartupGrace()) return false;
  fresh.add(tabId);
  return true;
}

chrome.runtime.onStartup.addListener(() => {
  startupAt = Date.now();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (markFresh(tab.id) && tab.pendingUrl) handle(tab.id, tab.pendingUrl);
  updateBadge();
});

// ページ内のリンク（target=_blank、Cmd/Ctrl+クリック、window.open）から作られたタブ
chrome.webNavigation.onCreatedNavigationTarget.addListener(({ tabId, url }) => {
  if (markFresh(tabId)) handle(tabId, url);
});

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) handle(tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  fresh.delete(tabId);
  updateBadge();
});

chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url) updateBadge();
});

async function handle(tabId, url) {
  // 新規タブページなど対象外の URL は最初の http(s) 遷移まで待つ
  if (!urlKey(url) || !fresh.has(tabId)) return;
  fresh.delete(tabId); // 同じタブを二重に処理しない

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
}

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
