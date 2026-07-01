import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { won } from "@/lib/format";
import type { Product } from "@shared/schema";
import { Plus, Minus, ShoppingCart } from "lucide-react";

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

    // 노트 = flavorNotes + roastLevel (둘 다 있으면 · 로 연결)
    const noteParts: string[] = [];
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
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const { add } = useCart();
  const { toast } = useToast();

  function setQty(productId: number, qty: number) {
    setQtyMap((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const all = products ?? [];
    return CATEGORY_ORDER.map((cat) => ({
      ...cat,
      items: all.filter((p) => p.category === cat.key),
    })).filter((g) => g.items.length > 0);
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
        {!isLoading && anchorCats.length > 1 && (
          <div
            className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1"
            data-testid="anchor-bar"
          >
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

function ProductRow({
  product,
  qty,
  onQtyChange,
}: {
  product: Product;
  qty: number;
  onQtyChange: (qty: number) => void;
}) {
  const soldOut = product.available === 0;
  const unitPrice = (product as any).effectivePrice ?? product.price;
  const hasCustomPrice = Boolean((product as any).hasCustomPrice);
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
            <Link href={`/products/${product.id}`}>
              <a
                className="block text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                data-testid={`link-product-${product.id}`}
              >
                {product.name}
              </a>
            </Link>
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
            <Link href={`/products/${product.id}`}>
              <a
                className="block text-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                data-testid={`link-product-${product.id}`}
              >
                {product.name}
              </a>
            </Link>
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
            <div className="min-w-0 flex-1">
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
              <div className="min-w-0 flex-1">
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
  return (
    <div className="flex items-center border border-border">
      <button
        disabled={soldOut}
        onClick={() => onQtyChange(qty - 1)}
        className="px-2 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="수량 감소"
        data-testid={`button-qty-minus-${productId}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        className={`${compact ? "w-8" : "w-9"} text-center font-ui text-sm tabular`}
        data-testid={`text-qty-${productId}`}
      >
        {qty}
      </span>
      <button
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
