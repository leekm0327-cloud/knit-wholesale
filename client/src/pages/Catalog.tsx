import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { KakaoChannelButton } from "@/components/KakaoChannelButton";
import { EspressoLogCharts } from "@/components/EspressoLogCharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { won } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import { Plus, Minus, ShoppingCart, Star, ChevronDown } from "lucide-react";
import { fmtDate } from "@/lib/format";

// ③ 소식 카드 요약 타입
type NewsSummary = {
  id: number;
  title: string;
  coverImage: string;
  pinned: number;
  publishedAt: number;
};

// 카테고리 순서 — 서버(/api/product-categories)가 원본. 로딩 전 폴백용 기본값.
const DEFAULT_CATEGORY_ORDER = [
  { key: "blend", label: "블렌드" },
  { key: "decaf", label: "디카페인" },
  { key: "single", label: "싱글 오리진" },
];

// ===== detailJson에서 컬럼별 값 추출 =====
type ProductFields = {
  composition?: string; // 블렌드: 구성 (blendRatio)
  variety?: string;     // 디카페인/싱글: 품종
  process?: string;     // 디카페인/싱글: 가공방식
  notes?: string;       // 공통: 노트 (향미 노트 = flavorNotes)
  roastLevel?: string;  // 공통: 로스팅 레벨
};

function getProductFields(product: Product): ProductFields {
  if (!product.detailJson) return {};
  try {
    const json = JSON.parse(product.detailJson);
    const template = product.detailTemplate || (product.category === "blend" ? "blend" : "single");

    // 노트 = 향미 노트(flavorNotes)만. 로스팅 레벨은 별도 항목으로 분리.
    const notes = json.flavorNotes ? String(json.flavorNotes) : undefined;
    const roastLevel = json.roastLevel ? String(json.roastLevel) : undefined;

    if (template === "blend") {
      return {
        composition: json.blendRatio || undefined,
        notes,
        roastLevel,
      };
    }
    // single / decaf
    return {
      variety: json.variety || undefined,
      process: json.process || undefined,
      notes,
      roastLevel,
    };
  } catch {
    return {};
  }
}

function isBlendCategory(category: string): boolean {
  return category === "blend";
}

// 블렌드 구성 항목 파싱: detailJson.blendComponents(JSON 문자열 또는 배열) → [{name, ratio}]
function parseBlendComponents(raw: any): { name: string; ratio: string }[] {
  let arr = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw || "[]"); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: any) => ({ name: String(x?.name ?? "").trim(), ratio: String(x?.ratio ?? "").trim() }))
    .filter((c) => c.name || c.ratio);
}

// 비율 표기: 숫자만 있으면 % 붙임
function fmtRatio(r: string): string {
  const t = r.trim();
  if (!t) return "";
  return /%$/.test(t) ? t : `${t}%`;
}

// Coffee Information 패널용: 블렌드 구성(components) + 기본 정보(품종/가공방식/노트/로스팅레벨) + 권장 레시피(택1)
function getCoffeeInfo(product: Product): {
  components: { name: string; ratio: string }[];
  rows: [string, string][];
  recipe: { label: string; rows: [string, string][] } | null;
} {
  let j: any = {};
  try { j = product.detailJson ? JSON.parse(product.detailJson) : {}; } catch {}
  const s = (v: any) => (typeof v === "string" ? v : "");
  const template = product.detailTemplate || (product.category === "blend" ? "blend" : "single");
  const components = parseBlendComponents(j.blendComponents);

  const rows: [string, string][] = [];
  if (template === "blend") {
    // 구성은 components로 별도 표시. 레거시 자유입력만 있으면 한 줄로.
    if (components.length === 0 && s(j.blendRatio).trim()) rows.push(["구성", s(j.blendRatio)]);
  } else {
    if (s(j.variety).trim()) rows.push(["품종", s(j.variety)]);
    if (s(j.process).trim()) rows.push(["가공방식", s(j.process)]);
  }
  if (s(j.flavorNotes).trim()) rows.push(["노트", s(j.flavorNotes)]);
  if (s(j.roastLevel).trim()) rows.push(["로스팅 레벨", s(j.roastLevel)]);

  let recipe: { label: string; rows: [string, string][] } | null = null;
  if (j.recipeType === "espresso") {
    const rr = ([
      ["포터필터 바스켓", s(j.espBasket)], ["Temperature", s(j.espTemp)], ["Dose", s(j.espDose)], ["Yield", s(j.espYield)], ["Time", s(j.espTime)],
    ] as [string, string][]).filter(([, v]) => v.trim());
    if (rr.length) recipe = { label: "에스프레소", rows: rr };
  } else if (j.recipeType === "filter") {
    const rr = ([
      ["Dripper", s(j.filDripper)], ["필터", s(j.filPaper)], ["Dose", s(j.filDose)], ["Ground Size (EK43 기준)", s(j.filGrind)], ["Water", s(j.filWater)], ["Temperature", s(j.filTemp)], ["Time", s(j.filTime)],
    ] as [string, string][]).filter(([, v]) => v.trim());
    if (rr.length) recipe = { label: "필터", rows: rr };
  }
  return { components, rows, recipe };
}

