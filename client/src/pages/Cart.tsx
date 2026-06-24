import { useState } from "react";
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
import { errMsg, won, weightLabel, CATEGORY_LABEL } from "@/lib/format";
import type { Order } from "@shared/schema";
import { Plus, Minus, Trash2, ShoppingBag, Loader2, ArrowLeft } from "lucide-react";

export default function Cart() {
  const { items, setQty, remove, clear, supplyAmount } = useCart();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [desiredDate, setDesiredDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const vat = Math.round(supplyAmount * 0.1);
  const total = supplyAmount + vat;

  async function submitOrder() {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/orders", {
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          category: i.category,
          weight: i.weight,
          unitPrice: i.unitPrice,
          qty: i.qty,
          amount: i.unitPrice * i.qty,
        })),
        desiredDate,
        note,
      });
      const order: Order = await res.json();
      clear();
      navigate(`/invoice/${order.id}`);
    } catch (err: any) {
      toast({ title: "주문 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <button
          onClick={() => navigate("/catalog")}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          data-testid="link-back-catalog"
        >
          <ArrowLeft className="h-4 w-4" /> 카탈로그로 돌아가기
        </button>
        <h1 className="font-display mb-6 text-xl font-semibold text-foreground">장바구니</h1>

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
                  key={`${i.productId}-${i.weight}`}
                  className="flex items-center gap-3 p-4"
                  data-testid={`row-cart-${i.productId}-${i.weight}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{i.name}</span>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                        {CATEGORY_LABEL[i.category]}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {weightLabel(i.weight)} · 단가 {won(i.unitPrice)}
                    </div>
                  </div>

                  <div className="flex items-center rounded-md border">
                    <button
                      onClick={() => setQty(i.productId, i.weight, i.qty - 1)}
                      className="px-2 py-1.5 text-muted-foreground hover-elevate"
                      aria-label="수량 감소"
                      data-testid={`button-cart-minus-${i.productId}-${i.weight}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular">{i.qty}</span>
                    <button
                      onClick={() => setQty(i.productId, i.weight, i.qty + 1)}
                      className="px-2 py-1.5 text-muted-foreground hover-elevate"
                      aria-label="수량 증가"
                      data-testid={`button-cart-plus-${i.productId}-${i.weight}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="w-24 text-right text-sm font-semibold tabular text-foreground">
                    {won(i.unitPrice * i.qty)}
                  </div>

                  <button
                    onClick={() => remove(i.productId, i.weight)}
                    className="rounded-md p-1.5 text-muted-foreground hover-elevate"
                    aria-label="삭제"
                    data-testid={`button-cart-remove-${i.productId}-${i.weight}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}

              <Card className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="desiredDate" className="text-xs">희망 납품일</Label>
                  <Input
                    id="desiredDate"
                    type="date"
                    value={desiredDate}
                    onChange={(e) => setDesiredDate(e.target.value)}
                    data-testid="input-desiredDate"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note" className="text-xs">요청사항</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="예: 홀빈으로 주세요 / 오전 배송 희망 등"
                    rows={3}
                    data-testid="input-note"
                  />
                </div>
              </Card>
            </div>

            {/* 요약 */}
            <div>
              <Card className="sticky top-24 space-y-4 p-5">
                <h2 className="text-sm font-semibold text-foreground">주문 요약</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>공급가액</span>
                    <span className="tabular text-foreground">{won(supplyAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>부가세 (10%)</span>
                    <span className="tabular text-foreground">{won(vat)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <span className="text-foreground">합계</span>
                    <span className="tabular text-accent" data-testid="text-cart-total">{won(total)}</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={submitOrder}
                  disabled={loading}
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
