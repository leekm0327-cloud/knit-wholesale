import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { won } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";
import { Plus, Minus, ShoppingCart, Star } from "lucide-react";
import { fmtDate } from "@/lib/format";

// ③ 소식 카드 요약 타입
type NewsSummary = {
  id: number;
  title: string;
  coverImage: string;
  pinned: number;
  publishedAt: number;
};

// 카테고리 순서
const CATEGORY_ORDER = [
  { key: "blend", label: "블렌드" },
  { key: "decaf", label: "디카페인" },
  { key: "single", label: "싱글 오리진" },
] as const;

// ===== detailJson에서 컬럼별 값 추출 =====
type ProductFields = {
  composition?: string; // 블렌드: 구성 (blendRatio)
  variety?: string;     // 디카페인/싱글: 품종
  process?: string;     // 디카페인/싱글: 가공방식
  notes?: string;       // 공통: 노트 (flavorNotes · roastLevel)
};

function getProductFields(product: Product): ProductFields {
  if (!product.detailJson) return {};
  try {
    const json = JSON.parse(product.detailJson);
    const template = product.detailTemplate || (product.category === "blend" ? "blend" : "single");

    // 노트 = 맛노트 + flavorNotes + roastLevel (있는 것끼리 · 로 연결)
    const noteParts: string[] = [];
    if (json.tastingNotes) noteParts.push(String(json.tastingNotes));
    if (json.flavorNotes) noteParts.push(String(json.flavorNotes));
    if (json.roastLevel) noteParts.push(String(json.roastLevel));
    const notes = noteParts.length > 0 ? noteParts.join(" · ") : undefined;

    if (template === "blend") {
      return {
        composition: json.blendRatio || undefined,
        notes,
      };
    }
    // single / decaf
    return {
      variety: json.variety || undefined,
      process: json.process || undefined,
      notes,
    };
  } catch {
    return {};
  }
}

function isBlendCategory(category: string): boolean {
  return category === "blend";
}

