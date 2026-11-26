import { test } from "node:test";
import assert from "node:assert/strict";
import { pickKeeper, findExisting, planMerge, countDuplicates } from "../src/dedupe.js";

const tab = (id, url, o = {}) => ({ id, url, windowId: 1, lastAccessed: 0, ...o });

test("pickKeeper: ピン留め > アクティブ > 最後に使った", () => {
  assert.equal(pickKeeper([tab(1, "", { active: true }), tab(2, "", { pinned: true })]).id, 2);
  assert.equal(pickKeeper([tab(1, "", { lastAccessed: 9 }), tab(2, "", { active: true })]).id, 2);
  assert.equal(pickKeeper([tab(1, "", { lastAccessed: 1 }), tab(2, "", { lastAccessed: 5 })]).id, 2);
});

test("findExisting: 自分自身は除外し、同じキーを探す", () => {
  const tabs = [tab(1, "https://a.com/x?old"), tab(2, "chrome://newtab/")];
  assert.equal(findExisting(tabs, tabs[1], "https://a.com/x/?new#h").id, 1);
  assert.equal(findExisting(tabs, tabs[1], "https://a.com/y"), null);
  assert.equal(findExisting([tab(1, "https://a.com/x")], { id: 1 }, "https://a.com/x"), null);
});

test("findExisting: 複数あればピン留めを優先", () => {
  const tabs = [tab(1, "https://a.com/x", { active: true }), tab(2, "https://a.com/x", { pinned: true })];
  assert.equal(findExisting(tabs, { id: 3 }, "https://a.com/x").id, 2);
});

test("findExisting: シークレットと通常は混ぜない", () => {
  const tabs = [tab(1, "https://a.com/x", { incognito: true })];
  assert.equal(findExisting(tabs, { id: 2, incognito: false }, "https://a.com/x"), null);
});

test("findExisting: 読み込み前のタブは pendingUrl で判定", () => {
  const tabs = [{ id: 1, url: "", pendingUrl: "https://a.com/x" }];
  assert.equal(findExisting(tabs, { id: 2 }, "https://a.com/x").id, 1);
});

test("planMerge: キーごとに1つ残して閉じる", () => {
  const tabs = [
    tab(1, "https://a.com/x?1"),
    tab(2, "https://a.com/x#2", { pinned: true }),
    tab(3, "https://a.com/x/"),
    tab(4, "https://b.com/"),
    tab(5, "chrome://settings"),
    tab(6, "chrome://settings"),
    tab(7, "https://b.com/", { incognito: true }),
  ];
  assert.deepEqual(planMerge(tabs).sort(), [1, 3]);
  assert.equal(countDuplicates(tabs), 2);
});

test("findExisting: 開いた元タブが同じキーなら統合しない", () => {
  const tabs = [tab(1, "https://a.com/x"), tab(2, "https://a.com/y")];
  assert.equal(findExisting(tabs, { id: 3 }, "https://a.com/x?new", 1), null);
  assert.equal(findExisting(tabs, { id: 3 }, "https://a.com/x?new", 2).id, 1);
  assert.equal(findExisting(tabs, { id: 3 }, "https://a.com/x?new", 99).id, 1);
});
