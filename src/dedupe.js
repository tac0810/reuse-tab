import { urlKey } from "./url-key.js";

// 優先順位: ピン留め > アクティブ > 最後に使った
function compare(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  if (!!a.active !== !!b.active) return a.active ? -1 : 1;
  return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
}

export function pickKeeper(tabs) {
  return [...tabs].sort(compare)[0];
}

// 新しく開いたタブと同じキーの既存タブを探す。なければ null。
export function findExisting(tabs, newTab, url) {
  const key = urlKey(url);
  if (!key) return null;
  const candidates = tabs.filter(
    (t) =>
      t.id !== newTab.id &&
      !!t.incognito === !!newTab.incognito &&
      urlKey(t.url || t.pendingUrl) === key,
  );
  return candidates.length ? pickKeeper(candidates) : null;
}

// キーごと（シークレットは別扱い）にまとめる
function group(tabs) {
  const groups = new Map();
  for (const t of tabs) {
    const key = urlKey(t.url || t.pendingUrl);
    if (!key) continue;
    const g = `${t.incognito ? "i" : "n"}|${key}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// 統合で閉じるタブ ID の一覧
export function planMerge(tabs) {
  return group(tabs).flatMap((g) => {
    const keeper = pickKeeper(g);
    return g.filter((t) => t.id !== keeper.id).map((t) => t.id);
  });
}

export function countDuplicates(tabs) {
  return planMerge(tabs).length;
}
