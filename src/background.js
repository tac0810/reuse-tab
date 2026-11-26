import { findExisting, planMerge, countDuplicates } from "./dedupe.js";
import { urlKey } from "./url-key.js";

// 起動直後のセッション復元で作られるタブは対象外にする
const STARTUP_GRACE_MS = 10_000;
let startupAt = 0;

// 新規作成され、まだ最初の http(s) 遷移を終えていないタブ。
// tabId → 開いた元タブの ID。イベントがほぼ同時に届くため、await を挟まず同期的に更新する。
const fresh = new Map();
// 判定済みのタブ。後から届くイベントで fresh に戻さないために使う。
const handled = new Set();

const inStartupGrace = () => Date.now() - startupAt < STARTUP_GRACE_MS;

function markFresh(tabId, openerTabId) {
  if (inStartupGrace() || handled.has(tabId)) return false;
  fresh.set(tabId, openerTabId ?? fresh.get(tabId));
  return true;
}

chrome.runtime.onStartup.addListener(() => {
  startupAt = Date.now();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (markFresh(tab.id, tab.openerTabId) && tab.pendingUrl) handle(tab.id, tab.pendingUrl);
  updateBadge();
});

// ページ内のリンク（target=_blank、Cmd/Ctrl+クリック、window.open）から作られたタブ
chrome.webNavigation.onCreatedNavigationTarget.addListener(({ tabId, sourceTabId, url }) => {
  if (markFresh(tabId, sourceTabId)) handle(tabId, url);
});

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) handle(tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  fresh.delete(tabId);
  handled.delete(tabId);
  updateBadge();
});

chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url) updateBadge();
});

// 同じ URL のタブが同時に開かれたとき、互いを統合先にして閉じ合わないよう1件ずつ処理する
let queue = Promise.resolve();

function handle(tabId, url) {
  // 新規タブページなど対象外の URL は最初の http(s) 遷移まで待つ
  if (!urlKey(url) || !fresh.has(tabId)) return;
  const openerTabId = fresh.get(tabId);
  fresh.delete(tabId); // 同じタブを二重に処理しない
  handled.add(tabId);
  queue = queue
    .then(() => merge(tabId, url, openerTabId))
    // 処理中にタブが閉じられた場合など。何もしない
    .catch((e) => console.debug("reuse-tab:", e));
}

async function merge(tabId, url, openerTabId) {
  const newTab = await chrome.tabs.get(tabId);
  const tabs = await chrome.tabs.query({});
  const existing = findExisting(tabs, newTab, url, openerTabId ?? newTab.openerTabId);
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
  if (ids.length) await chrome.tabs.remove(ids).catch((e) => console.debug("reuse-tab:", e));
  updateBadge();
});

async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const n = countDuplicates(tabs);
  await chrome.action.setBadgeText({ text: n ? String(n) : "" });
}

updateBadge();