export default function Catalog() {
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  // 카테고리(순서·표시 여부)는 관리자 설정을 따른다.
  const { data: categoryRows } = useQuery<any[]>({ queryKey: ["/api/product-categories"] });
  const CATEGORY_ORDER = useMemo(() => {
    if (!categoryRows || categoryRows.length === 0) return DEFAULT_CATEGORY_ORDER;
    return categoryRows
      .filter((c) => c.active !== 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((c) => ({ key: c.key, label: c.label }));
  }, [categoryRows]);
  // ③ 니트커피 소식 (발행분). 최신 4개만 상단 카드로 노출.
  const { data: newsList } = useQuery<NewsSummary[]>({ queryKey: ["/api/news"] });
  const topNews = (newsList ?? []).slice(0, 4);
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const { add } = useCart();
  const { toast } = useToast();

  function setQty(productId: number, qty: number) {
    setQtyMap((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  // #1 즐겨찾기 토글 — 낙관적 업데이트 후 서버 반영
  async function toggleFavorite(product: Product) {
    const nowFav = !(product as any).isFavorite;
    // 낙관적 업데이트: 캐시의 isFavorite 값을 먼저 바꿈
    queryClient.setQueryData<Product[]>(["/api/products"], (old) =>
      (old ?? []).map((p) => (p.id === product.id ? ({ ...p, isFavorite: nowFav } as any) : p)),
    );
    try {
      if (nowFav) {
        await apiRequest("POST", `/api/favorites/${product.id}`, {});
      } else {
        await apiRequest("DELETE", `/api/favorites/${product.id}`);
      }
    } catch {
      // 실패 시 롤백
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "즐겨찾기 처리 실패", description: "잠시 후 다시 시도해 주세요.", variant: "destructive" });
    }
  }

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const all = products ?? [];
    return CATEGORY_ORDER.map((cat) => ({
      ...cat,
      items: all.filter((p) => p.category === cat.key && p.available !== 0),
    })).filter((g) => g.items.length > 0);
  }, [products, CATEGORY_ORDER]);

  // #1 즐겨찾기 품목 (카테고리 무관, sortOrder 순 유지)
  const favoriteItems = useMemo(() => {
    return (products ?? []).filter((p) => (p as any).isFavorite && p.available !== 0);
  }, [products]);

  // 앵커 카테고리
  const anchorCats = useMemo(() => {
    if (!products) return [];
    return CATEGORY_ORDER.filter((cat) => (products ?? []).some((p) => p.category === cat.key && p.available !== 0));
  }, [products, CATEGORY_ORDER]);

  // 누적 합계
  const totals = useMemo(() => {
    const supplyAmount = (products ?? []).reduce((sum, p) => {
      const qty = qtyMap[p.id] ?? 0;
      const unit = (p as any).effectivePrice ?? p.price;
      return sum + unit * qty;
    }, 0);
    const vat = Math.round(supplyAmount * 0.1);
    return { supplyAmount, vat, total: supplyAmount + vat };
  }, [products, qtyMap]);

  // 선택된 상품 수
  const selectedCount = useMemo(() => {
    return (products ?? []).filter((p) => (qtyMap[p.id] ?? 0) > 0).length;
  }, [products, qtyMap]);

  function scrollToSection(key: string) {
    const el = sectionRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addAllToCart() {
    const toAdd = (products ?? []).filter((p) => (qtyMap[p.id] ?? 0) > 0 && p.available !== 0);
    if (toAdd.length === 0) {
      toast({ title: "담을 상품이 없습니다", description: "수량을 1 이상으로 설정한 상품이 없습니다.", variant: "destructive" });
      return;
    }
    for (const p of toAdd) {
      const qty = qtyMap[p.id] ?? 0;
      const unitPrice = (p as any).effectivePrice ?? p.price;
      add({ productId: p.id, name: p.name, category: p.category, unitPrice }, qty);
    }
    const totalQty = toAdd.reduce((s, p) => s + (qtyMap[p.id] ?? 0), 0);
    toast({
      title: "장바구니에 담았습니다",
      description: `${toAdd.length}개 상품 · 총 ${totalQty}개 담김`,
    });
    setQtyMap({});
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <KakaoChannelButton />

      <main className="mx-auto max-w-[1200px] px-5 pb-56 pt-8 sm:px-8 sm:pb-60 sm:pt-10">
        {/* ③ NEWS — 소식이 하나도 없으면 섹션 자체를 숨김. 최상단 노출 (헤더 없이 카드만) */}
        {topNews.length > 0 && (
          <section className="mb-10" data-testid="section-catalog-news">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topNews.map((n) => (
                <Link
                  key={n.id}
                  href={`/news/${n.id}`}
                  className="group relative block aspect-[2/1] overflow-hidden rounded-lg border border-border bg-muted"
                  data-testid={`card-news-${n.id}`}
                >
                  {n.coverImage ? (
                    <img src={n.coverImage} alt={n.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">니트커피</div>
                  )}
                  {/* 데스크톱: hover 시 / 모바일: 기본으로 사진이 어두워지며 제목 노출 */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 max-md:opacity-100" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 opacity-0 transition-all duration-300 group-hover:opacity-100 max-md:opacity-100">
                    <h3 className="line-clamp-2 text-sm font-semibold text-white drop-shadow-sm">{n.title}</h3>
                    {n.publishedAt ? (
                      <p className="mt-1 text-xs text-white/80">{fmtDate(n.publishedAt)}</p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 인트로 헤더 */}
        <div className="mb-6 border-b border-border pb-6">
          <p className="eyebrow mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">For wholesale partners</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            원두 발주
          </h1>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
            수량을 입력하고 담아 주세요. 단가는 공급가액 기준이며, 부가세 10%가 별도로 가산됩니다.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link
              href="/visit-setup"
              data-testid="link-catalog-visit-setup"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#6b6a45] bg-[#f2f1e9] px-4 py-2.5 text-sm font-semibold text-[#6b6a45] transition-colors hover:bg-[#6b6a45] hover:text-white sm:px-6"
            >
              커피 세팅 문의 <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={() =>
                document.getElementById("espresso-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              data-testid="button-catalog-recipe"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#6b6a45] bg-[#f2f1e9] px-4 py-2.5 text-sm font-semibold text-[#6b6a45] transition-colors hover:bg-[#6b6a45] hover:text-white sm:px-6"
            >
              니트커피 레시피 <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* 출고 안내 박스 */}
        <div
          className="mb-6 flex items-start gap-2 rounded-lg bg-[#f2f1e9] px-4 py-3"
          data-testid="shipping-notice"
        >
          <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b6a45]" />
          <p className="text-xs leading-relaxed text-[#5c5b3e]">
            평일 <span className="font-semibold">12:00 이전 주문</span>은 택배(대한통운)로 당일 출고 · 주문량에 따라 지연될 수 있습니다.
          </p>
        </div>

        {/* 카테고리 바로가기 — 알약 칩 (모바일 가로 스크롤 한 줄) */}
        {!isLoading && (anchorCats.length > 1 || favoriteItems.length > 0) && (
          <div
            className="mb-8 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="anchor-bar"
          >
            {favoriteItems.length > 0 && (
              <button
                onClick={() => scrollToSection("favorites")}
                data-testid="anchor-favorites"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500 px-3.5 py-1.5 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50"
              >
                <Star className="h-3 w-3 fill-current" />
                즐겨찾기
              </button>
            )}
            {anchorCats.map((cat) => (
              <button
                key={cat.key}
                onClick={() => scrollToSection(cat.key)}
                data-testid={`anchor-${cat.key}`}
                className="shrink-0 whitespace-nowrap rounded-full border border-input px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#6b6a45] hover:text-[#6b6a45]"
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-0 divide-y divide-border border-b border-t border-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-none" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            판매 중인 상품이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* #1 즐겨찾기 섹션 — 최상단 전체 폭 카드 */}
            {favoriteItems.length > 0 && (
              <section
                ref={(el) => { sectionRefs.current["favorites"] = el; }}
                className="rounded-2xl border border-[#eeece4] bg-[#fbfbf9] p-4 sm:p-5 lg:col-span-2"
                data-testid="section-favorites"
              >
                <h2
                  className="mb-3 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground"
                  data-testid="section-title-favorites"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  즐겨찾기
                </h2>
                <ul className="divide-y divide-[#efede6]">
                  {favoriteItems.map((p) => (
                    <ProductRow
                      key={`fav-${p.id}`}
                      product={p}
                      qty={qtyMap[p.id] ?? 0}
                      onQtyChange={(q) => setQty(p.id, q)}
                      onToggleFavorite={() => toggleFavorite(p)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {grouped.map((group) => (
              <section
                key={group.key}
                ref={(el) => { sectionRefs.current[group.key] = el; }}
                className="rounded-2xl border border-[#eeece4] bg-[#fbfbf9] p-4 sm:p-5"
                data-testid={`section-${group.key}`}
              >
                {/* 카테고리 헤더 — 올리브 액센트 바 */}
                <h2
                  className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
                  data-testid={`section-title-${group.key}`}
                >
                  <span className="h-3.5 w-[3px] rounded-full bg-[#6b6a45]" />
                  {group.label}
                </h2>

                <ul className="divide-y divide-[#efede6]">
                  {group.items.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      qty={qtyMap[p.id] ?? 0}
                      onQtyChange={(q) => setQty(p.id, q)}
                      onToggleFavorite={() => toggleFavorite(p)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* 에스프레소 추출 로그 (공개 집계) */}
        <section id="espresso-section" className="mt-12 mb-24 scroll-mt-20" data-testid="section-espresso">
          <h2 className="mb-1 font-display text-lg font-semibold text-foreground">에스프레소 추출 로그</h2>
          <p className="mb-4 text-sm text-muted-foreground">매장에서 매 세팅마다 기록한 추출 데이터를 집계했습니다.</p>
          <EspressoLogCharts />
        </section>
      </main>

      {/* 하단 합계바 — 미니멀 (모바일은 하단 탭바 위로 재배치) */}
      <div className="fixed bottom-11 left-0 right-0 z-40 border-t border-border bg-background/97 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:bottom-0">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-5 py-3 sm:px-8 sm:py-4">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>공급가액</span>
            <span className="font-ui tabular text-foreground">{won(totals.supplyAmount)}</span>
          </div>
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>부가세 (10%)</span>
            <span className="font-ui tabular text-foreground">{won(totals.vat)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>총 합계 (부가세 포함)</span>
            <span className="font-display text-base tabular text-foreground sm:text-lg" data-testid="text-total">
              {won(totals.total)}
            </span>
          </div>
          <Button
            className="mt-2 w-full"
            size="lg"
            disabled={selectedCount === 0}
            onClick={addAllToCart}
            data-testid="button-add-all-to-cart"
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            장바구니에 담기
            {selectedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-background/20 px-1.5 py-0.5 text-xs font-semibold">
                {selectedCount}개 상품
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// #1 즐겨찾기 별표 토글 버튼
function StarButton({
  productId,
  isFavorite,
  onToggle,
}: {
  productId: number;
  isFavorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={isFavorite}
      data-testid={`button-favorite-${productId}`}
      className={`shrink-0 rounded p-0.5 transition-colors ${
        isFavorite
          ? "text-amber-400 hover:text-amber-500"
          : "text-muted-foreground/40 hover:text-amber-400"
      }`}
    >
      <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
    </button>
  );
}

function ProductRow({
  product,
  qty,
  onQtyChange,
  onToggleFavorite,
}: {
  product: Product;
  qty: number;
  onQtyChange: (qty: number) => void;
  onToggleFavorite: () => void;
}) {
  const [open, setOpen] = useState(false);
  const soldOut = product.available === 0;
  const unitPrice = (product as any).effectivePrice ?? product.price;
  const hasCustomPrice = Boolean((product as any).hasCustomPrice);
  const isFavorite = Boolean((product as any).isFavorite);
  const info = getCoffeeInfo(product);
  const hasInfo = info.components.length > 0 || info.rows.length > 0 || info.recipe !== null;

  return (
    <li
      className={`py-3 transition-colors ${soldOut ? "opacity-50" : ""}`}
      data-testid={`row-product-${product.id}`}
    >
      {/* 상단: 상품명 / 가격 / 수량 (한 줄, 반응형 공통) */}
      <div className="flex items-center gap-3">
        <StarButton productId={product.id} isFavorite={isFavorite} onToggle={onToggleFavorite} />
        <div className="min-w-0 flex-1">
          {soldOut && (
            <span className="mb-0.5 inline-flex border border-muted-foreground/40 px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Sold out
            </span>
          )}
          <Link href={`/products/${product.id}`}>
            <a
              className="block text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
              data-testid={`link-product-${product.id}`}
            >
              {product.name}
            </a>
          </Link>
        </div>
        <div className="shrink-0 text-right" data-testid={`text-price-${product.id}`}>
          <div className="font-ui text-sm tabular text-foreground">{won(unitPrice)}</div>
          {hasCustomPrice && (
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-teal-600">전용가</div>
          )}
        </div>
        <div className="shrink-0">
          <QtyControl productId={product.id} qty={qty} soldOut={soldOut} onQtyChange={onQtyChange} compact />
        </div>
      </div>

      {/* Coffee Information — 접이식 */}
      {hasInfo && (
        <div className="mt-2 pl-7">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 font-ui text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
            data-testid={`button-coffee-info-${product.id}`}
          >
            Coffee Information
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="mt-2 max-w-2xl space-y-3 rounded-md border border-border bg-muted/20 p-3">
              {info.components.length > 0 && (
                <div>
                  <div className="mb-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">구성</div>
                  <ul className="space-y-1">
                    {info.components.map((c, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 text-foreground">{c.name}</span>
                        {c.ratio && <span className="shrink-0 tabular text-muted-foreground">{fmtRatio(c.ratio)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {info.rows.length > 0 && (
                <dl className="space-y-1.5">
                  {info.rows.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[84px_1fr] gap-3 text-xs">
                      <dt className="font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {info.recipe && (
                <div>
                  <div className="mb-1.5 font-ui text-[11px] font-semibold text-foreground">
                    권장 레시피 · {info.recipe.label}
                  </div>
                  <dl className="space-y-1">
                    {info.recipe.rows.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[130px_1fr] gap-3 text-xs">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function QtyControl({
  productId,
  qty,
  soldOut,
  onQtyChange,
  compact = false,
}: {
  productId: number;
  qty: number;
  soldOut: boolean;
  onQtyChange: (qty: number) => void;
  compact?: boolean;
}) {
  // 입력 중에는 빈 문자열도 허용하기 위해 로컴 문자열 state 유지
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (qty > 0 ? String(qty) : "");

  function commitDraft(raw: string) {
    // 숫자 이외 문자 제거
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits === "") {
      // 비우면 미선택(0)으로 처리
      onQtyChange(0);
      return;
    }
    const n = parseInt(digits, 10);
    // 하한 1, 상한 없음
    onQtyChange(Math.max(1, n));
  }

  return (
    <div className="flex items-center border border-border">
      <button
        type="button"
        disabled={soldOut}
        onClick={() => onQtyChange(qty - 1)}
        className="px-2 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="수량 감소"
        data-testid={`button-qty-minus-${productId}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={soldOut}
        value={display}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "");
          setDraft(v);
        }}
        onFocus={(e) => {
          setDraft(display);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          commitDraft(e.target.value);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="수량 입력"
        className={`${compact ? "w-9" : "w-11"} border-x border-border bg-transparent py-1.5 text-center font-ui text-sm tabular text-foreground outline-none focus:bg-muted/40 disabled:opacity-40`}
        data-testid={`input-qty-${productId}`}
      />
      <button
        type="button"
        disabled={soldOut}
        onClick={() => onQtyChange(qty + 1)}
        className="px-2 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="수량 증가"
        data-testid={`button-qty-plus-${productId}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
