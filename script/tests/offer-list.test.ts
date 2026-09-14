import assert from "node:assert/strict";
import express from "express";
import type { Product, ProductCategory } from "../../shared/schema";
import { buildOfferList, offerDate, offerText, sameOffer } from "../../shared/offer-list";
import { registerOfferListRoutes } from "../../server/offer-list";

const category = (key: string, patch: Partial<ProductCategory> = {}): ProductCategory => ({
  id: 1, key, label: key, sortOrder: 0, active: 1, isBean: 1, sampleEligible: 0, createdAt: 0, ...patch,
});
const product = (id: number, patch: Partial<Product> = {}): Product => ({
  id, name: `상품 ${id} 1kg`, category: "blend", origin: "브라질", price: 25000,
  costPrice: 13777, available: 1, minOrderQty: 0, sortOrder: 0, ecountCode: "PRIVATE-CODE",
  detailTemplate: "", detailImages: '["PRIVATE-IMAGE"]', detailJson: "", ...patch,
});
const cats = [category("hidden", { active: 0 }), category("single", { sortOrder: 2 }), category("blend", { sortOrder: 1 })];
let rows = [
  product(1, { sortOrder: 2, detailJson: JSON.stringify({ flavorNotes: "초콜릿, 아몬드", tastingNotes: "레거시", process: "Natural", costPrice: "SECRET-COST" }) }),
  product(2, { sortOrder: 1, price: 0 }),
  product(3, { available: 0 }),
  product(4, { category: "hidden" }),
  product(5, { category: "unknown" }),
  product(6, { name: " " }),
  product(7, { category: "single", origin: "", detailJson: JSON.stringify({ country: "에티오피아", region: "시다마", tastingNotes: "복숭아", variety: "Heirloom", roastLevel: "Light" }) }),
  product(8, { category: "single", price: -100, detailJson: "broken-json", minOrderQty: 2 }),
];
const now = new Date("2026-09-14T15:01:00Z");
const list = buildOfferList(rows, cats, now);
assert.equal(offerDate(list.generatedAt), "2026-09-15", "issue date uses Korea timezone");
assert.deepEqual(list.groups.map(g => g.key), ["blend", "single"]);
assert.deepEqual(list.groups.flatMap(g => g.items.map(p => p.id)), [2, 1, 7, 8]);
assert.deepEqual(list.excluded, { soldOut: 1, hidden: 2, unnamed: 1 });
assert.equal(list.count, 4);
assert.equal(list.groups[0].items[0].price, 0, "zero price is preserved, not invented as negotiated price");
assert.equal(list.groups[0].items[1].notes, "초콜릿, 아몬드");
assert.equal(list.groups[1].items[0].origin, "에티오피아 · 시다마");
assert.equal(list.groups[1].items[1].price, null);
assert.equal(rows[0].id, 1, "source order is not mutated");
for (const forbidden of ["costPrice", "13777", "ecountCode", "PRIVATE-CODE", "PRIVATE-IMAGE", "SECRET-COST", "detailJson", "effectivePrice"]) {
  assert(!JSON.stringify(list).includes(forbidden), `must not expose ${forbidden}`);
  assert(!offerText(list).includes(forbidden));
}
assert(offerText(list).includes("25,000원"));
assert(offerText(list).includes("기본 도매가 · 부가세 별도"));
assert(offerText(list).includes("최소 주문 2개"));
assert(!offerText(list, false).includes("25,000원"));
assert(!offerText(list, false).includes("가격 확인 필요"));
assert(sameOffer(list, { ...list, generatedAt: "2026-09-16T00:00:00Z" }));
assert(!sameOffer(list, buildOfferList(rows.map(p => p.id === 1 ? { ...p, available: 0 } : p), cats)));
assert(!sameOffer(list, buildOfferList(rows.map(p => p.id === 1 ? { ...p, price: 27000 } : p), cats)));
assert(!sameOffer(list, buildOfferList(rows, cats.map(c => c.key === "blend" ? { ...c, active: 0 } : c))));
assert.equal(buildOfferList([], cats).count, 0);
assert.equal(buildOfferList([product(1)], []).count, 1, "same default categories as catalogue");
for (const detailJson of ["null", "[]", "true", '{"flavorNotes":{"private":"secret"}}']) {
  assert.equal(buildOfferList([product(1, { detailJson })], cats).count, 1);
}

let fail = false;
const app = express();
registerOfferListRoutes(app, (req, res, next) => {
  if (req.get("x-test-role") !== "admin") { res.status(403).json({ message: "관리자 권한 필요" }); return; }
  next();
}, {
  async listProducts() { if (fail) throw new Error("DATABASE-PRIVATE-DETAIL"); return rows; },
  async listProductCategories() { return cats; },
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const url = `http://127.0.0.1:${address.port}/api/admin/offer-list`;
try {
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { "x-test-role": "customer" } })).status, 403);
  const get = () => fetch(url, { headers: { "x-test-role": "admin" } });
  let response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).count, 4);
  rows = rows.map(p => p.id === 1 ? { ...p, available: 0 } : p);
  response = await get();
  assert.equal((await response.json()).count, 3, "each request reflects current availability");
  fail = true;
  response = await get();
  assert.equal(response.status, 503);
  assert(!(await response.text()).includes("DATABASE-PRIVATE-DETAIL"));
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
console.log("PASS offer list: availability/category filtering, exact base price, public field whitelist, sorting, KST date, detail fallback, price-hidden text, fresh reads, guard and safe failure.");
