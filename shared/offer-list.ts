import type { Product, ProductCategory } from "./schema";

export const OFFER_ORDER_URL = "https://wholesale.knitcoffee.co.kr/#/catalog";
export const OFFER_PRICE_NOTE = "기본 도매가 · 부가세 별도 · 상품명에 표기된 중량/포장 기준";

export type OfferItem = {
  id: number; name: string; price: number | null; origin: string;
  notes: string; process: string; variety: string; roast: string; minOrderQty: number;
};
export type OfferGroup = { key: string; label: string; items: OfferItem[] };
export type OfferList = {
  generatedAt: string; groups: OfferGroup[]; count: number;
  excluded: { soldOut: number; hidden: number; unnamed: number };
};

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const defaults = [
  { key: "blend", label: "블렌드", active: 1, sortOrder: 0, id: 0 },
  { key: "decaf", label: "디카페인", active: 1, sortOrder: 1, id: 1 },
  { key: "single", label: "싱글 오리진", active: 1, sortOrder: 2, id: 2 },
];

// Only explicitly selected public product fields enter an offer. Never spread a Product here.
export function buildOfferList(products: Product[], categories: ProductCategory[], now = new Date()): OfferList {
  const ordered = (categories.length ? categories : defaults).slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const groups: OfferGroup[] = ordered.filter(c => c.active === 1)
    .map(c => ({ key: c.key, label: c.label, items: [] }));
  const byKey = new Map(groups.map(g => [g.key, g]));
  const excluded = { soldOut: 0, hidden: 0, unnamed: 0 };
  for (const p of products.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
    if (p.available !== 1) { excluded.soldOut++; continue; }
    const group = byKey.get(p.category);
    if (!group) { excluded.hidden++; continue; }
    if (!clean(p.name)) { excluded.unnamed++; continue; }
    let detail: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(p.detailJson || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) detail = parsed;
    } catch { /* Incomplete detail fields must not hide an otherwise available product. */ }
    group.items.push({
      id: p.id, name: clean(p.name),
      price: Number.isSafeInteger(p.price) && p.price >= 0 ? p.price : null,
      origin: clean(p.origin) || [clean(detail.country), clean(detail.region)].filter(Boolean).join(" · "),
      notes: clean(detail.flavorNotes) || clean(detail.tastingNotes),
      process: clean(detail.process), variety: clean(detail.variety), roast: clean(detail.roastLevel),
      minOrderQty: Number.isFinite(p.minOrderQty) && p.minOrderQty > 0 ? p.minOrderQty : 0,
    });
  }
  const populated = groups.filter(g => g.items.length);
  return { generatedAt: now.toISOString(), groups: populated,
    count: populated.reduce((sum, g) => sum + g.items.length, 0), excluded };
}

export function offerDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function offerPrice(price: number | null): string {
  return price === null ? "가격 확인 필요" : `${price.toLocaleString("ko-KR")}원`;
}
export function offerText(list: OfferList, showPrice = true): string {
  const lines = ["KNIT COFFEE · OFFER LIST", `${offerDate(list.generatedAt)} 기준 · 주문 가능 상품 ${list.count}종`, ""];
  if (showPrice) lines.push(OFFER_PRICE_NOTE, "");
  for (const group of list.groups) {
    lines.push(`[${group.label}]`);
    for (const p of group.items) {
      lines.push(`• ${p.name}${showPrice ? ` — ${offerPrice(p.price)}` : ""}`);
      if (p.origin) lines.push(`  원산지: ${p.origin}`);
      if (p.notes) lines.push(`  향미: ${p.notes}`);
      if (p.process || p.variety || p.roast) lines.push(`  ${[p.process && `가공 ${p.process}`, p.variety && `품종 ${p.variety}`, p.roast && `로스팅 ${p.roast}`].filter(Boolean).join(" · ")}`);
      if (p.minOrderQty) lines.push(`  최소 주문 ${p.minOrderQty}개`);
    }
    lines.push("");
  }
  lines.push("재고와 가격은 변경될 수 있습니다. 주문 시 사이트에서 확인해 주세요.", `주문하기 ${OFFER_ORDER_URL}`);
  return lines.join("\n");
}

export function sameOffer(a: OfferList, b: OfferList): boolean {
  return JSON.stringify(a.groups) === JSON.stringify(b.groups);
}
