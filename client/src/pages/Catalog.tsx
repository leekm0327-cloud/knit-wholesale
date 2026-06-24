import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import {
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  won,
  weightLabel,
  parsePrices,
  WEIGHT_OPTIONS,
} from "@/lib/format";
import type { Product } from "@shared/schema";
import { Plus, Minus, Check } from "lucide-react";
import heroImg from "@/assets/hero-beans.png";

const CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "blend", label: "블렌드" },
  { key: "decaf", label: "디카페인" },
  { key: "single", label: "싱글 오리진" },
];

export default function Catalog() {
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const [tab, setTab] = useState("all");

  const filtered = (products ?? []).filter((p) => tab === "all" || p.category === tab);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* 히어로 */}
      <div className="relative overflow-hidden border-b">
        <img
          src={heroImg}
          alt="니트커피 원두"
          className="absolute inset-0 h-full w-full object-cover"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(25_35%_15%/0.88)] via-[hsl(25_35%_18%/0.7)] to-[hsl(25_35%_20%/0.35)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <Badge className="mb-3 bg-accent text-accent-foreground hover:bg-accent">
            Knit Coffee · 클라리멘토 OEM
          </Badge>
          <h1 className="font-display max-w-xl text-2xl font-semibold leading-snug text-white sm:text-3xl">
            한 땀 한 땀, 정성껏 볶은 도매 원두
          </h1>
          <p className="mt-3 max-w-lg text-sm text-white/85 sm:text-base">
            품목과 수량만 담으면 거래명세서와 입금 계좌가 자동으로 정리됩니다.
            매장에서 폰으로도 빠르게 발주하세요.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* 카테고리 탭 */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              data-testid={`tab-${c.key}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover-elevate"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            해당 카테고리에 판매 중인 상품이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { toast } = useToast();
  const prices = parsePrices(product.prices);
  const weights = WEIGHT_OPTIONS.filter((w) => prices[String(w)] != null);
  const [weight, setWeight] = useState(weights[0] ?? 200);
  const [qty, setQty] = useState(1);
  const soldOut = product.available === 0;
  const chip = CATEGORY_COLOR[product.category];
  const unitPrice = prices[String(weight)] ?? 0;

  function addToCart() {
    add(
      {
        productId: product.id,
        name: product.name,
        category: product.category,
        weight,
        unitPrice,
      },
      qty,
    );
    toast({ title: "장바구니 담기", description: `${product.name} ${weightLabel(weight)} × ${qty}` });
    setQty(1);
  }

  return (
    <Card
      className={`flex flex-col overflow-hidden p-5 ${soldOut ? "opacity-60" : ""}`}
      data-testid={`card-product-${product.id}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: `hsl(${chip})` }}
        >
          {CATEGORY_LABEL[product.category]}
        </span>
        {soldOut ? (
          <Badge variant="secondary" className="text-[11px]">품절</Badge>
        ) : (
          <Badge variant="outline" className="border-accent/40 text-[11px] text-accent">판매중</Badge>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug text-foreground" data-testid={`text-name-${product.id}`}>
        {product.name}
      </h3>
      <p className="mt-1.5 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
        {product.origin}
      </p>

      {/* 중량 선택 */}
      <div className="mt-4 flex gap-1.5">
        {weights.map((w) => (
          <button
            key={w}
            disabled={soldOut}
            onClick={() => setWeight(w)}
            data-testid={`button-weight-${product.id}-${w}`}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              weight === w
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover-elevate"
            }`}
          >
            {weightLabel(w)}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground">단가</span>
        <span className="font-display text-lg font-semibold text-foreground tabular" data-testid={`text-price-${product.id}`}>
          {won(unitPrice)}
        </span>
      </div>

      {/* 수량 + 담기 */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex items-center rounded-md border">
          <button
            disabled={soldOut}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="px-2.5 py-2 text-muted-foreground hover-elevate disabled:opacity-40"
            aria-label="수량 감소"
            data-testid={`button-qty-minus-${product.id}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular" data-testid={`text-qty-${product.id}`}>{qty}</span>
          <button
            disabled={soldOut}
            onClick={() => setQty((q) => q + 1)}
            className="px-2.5 py-2 text-muted-foreground hover-elevate disabled:opacity-40"
            aria-label="수량 증가"
            data-testid={`button-qty-plus-${product.id}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button
          className="flex-1"
          disabled={soldOut}
          onClick={addToCart}
          data-testid={`button-add-${product.id}`}
        >
          {soldOut ? "품절" : (<><Plus className="mr-1 h-4 w-4" />담기</>)}
        </Button>
      </div>
    </Card>
  );
}
