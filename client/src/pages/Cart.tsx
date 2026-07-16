import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { apiRequest } from "@/lib/queryClient";
import { errMsg, won, CATEGORY_LABEL } from "@/lib/format";
import type { Order } from "@shared/schema";
import { Plus, Minus, Trash2, ShoppingBag, Loader2, ArrowLeft } from "lucide-react";

export default function Cart() {
  const { items, setQty, remove, clear, supplyAmount } = useCart();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [quickRequest, setQuickRequest] = useState(false);
  const [loading, setLoading] = useState(false);

  const vat = Math.round(supplyAmount * 0.1);
  const total = supplyAmount + vat;

  // 카테고리(원두 여부)·상품(최소수량)은 서버 기준을 그대로 따른다.
  const { data: categoryRows } = useQuery<any[]>({ queryKey: ["/api/product-categories"] });
  const { data: productRows } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const beanKeys = new Set(
    (categoryRows && categoryRows.length > 0
      ? categoryRows.filter((c) => c.isBean).map((c) => c.key)
      : ["blend", "decaf", "single", "single_espresso", "single_filter"]),
  );
  const minMap = new Map<number, number>((productRows ?? []).map((p) => [p.id, p.minOrderQty ?? 0]));

  // A-4: 원두 수량 합 최소 5kg(5개) 검증 (원두 = 카테고리 관리의 isBean)
  const beanQty = items
    .filter((i) => beanKeys.has(i.category))
    .reduce((s, i) => s + i.qty, 0);
  const belowMin = beanQty > 0 && beanQty < 5;

  // 상품별 최소 주문 수량 위반 목록
  const minViolations = items
    .map((i) => ({ name: i.name, qty: i.qty, min: minMap.get((i as any).productId) ?? 0 }))
    .filter((v) => v.min > 0 && v.qty > 0 && v.qty < v.min);
  const blocked = belowMin || minViolations.length > 0;

  async function submitOrder() {
    if (items.length === 0) return;
    if (belowMin) {
      toast({
        title: "주문 불가",
        description: "원두는 최소 5kg(수량 5개)부터 주문 가능합니다.",
        variant: "destructive",
      });
      return;
    }
    if (minViolations.length > 0) {
      const v = minViolations[0];
      toast({
        title: "주문 불가",
        description: `'${v.name}'은(는) 최소 ${v.min}개부터 주문 가능합니다.`,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/orders", {
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          category: i.category,
          unitPrice: i.unitPrice,
          qty: i.qty,
          amount: i.unitPrice * i.qty,
        })),
        desiredDate: "",
        note,
        quickRequest: quickRequest,
      });
      const result = await res.json();
      clear();
      if (result.merged) {
        toast({
          title: "주문에 추가되었습니다",
          description: `오늘 접수 중인 주문에 추가되었습니다 (#${result.orderNo ?? result.orderId})`,
        });
      }
      navigate(`/invoice/${result.id ?? result.orderId}`);
    } catch (err: any) {
      toast({ title: "주문 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-10">
        <button
          onClick={() => navigate("/catalog")}
          className="mb-5 flex items-center gap-1.5 font-ui text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          data-testid="link-back-catalog"
        >
          <ArrowLeft className="h-4 w-4" /> 카탈로그
        </button>
        <p className="eyebrow mb-2">Your order</p>
        <h1 className="font-display mb-8 text-3xl font-medium tracking-tight text-foreground">장바구니</h1>

        {items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">장바구니가 비어 있습니다.</p>
            <Button onClick={() => navigate("/catalog")} data-testid="button-go-catalog">
              상품 보러가기
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* 품목 리스트 */}
            <div className="space-y-3">
              {items.map((i) => (
                <Card
                  key={i.productId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  data-testid={`row-cart-${i.productId}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{i.name}</span>
                      <span className="shrink-0 border border-border px-1.5 py-0.5 font-ui text-[10px] tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[i.category]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      단가 {won(i.unitPrice)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="flex items-center border border-border">
                      <button
                        onClick={() => setQty(i.productId, i.qty - 1)}
                        className="px-2 py-1.5 text-muted-foreground hover-elevate"
                        aria-label="수량 감소"
                        data-testid={`button-cart-minus-${i.productId}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular">{i.qty}</span>
                      <button
                        onClick={() => setQty(i.productId, i.qty + 1)}
                        className="px-2 py-1.5 text-muted-foreground hover-elevate"
                        aria-label="수량 증가"
                        data-testid={`button-cart-plus-${i.productId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-24 text-right text-sm font-semibold tabular text-foreground">
                      {won(i.unitPrice * i.qty)}
                    </div>

                    <button
                      onClick={() => remove(i.productId)}
                      className="p-1.5 text-muted-foreground hover-elevate"
                      aria-label="삭제"
                      data-testid={`button-cart-remove-${i.productId}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              ))}

              <Card className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="note" className="text-xs">요청사항</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder=""
                    rows={3}
                    data-testid="input-note"
                  />
                </div>

                {/* 퀵 요청 체크박스 */}
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={quickRequest}
                      onChange={(e) => setQuickRequest(e.target.checked)}
                      className="h-4 w-4 accent-foreground"
                      data-testid="checkbox-quick-request"
                    />
                    퀵 요청
                  </label>
                  <p className="pl-6 text-[11px] leading-relaxed text-muted-foreground">
                    퀵 비용은 착불로 보내지며, 급하신 경우 확인이 늦어질 수 있으니{" "}
                    <a
                      href="http://pf.kakao.com/_xiLQFG/chat"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      카카오톡 채널
                    </a>
                    로 문의주세요.
                  </p>
                </div>
              </Card>
            </div>

            {/* 요약 */}
            <div>
              <Card className="sticky top-24 space-y-4 p-5">
                <h2 className="font-display text-lg font-semibold text-foreground">주문 요약</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>공급가액</span>
                    <span className="tabular text-foreground">{won(supplyAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>부가세 (10%)</span>
                    <span className="tabular text-foreground">{won(vat)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <span className="text-foreground">합계</span>
                    <span className="font-ui tabular text-foreground" data-testid="text-cart-total">{won(total)}</span>
                  </div>
                </div>
                {quickRequest && (
                  <div className="rounded-none border border-amber-300/60 bg-amber-50/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    퀵 요청이 선택되었습니다.
                  </div>
                )}
                {belowMin && (
                  <div className="rounded-none border border-destructive/60 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-min-order-warning">
                    원두는 최소 5kg(수량 5개)부터 주문 가능합니다. 현재 {beanQty}개.
                  </div>
                )}
                {minViolations.map((v) => (
                  <div key={v.name} className="rounded-none border border-destructive/60 bg-destructive/5 px-3 py-2 text-xs text-destructive" data-testid="text-min-item-warning">
                    '{v.name}'은(는) 최소 {v.min}개부터 주문 가능합니다. 현재 {v.qty}개.
                  </div>
                ))}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={submitOrder}
                  disabled={loading || blocked}
                  data-testid="button-submit-order"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  주문하기
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  주문 즉시 거래명세서(인보이스)가 생성되며<br />입금 계좌가 안내됩니다.
                </p>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