export default function Catalog() {
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
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
      items: all.filter((p) => p.category === cat.key),
    })).filter((g) => g.items.length > 0);
  }, [products]);

  // #1 즐겨찾기 품목 (카테고리 무관, sortOrder 순 유지)
  const favoriteItems = useMemo(() => {
    return (products ?? []).filter((p) => (p as any).isFavorite);
  }, [products]);

  // 앵커 카테고리
  const anchorCats = useMemo(() => {
    if (!products) return [];
    return CATEGORY_ORDER.filter((cat) => (products ?? []).some((p) => p.category === cat.key));
  }, [products]);

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

      <main className="mx-auto max-w-[1200px] px-5 pb-56 pt-8 sm:px-8 sm:pb-60 sm:pt-10">
        {/* ③ NEWS — 소식이 하나도 없으면 섹션 자체를 숨김. 최상단 노출 (헤더 없이 카드만) */}
        {topNews.length > 0 && (
          <section className="mb-10" data-testid="section-catalog-news">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {topNews.map((n) => (
                <Link
                  key={n.id}
                  href={`/news/${n.id}`}
                  className="group relative block aspect-[3/2] overflow-hidden rounded-lg border border-border bg-muted"
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
        </div>

        {/* 출고 안내 박스 */}
        <div
          className="mb-8 border-l-2 border-teal-600 bg-muted/40 px-4 py-3"
          data-testid="shipping-notice"
        >
          <p className="text-xs leading-relaxed text-foreground">
            평일 기준, <span className="font-semibold">12:00 이전 주문</span>은 택배(대한통운)로 당일 출고되며, 주문량에 따라 지연될 수 있습니다.
          </p>
        </div>

        {/* 미니멀 앵커 바 */}
        {!isLoading && (anchorCats.length > 1 || favoriteItems.length > 0) && (
          <div
            className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1"
            data-testid="anchor-bar"
          >
            {favoriteItems.length > 0 && (
              <button
                onClick={() => scrollToSection("favorites")}
                data-testid="anchor-favorites"
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-600 transition-colors hover:text-amber-500"
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
                className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
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
          <div>
            {/* #1 즐겨찾기 섹션 — 최상단 고정 */}
            {favoriteItems.length > 0 && (
              <section
                ref={(el) => { sectionRefs.current["favorites"] = el; }}
                className="mb-10"
                data-testid="section-favorites"
              >
                <h2
                  className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground"
                  data-testid="section-title-favorites"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  즐겨찾기
                </h2>
                <div className="mb-2 h-px bg-border" />
                <ul className="divide-y divide-border">
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
            {grouped.map((group, gi) => (
              <section
                key={group.key}
                ref={(el) => { sectionRefs.current[group.key] = el; }}
                className={gi > 0 ? "mt-10" : ""}
                data-testid={`section-${group.key}`}
              >
                {/* 카테고리 헤더 — 작은 폰트 */}
                <h2
                  className="mb-2 text-sm font-semibold tracking-tight text-foreground"
                  data-testid={`section-title-${group.key}`}
                >
                  {group.label}
                </h2>
                <div className="mb-2 h-px bg-border" />

                {/* 테이블 헤더 (데스크탑) — 카테고리별 컬럼 차별화 */}
                {isBlendCategory(group.key) ? (
                  <div className="hidden border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid lg:grid-cols-[minmax(150px,1.0fr)_minmax(180px,1.6fr)_minmax(180px,1.6fr)_110px_140px] lg:items-center lg:gap-4">
                    <div>상품명</div>
                    <div>구성</div>
                    <div>노트</div>
                    <div className="text-right">공급가액</div>
                    <div className="text-right">수량</div>
                  </div>
                ) : (
                  <div className="hidden border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid lg:grid-cols-[minmax(170px,1.3fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(160px,1.4fr)_110px_140px] lg:items-center lg:gap-4">
                    <div>상품명</div>
                    <div>품종</div>
                    <div>가공방식</div>
                    <div>노트</div>
                    <div className="text-right">공급가액</div>
                    <div className="text-right">수량</div>
                  </div>
                )}

                <ul className="divide-y divide-border">
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
      </main>

      {/* 하단 합계바 — 미니멀 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/97 backdrop-blur supports-[backdrop-filter]:bg-background/85">
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
  const soldOut = product.available === 0;
  const unitPrice = (product as any).effectivePrice ?? product.price;
  const hasCustomPrice = Boolean((product as any).hasCustomPrice);
  const isFavorite = Boolean((product as any).isFavorite);
  const fields = getProductFields(product);
  const isBlend = isBlendCategory(product.category);

  return (
    <li
      className={`py-3 transition-colors ${soldOut ? "opacity-50" : ""}`}
      data-testid={`row-product-${product.id}`}
    >
      {/* ===== 데스크탑 ===== */}
      {isBlend ? (
        // 블렌드: 상품명 / 구성 / 노트 / 가격 / 수량
        <div className="hidden lg:grid lg:grid-cols-[minmax(150px,1.0fr)_minmax(180px,1.6fr)_minmax(180px,1.6fr)_110px_140px] lg:items-center lg:gap-4">
          {/* 상품명 */}
          <div className="min-w-0">
            {soldOut && (
              <span className="mb-0.5 inline-flex border border-muted-foreground/40 px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Sold out
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <StarButton productId={product.id} isFavorite={isFavorite} onToggle={onToggleFavorite} />
              <Link href={`/products/${product.id}`}>
                <a
                  className="block min-w-0 text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                  data-testid={`link-product-${product.id}`}
                >
                  {product.name}
                </a>
              </Link>
            </div>
          </div>

          {/* 구성 */}
          <div className="min-w-0 text-xs text-muted-foreground">
            {fields.composition || "—"}
          </div>

          {/* 노트 */}
          <div className="min-w-0 text-xs text-muted-foreground">
            {fields.notes || "—"}
          </div>

          {/* 공급가액 */}
          <div
            className="text-right font-ui text-sm tabular text-foreground"
            data-testid={`text-price-${product.id}`}
          >
            {won(unitPrice)}
            {hasCustomPrice && (
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-teal-600">전용가</div>
            )}
          </div>

          {/* 수량 컨트롤 */}
          <div className="flex justify-end">
            <QtyControl
              productId={product.id}
              qty={qty}
              soldOut={soldOut}
              onQtyChange={onQtyChange}
            />
          </div>
        </div>
      ) : (
        // 디카페인 / 싱글: 상품명 / 품종 / 가공방식 / 노트 / 가격 / 수량
        <div className="hidden lg:grid lg:grid-cols-[minmax(170px,1.3fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(160px,1.4fr)_110px_140px] lg:items-center lg:gap-4">
          {/* 상품명 */}
          <div className="min-w-0">
            {soldOut && (
              <span className="mb-0.5 inline-flex border border-muted-foreground/40 px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Sold out
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <StarButton productId={product.id} isFavorite={isFavorite} onToggle={onToggleFavorite} />
              <Link href={`/products/${product.id}`}>
                <a
                  className="block min-w-0 text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                  data-testid={`link-product-${product.id}`}
                >
                  {product.name}
                </a>
              </Link>
            </div>
          </div>

          {/* 품종 */}
          <div className="min-w-0 text-xs text-muted-foreground">
            {fields.variety || "—"}
          </div>

          {/* 가공방식 */}
          <div className="min-w-0 text-xs text-muted-foreground">
            {fields.process || "—"}
          </div>

          {/* 노트 */}
          <div className="min-w-0 text-xs text-muted-foreground">
            {fields.notes || "—"}
          </div>

          {/* 공급가액 */}
          <div
            className="text-right font-ui text-sm tabular text-foreground"
            data-testid={`text-price-${product.id}`}
          >
            {won(unitPrice)}
            {hasCustomPrice && (
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-teal-600">전용가</div>
            )}
          </div>

          {/* 수량 컨트롤 */}
          <div className="flex justify-end">
            <QtyControl
              productId={product.id}
              qty={qty}
              soldOut={soldOut}
              onQtyChange={onQtyChange}
            />
          </div>
        </div>
      )}

      {/* ===== 모바일 / 태블릿 ===== */}
      <div className="lg:hidden">
        {isBlend ? (
          // 블렌드: 상품명 + 가격 한 줄
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <StarButton productId={product.id} isFavorite={isFavorite} onToggle={onToggleFavorite} />
              <div className="min-w-0">
                {soldOut && (
                  <span className="mb-1 inline-flex border border-muted-foreground/40 px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Sold out
                  </span>
                )}
                <Link href={`/products/${product.id}`}>
                  <a className="block text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 hover:decoration-current">
                    {product.name}
                  </a>
                </Link>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-ui text-sm tabular text-foreground">{won(unitPrice)}</div>
              {hasCustomPrice && (
                <div className="text-[10px] text-teal-600">전용가</div>
              )}
            </div>
          </div>
        ) : (
          // 디카페인 / 싱글: 카드형 (상품명+가격 / 품종 / 가공방식 / 노트)
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-1.5">
                <StarButton productId={product.id} isFavorite={isFavorite} onToggle={onToggleFavorite} />
                <div className="min-w-0">
                  {soldOut && (
                    <span className="mb-1 inline-flex border border-muted-foreground/40 px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Sold out
                    </span>
                  )}
                  <Link href={`/products/${product.id}`}>
                    <a className="block text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 hover:decoration-current">
                      {product.name}
                    </a>
                  </Link>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-ui text-sm tabular text-foreground">{won(unitPrice)}</div>
                {hasCustomPrice && (
                  <div className="text-[10px] text-teal-600">전용가</div>
                )}
              </div>
            </div>

            {/* 품종 / 가공방식 / 노트 — 줄 나눔 */}
            <dl className="mt-2 space-y-1 text-xs">
              {fields.variety && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">품종</dt>
                  <dd className="min-w-0 flex-1 text-foreground">{fields.variety}</dd>
                </div>
              )}
              {fields.process && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">가공방식</dt>
                  <dd className="min-w-0 flex-1 text-foreground">{fields.process}</dd>
                </div>
              )}
              {fields.notes && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">노트</dt>
                  <dd className="min-w-0 flex-1 text-muted-foreground">{fields.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* 수량 컨트롤 — 공통 */}
        <div className="mt-3 flex items-center justify-end">
          <QtyControl
            productId={product.id}
            qty={qty}
            soldOut={soldOut}
            onQtyChange={onQtyChange}
            compact
          />
        </div>
      </div>
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
