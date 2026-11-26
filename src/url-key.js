// 同一判定キーを作る。query と hash は無視し、末尾スラッシュも同一とみなす。
// 対象外（http/https 以外・不正な URL）は null を返す。
export function urlKey(url) {
  if (typeof url !== "string") return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.origin + u.pathname.replace(/\/+$/, "");
}
