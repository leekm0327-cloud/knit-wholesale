import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { CATEGORY_LABEL, won } from "@/lib/format";
import type { Product } from "@shared/schema";
import { Plus, Minus, ShoppingCart } from "lucide-react";

// 카테고리 순서 (앵커 바 + 섹션 헤더용)
const CATEGORY_ORDER = [
  { key: "blend", label: "블렌드" },
  { key: "decaf", label: "디카페인" },
  { key: "single", label: "싱글 오리진" },
] as const;

export default function Catalog() {
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const { add } = useCart();
  const { toast } = useToast();

  function setQty(productId: number, qty: number) {
    setQtyMap((prev) => ({ ...prev, [productId]: Math.max(0, qty) }));
  }

  // 카테고리별로 그룹핑
  const grouped = useMemo(() => {
    const all = products ?? [];
    return CATEGORY_ORDER.map((cat) => ({
      ...cat,
      items: all.filter((p) => p.category === cat.key),
    })).filter((g) => g.items.length > 0);
  }, [products]);

  // 앵커 바에 포함할 카테고리 (실제 상품이 있는 것만)
  const anchorCats = useMemo(() => {
    if (!products) return [];
    return CATEGORY_ORDER.filter((cat) => (products ?? []).some((p) => p.category === cat.key));
  }, [products]);

  // 누적 합계 계산 (전체 상품 기준)
  const totals = useMemo(() => {
    const supplyAmount = (products ?? []).reduce((sum, p) => {
      const qty = qtyMap[p.id] ?? 0;
      const unit = (p as any).effectivePrice ?? p.price;
      return sum + unit * qty;
    }, 0);
    const vat = Math.round(supplyAmount * 0.1);
    return { supplyAmount, vat, total: supplyAmount + vat };
  }, [products, qtyMap]);

  // 선택된 상품 수 (qty > 0)
  const selectedCount = useMemo(() => {
    return (products ?? []).filter((p) => (qtyMap[p.id] ?? 0) > 0).length;
  }, [products, qtyMap]);

  function scrollToSection(key: string) {
    const el = sectionRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // 전체 담기 — 수량 > 0 인 모든 상품을 한 번에 카트에 추가
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
    // 수량 초기화
    setQtyMap({});
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-[1200px] px-5 pb-56 pt-8 sm:px-8 sm:pb-60 sm:pt-10">
        {/* 인트로 */}
        <div className="mb-6 flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1">For wholesale partners</p>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              원두 발주
            </h1>
          </div>
          <p className="max-w-3xl break-keep text-xs leading-relaxed text-muted-foreground sm:text-right">
            수량을 입력하고 담아 주세요. 단가는 공급가액 기준이며, 부가세 10%가 별도로 가산됩니다.
          </p>
        </div>

        {/* 앵커 바 */}
        {!isLoading && anchorCats.length > 0 && (
          <div
            className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border pb-4"
            data-testid="anchor-bar"
          >
            {anchorCats.map((cat) => (
              <button
                key={cat.key}
                onClick={() => scrollToSection(cat.key)}
                data-testid={`anchor-${cat.key}`}
                className="font-ui text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="divide-y divide-border border-b border-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-none" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            판매 중인 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-0">
            {grouped.map((group, gi) => (
              <section
                key={group.key}
                ref={(el) => { sectionRefs.current[group.key] = el; }}
                className={gi > 0 ? "mt-12 first:mt-0" : "first:mt-0"}
                data-testid={`section-${group.key}`}
              >
                {/* 섹션 헤더 — 간결한 소형 헤더 */}
                <h2
                  className="mb-4 text-xl font-semibold tracking-tight text-foreground"
                  data-testid={`section-title-${group.key}`}
                >
                  {group.label}
                </h2>

                {/* 테이블 헤더 (데스크탑) */}
                <div className="hidden border-y border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid lg:grid-cols-[minmax(280px,2fr)_minmax(220px,1.4fr)_120px_140px] lg:items-center lg:gap-4">
                  <div>상품명</div>
                  <div>원산지 / 설명</div>
                  <div className="text-right">공급가액</div>
                  <div className="text-center">수량</div>
                </div>

                <ul className="divide-y divide-border border-b border-border lg:border-t-0">
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

      {/* 하단 누적 합계 바 + 장바구니 담기 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-5 py-3 sm:px-8 sm:py-4">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground sm:text-sm">
            <span>공급가액 합계</span>
            <span className="font-ui font-semibold tabular text-foreground">{won(totals.supplyAmount)}</span>
          </div>
          <div className="flex items-baseline justify-between text-xs text-muted-foreground sm:text-sm">
            <span>부가세 (10%)</span>
            <span className="font-ui font-semibold tabular text-foreground">{won(totals.vat)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2 text-sm font-semibold sm:text-base">
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

  return (
    <li
      className={`px-4 py-4 transition-colors ${soldOut ? "opacity-50" : "hover:bg-muted/20"}`}
      data-testid={`row-product-${product.id}`}
    >
      {/* 데스크탑 — 4컬럼 (담기 버튼 열 제거) */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(280px,2fr)_minmax(220px,1.4fr)_120px_140px] lg:items-center lg:gap-4">
        {/* 상품명 */}
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-2">
            {soldOut && (
              <span className="inline-flex w-fit border border-foreground bg-background px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground">
                Sold out
              </span>
            )}
          </div>
          <Link href={`/products/${product.id}`}>
            <a
              className="truncate text-sm font-semibold text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground"
              data-testid={`link-product-${product.id}`}
            >
              {product.name}
            </a>
          </Link>
        </div>

        {/* 원산지 / 설명 */}
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{product.origin}</p>
        </div>

        {/* 공급가액 */}
        <div
          className="text-right font-ui text-base font-bold tabular text-foreground"
          data-testid={`text-price-${product.id}`}
        >
          {won(unitPrice)}
          {hasCustomPrice && (
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground/70">전용가</div>
          )}
        </div>

        {/* 수량 */}
        <div className="flex justify-center">
          <div className="flex items-center border border-border">
            <button
              disabled={soldOut}
              onClick={() => onQtyChange(qty - 1)}
              className="px-2 py-1.5 text-muted-foreground hover-elevate disabled:opacity-40"
              aria-label="수량 감소"
              data-testid={`button-qty-minus-${product.id}`}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span
              className="w-9 text-center font-ui text-sm font-semibold tabular"
              data-testid={`text-qty-${product.id}`}
            >
              {qty}
            </span>
            <button
              disabled={soldOut}
              onClick={() => onQtyChange(qty + 1)}
              className="px-2 py-1.5 text-muted-foreground hover-elevate disabled:opacity-40"
              aria-label="수량 증가"
              data-testid={`button-qty-plus-${product.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 / 태블릿 */}
      <div className="lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {CATEGORY_LABEL[product.category]}
              </span>
              {soldOut && (
                <span className="border border-foreground bg-background px-1.5 py-0.5 font-ui text-[9px] font-semibold uppercase tracking-[0.1em] text-foreground">
                  Sold out
                </span>
              )}
            </div>
            <Link href={`/products/${product.id}`}>
              <a className="mt-1 block text-sm font-semibold text-foreground underline decoration-transparent underline-offset-4 hover:decoration-foreground">
                {product.name}
              </a>
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{product.origin}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-ui text-base font-bold tabular text-foreground">{won(unitPrice)}</div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {hasCustomPrice ? "전용가" : "공급가액"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center border border-border">
            <button
              disabled={soldOut}
              onClick={() => onQtyChange(qty - 1)}
              className="px-2 py-1.5 text-muted-foreground hover-elevate disabled:opacity-40"
              aria-label="수량 감소"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center font-ui text-sm font-semibold tabular">{qty}</span>
            <button
              disabled={soldOut}
              onClick={() => onQtyChange(qty + 1)}
              className="px-2 py-1.5 text-muted-foreground hover-elevate disabled:opacity-40"
              aria-label="수량 증가"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
