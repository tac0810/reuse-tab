import { test } from "node:test";
import assert from "node:assert/strict";
import { urlKey } from "../src/url-key.js";

test("query と hash を無視する", () => {
  assert.equal(urlKey("https://a.com/x?p=1#h"), urlKey("https://a.com/x?p=2"));
});

test("末尾スラッシュは同一", () => {
  assert.equal(urlKey("https://a.com/x/"), urlKey("https://a.com/x"));
  assert.equal(urlKey("https://a.com/"), urlKey("https://a.com"));
});

test("パスが違えば別", () => {
  assert.notEqual(urlKey("https://a.com/x"), urlKey("https://a.com/y"));
});

test("http/https 以外と不正な URL は null", () => {
  assert.equal(urlKey("chrome://newtab/"), null);
  assert.equal(urlKey("file:///tmp/a"), null);
  assert.equal(urlKey("not a url"), null);
  assert.equal(urlKey(undefined), null);
});
