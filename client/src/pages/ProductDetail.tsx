import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { CATEGORY_LABEL, won } from "@/lib/format";
import type { Product, ProductDetail } from "@shared/schema";
import { ArrowLeft, Plus, Minus } from "lucide-react";

function parseDetail(product: Product): ProductDetail | null {
  if (!product.detailJson) return null;
  try {
    const parsed = JSON.parse(product.detailJson);
    if (parsed && (parsed.template === "blend" || parsed.template === "single")) {
      return parsed as ProductDetail;
    }
  } catch {
    // ignore
  }
  return null;
}

function parseImages(product: Product): string[] {
  if (!product.detailImages) return [];
  try {
    const arr = JSON.parse(product.detailImages);
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
  } catch {
    // ignore
  }
  return [];
}

// 기본 양식 결정: category가 "blend"면 blend, 그 외(decaf/single)는 single
function defaultTemplate(category: string): "blend" | "single" {
  return category === "blend" ? "blend" : "single";
}

export default function ProductDetail() {
  const [, params] = useRoute<{ id: string }>("/products/:id");
  const productId = params ? Number(params.id) : NaN;
  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    enabled: Number.isFinite(productId),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-6">
          <Link href="/catalog">
            <a className="inline-flex items-center gap-1.5 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground" data-testid="link-back">
              <ArrowLeft className="h-3.5 w-3.5" />
              Catalog로 돌아가기
            </a>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : error || !product ? (
          <div className="border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            상품을 불러올 수 없습니다.
          </div>
        ) : (
          <ProductDetailView product={product} />
        )}
      </main>
    </div>
  );
}

