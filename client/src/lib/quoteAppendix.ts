import type { Product, QuoteAppendix } from "@shared/schema";

export function stripWeight(name: string): string {
  return name.replace(/\s*\d+(\.\d+)?\s*(kg|g)\s*$/i, "").trim();
}

export function beanEnglishName(name: string): string {
  const names: Record<string, string> = {
    "코튼 블렌드": "Cotton Blend", "울 블렌드": "Wool Blend",
    "실크 블렌드": "Silk Blend", "디카페인": "Decaf",
  };
  return names[stripWeight(name)] || "";
}

function parseBlendComponents(raw: unknown): { name: string; ratio: string }[] {
  let arr = raw;
  if (typeof arr === "string") { try { arr = JSON.parse(arr || "[]"); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => ({ name: String(x?.name ?? "").trim(), ratio: String(x?.ratio ?? "").trim() }))
    .filter((c) => c.name || c.ratio);
}
function fmtComposition(d: Record<string, any>): string {
  const comps = parseBlendComponents(d.blendComponents);
  if (comps.length) return comps.map((c) => {
    const ratio = c.ratio ? (/%$/.test(c.ratio) ? c.ratio : `${c.ratio}%`) : "";
    return [c.name, ratio].filter(Boolean).join(" ");
  }).join(" · ");
  return String(d.blendRatio ?? "").trim();
}

// Split only recorded separators and a trailing percentage; never infer missing ratios.
export function compositionRows(value: string): { name: string; ratio: string }[] {
  return value.split(/\s*·\s*|\r?\n|\s+\/\s+/).map((part) => {
    const text = part.trim();
    const match = text.match(/^(.*?)\s+(\d+(?:\.\d+)?\s*%)$/);
    return match ? { name: match[1], ratio: match[2] } : { name: text, ratio: "" };
  }).filter((part) => part.name || part.ratio);
}

// Product selection captures a snapshot. Viewing old quotes never replaces their saved information.
export function productToAppendix(p: Product): QuoteAppendix {
  let d: Record<string, any> = {};
  try {
    const parsed = JSON.parse(p.detailJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) d = parsed;
  } catch { /* An incomplete product still yields a selectable bean. */ }
  const clean = (v: unknown) => String(v ?? "").trim();
  const single = d.template === "single";
  return {
    name: stripWeight(p.name), productId: p.id,
    description: clean(d.tagline) || (single ? [d.country, d.region, d.variety].map(clean).filter(Boolean).join(" · ") : ""),
    origin: single ? [
      [d.country, d.region].map(clean).filter(Boolean).join(" · "),
      clean(d.process), d.altitude ? `재배 고도 ${clean(d.altitude)}` : "",
    ].filter(Boolean).join("\n") : clean(d.originProcess),
    composition: single ? "" : fmtComposition(d),
    flavor: clean(d.flavorNotes), roast: clean(d.roastLevel), recipe: "",
  };
}

// Earlier single-origin snapshots stored origin fields after the product name.
export function appendixMatchesProduct(a: QuoteAppendix, p: Product): boolean {
  if (a.productId !== undefined) return a.productId === p.id;
  const name = stripWeight(p.name);
  return a.name === name || (p.category === "decaf" && a.name.startsWith(`${name} `));
}

export function beanRank(name: string): number {
  const order = ["코튼", "울", "실크", "디카페인"];
  for (let i = 0; i < order.length; i++) if (name.includes(order[i])) return i;
  return 99;
}
