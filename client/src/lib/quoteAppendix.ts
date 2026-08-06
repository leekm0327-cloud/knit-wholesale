import type { Product, QuoteAppendix } from "@shared/schema";

// 원두명에서 중량 표기 제거 (예: "코튼 블렌드 1kg" → "코튼 블렌드")
export function stripWeight(name: string): string {
  return name.replace(/\s*\d+(\.\d+)?\s*(kg|g)\s*$/i, "").trim();
}

function parseBlendComponents(raw: any): { name: string; ratio: string }[] {
  let arr = raw;
  if (typeof raw === "string") { try { arr = JSON.parse(raw || "[]"); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: any) => ({ name: String(x?.name ?? "").trim(), ratio: String(x?.ratio ?? "").trim() }))
    .filter((c) => c.name || c.ratio);
}
function fmtRatio(r: string): string {
  const t = (r || "").trim();
  return t ? (/%$/.test(t) ? t : `${t}%`) : "";
}
function fmtComposition(d: any): string {
  const comps = parseBlendComponents(d.blendComponents);
  if (comps.length) return comps.map((c) => (c.ratio ? `${c.name} ${fmtRatio(c.ratio)}` : c.name)).filter(Boolean).join(" · ");
  return String(d.blendRatio ?? "").trim();
}
function fmtRecipe(d: any): string {
  if (d.recipeType === "espresso") {
    const parts: string[] = [];
    if (d.espDose) parts.push(`도징 ${d.espDose}`);
    if (d.espYield) parts.push(`추출량 ${d.espYield}`);
    if (d.espTemp) parts.push(`온도 ${d.espTemp}`);
    if (d.espTime) parts.push(`시간 ${d.espTime}`);
    if (d.espBasket) parts.push(`바스켓 ${d.espBasket}`);
    return parts.length ? `에스프레소 · ${parts.join(" / ")}` : "";
  }
  if (d.recipeType === "filter") {
    const parts: string[] = [];
    if (d.filDripper) parts.push(`드리퍼 ${d.filDripper}`);
    if (d.filPaper) parts.push(`필터 ${d.filPaper}`);
    if (d.filDose) parts.push(`도징 ${d.filDose}`);
    if (d.filGrind) parts.push(`분쇄 ${d.filGrind}`);
    if (d.filWater) parts.push(`물 ${d.filWater}`);
    if (d.filTemp) parts.push(`온도 ${d.filTemp}`);
    if (d.filTime) parts.push(`시간 ${d.filTime}`);
    return parts.length ? `필터 · ${parts.join(" / ")}` : "";
  }
  return "";
}

// 상품의 상세페이지(detailJson)에서 별첨 정보 추출.
// 싱글 오리진 양식(디카페인 포함)은 이름에 국가·지역·품종·가공방식을 붙이고, 블렌드 구성·권장 레시피는 생략.
export function productToAppendix(p: Product): QuoteAppendix {
  let d: any = {};
  try { d = JSON.parse((p as any).detailJson || "{}"); } catch { /* noop */ }
  const base = stripWeight(p.name);
  if (d.template === "single") {
    const name = [base, d.country, d.region, d.variety, d.process]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(" ");
    return {
      name,
      composition: "",
      flavor: String(d.flavorNotes ?? "").trim(),
      roast: String(d.roastLevel ?? "").trim(),
      recipe: "",
    };
  }
  return {
    name: base,
    composition: fmtComposition(d),
    flavor: String(d.flavorNotes ?? "").trim(),
    roast: String(d.roastLevel ?? "").trim(),
    recipe: fmtRecipe(d),
  };
}

// 원두 표기 순서: 코튼 > 울 > 실크 > 디카페인 > 기타
export function beanRank(name: string): number {
  const order = ["코튼", "울", "실크", "디카페인"];
  for (let i = 0; i < order.length; i++) if (name.includes(order[i])) return i;
  return 99;
}