function ProductDetailView({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();
  const [qty, setQty] = useState(0);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const detail = parseDetail(product);
  const images = parseImages(product);
  const template = detail?.template ?? defaultTemplate(product.category);
  const soldOut = product.available === 0;
  const unitPrice = (product as any).effectivePrice ?? product.price;
  const hasCustomPrice = Boolean((product as any).hasCustomPrice);

  function addToCart() {
    if (qty <= 0) {
      toast({ title: "수량을 입력해 주세요", description: "1 이상의 수량을 입력해야 담을 수 있습니다.", variant: "destructive" });
      return;
    }
    add(
      {
        productId: product.id,
        name: product.name,
        category: product.category,
        unitPrice,
      },
      qty,
    );
    toast({ title: "장바구니 담기", description: `${product.name} × ${qty}` });
    setQty(0);
  }

  return (
    <article className="space-y-8">
      {/* 헤더 */}
      <header className="border-b border-border pb-6">
        <p className="eyebrow mb-2" data-testid="text-category">
          {CATEGORY_LABEL[product.category] ?? product.category}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" data-testid="text-name">
          {product.name}
        </h1>
        {detail && "tagline" in detail && detail.tagline && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid="text-tagline">
            {detail.tagline}
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        {/* 좌측: 이미지 + 본문 */}
        <div className="space-y-8">
          {/* 이미지 갤러리 */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="aspect-[4/3] w-full overflow-hidden border border-border bg-muted/20">
                <img
                  src={images[activeImageIdx] ?? images[0]}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  data-testid="img-hero"
                />
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImageIdx(i)}
                      className={`aspect-square overflow-hidden border-2 transition-all ${
                        i === activeImageIdx ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      data-testid={`button-thumb-${i}`}
                    >
                      <img src={src} alt={`${product.name} ${i + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 상세 본문 */}
          <DetailFields template={template} detail={detail} origin={product.origin} />
        </div>

        {/* 우측: 주문 패널 (sticky) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 border border-border bg-background p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {hasCustomPrice ? "거래처 전용가" : "공급가액"}
              </p>
              <p className="mt-1 font-display text-2xl font-bold tabular text-foreground" data-testid="text-price">
                {won(unitPrice)}
              </p>
              {hasCustomPrice && (
                <p className="mt-0.5 text-[11px] text-muted-foreground line-through tabular">기본가 {won(product.price)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">부가세 10% 별도</p>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">수량</p>
              <div className="flex items-center border border-border">
                <button
                  disabled={soldOut}
                  onClick={() => setQty((q) => Math.max(0, q - 1))}
                  className="px-3 py-2 text-muted-foreground hover-elevate disabled:opacity-40"
                  aria-label="수량 감소"
                  data-testid="button-qty-minus"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span
                  className="flex-1 text-center font-ui text-base font-semibold tabular"
                  data-testid="text-qty"
                >
                  {qty}
                </span>
                <button
                  disabled={soldOut}
                  onClick={() => setQty((q) => q + 1)}
                  className="px-3 py-2 text-muted-foreground hover-elevate disabled:opacity-40"
                  aria-label="수량 증가"
                  data-testid="button-qty-plus"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {qty > 0 && (
              <div className="space-y-1 border-t border-border pt-3 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>공급가액</span>
                  <span className="tabular text-foreground">{won(unitPrice * qty)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>부가세 (10%)</span>
                  <span className="tabular text-foreground">{won(Math.round(unitPrice * qty * 0.1))}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-sm font-semibold">
                  <span>합계</span>
                  <span className="tabular text-foreground">
                    {won(unitPrice * qty + Math.round(unitPrice * qty * 0.1))}
                  </span>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={soldOut || qty <= 0}
              onClick={addToCart}
              data-testid="button-add-to-cart"
            >
              {soldOut ? "품절" : "장바구니에 담기"}
            </Button>
          </div>
        </aside>
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-4 border-b border-border py-3">
      <dt className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground" data-testid={`field-${label}`}>{value}</dd>
    </div>
  );
}

// 산미/바디: 1~5 점수를 채워진/빈 점으로 표시. 값이 없거나 범위를 벗어나면 표시 안 함.
function RatingField({ label, value }: { label: string; value?: string }) {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n < 1 || n > 5) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-4 border-b border-border py-3">
      <dt className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5" data-testid={`field-${label}`}>
        <span className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${i <= n ? "bg-foreground" : "bg-border"}`}
            />
          ))}
        </span>
        <span className="text-xs text-muted-foreground tabular">{n} / 5</span>
      </dd>
    </div>
  );
}

// B-1 강화 필드를 dl 안에 렌더 (양식 공통)
function EnrichedFields({ detail }: { detail: ProductDetail }) {
  const d = detail as ProductDetail & {
    tastingNotes?: string;
    acidity?: string;
    body?: string;
    brewMethods?: string;
    originProcess?: string;
  };
  return (
    <>
      <Field label="맛노트" value={d.tastingNotes} />
      <Field label="원산지·가공" value={d.originProcess} />
    </>
  );
}

// 권장 레시피 한 줄 (값 없으면 표시 안 함)
function RecipeRow({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="grid grid-cols-[130px_1fr] items-baseline gap-3 border-b border-border py-2">
      <dt className="font-ui text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground" data-testid={`recipe-${label}`}>{value}</dd>
    </div>
  );
}

// 권장 레시피 섹션 — recipeType(에스프레소/필터 중 택1)에 따라 해당 유형만 표시
function RecipeSection({ detail }: { detail: ProductDetail }) {
  const d = detail as ProductDetail & {
    recipeType?: string;
    espBasket?: string; espTemp?: string; espDose?: string; espYield?: string; espTime?: string;
    filDripper?: string; filPaper?: string; filDose?: string; filGrind?: string; filWater?: string; filTemp?: string; filTime?: string;
  };
  const isEsp = d.recipeType === "espresso" && [d.espBasket, d.espTemp, d.espDose, d.espYield, d.espTime].some((v) => v && v.trim());
  const isFil = d.recipeType === "filter" && [d.filDripper, d.filPaper, d.filDose, d.filGrind, d.filWater, d.filTemp, d.filTime].some((v) => v && v.trim());
  if (!isEsp && !isFil) return null;
  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="mb-4 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">권장 레시피</h3>
      {isEsp && (
        <div className="max-w-md">
          <h4 className="mb-2 font-display text-sm font-semibold text-foreground">에스프레소</h4>
          <dl>
            <RecipeRow label="포터필터 바스켓" value={d.espBasket} />
            <RecipeRow label="Temperature" value={d.espTemp} />
            <RecipeRow label="Dose" value={d.espDose} />
            <RecipeRow label="Yield" value={d.espYield} />
            <RecipeRow label="Time" value={d.espTime} />
          </dl>
        </div>
      )}
      {isFil && (
        <div className="max-w-md">
          <h4 className="mb-2 font-display text-sm font-semibold text-foreground">필터</h4>
          <dl>
            <RecipeRow label="Dripper" value={d.filDripper} />
            <RecipeRow label="필터" value={d.filPaper} />
            <RecipeRow label="Dose" value={d.filDose} />
            <RecipeRow label="Ground Size (EK43 기준)" value={d.filGrind} />
            <RecipeRow label="Water" value={d.filWater} />
            <RecipeRow label="Temperature" value={d.filTemp} />
            <RecipeRow label="Time" value={d.filTime} />
          </dl>
        </div>
      )}
    </div>
  );
}

function DetailFields({
  template,
  detail,
  origin,
}: {
  template: "blend" | "single";
  detail: ProductDetail | null;
  origin: string;
}) {
  // detail이 없거나 template이 일치하지 않으면 origin만 표시
  if (!detail || detail.template !== template) {
    return (
      <section>
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-foreground">상품 정보</h2>
        <p className="mt-4 text-xs text-muted-foreground">
          관리자가 상세 정보를 등록하면 이곳에 더 자세한 내용이 표시됩니다.
        </p>
      </section>
    );
  }

  if (template === "blend") {
    const d = detail as Extract<ProductDetail, { template: "blend" }>;
    return (
      <section>
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-foreground">블렌드 정보</h2>
        <dl>
          <Field label="블렌드 구성" value={d.blendRatio} />
          <Field label="향미 노트" value={d.flavorNotes} />
          <Field label="로스팅 레벨" value={d.roastLevel} />
          <EnrichedFields detail={d} />
        </dl>
        <RecipeSection detail={d} />
      </section>
    );
  }

  const d = detail as Extract<ProductDetail, { template: "single" }>;
  return (
    <section>
      <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-foreground">싱글 오리진 정보</h2>
      <dl>
        <Field label="국가" value={d.country} />
        <Field label="지역" value={d.region} />
        <Field label="농장" value={d.farm} />
        <Field label="품종" value={d.variety} />
        <Field label="가공 방식" value={d.process} />
        <Field label="고도" value={d.altitude} />
        <Field label="향미 노트" value={d.flavorNotes} />
        <Field label="로스팅 레벨" value={d.roastLevel} />
        <EnrichedFields detail={d} />
      </dl>
      <RecipeSection detail={d} />
    </section>
  );
}
