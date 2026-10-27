import {CustomerShipping} from '@/components/CustomerShipping';
import type {CustomerShipping as Shipping} from '@shared/shipping';
import "./order-history.css";
import { LoadError } from "@/components/LoadError";
import { fmtDate, won } from "@/lib/format";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Invoice } from "@/components/Invoice";
import { OrderItemsEditor } from "@/components/OrderItemsEditor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { reorderItems } from "@/lib/reorder";
import type { Order, OrderItem, Product } from "@shared/schema";
import { ArrowLeft, Pencil, XCircle, FileText, Loader2, RotateCcw } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "접수",
  done: "처리완료",
  cancelled: "취소됨",
};

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: order, isLoading, isError, refetch } = useQuery<Order & {shipping?:Shipping|null}>({
    queryKey: ["/api/orders", id],
    enabled: !!id, refetchInterval: 15000, refetchOnWindowFocus: true, staleTime: 0,
  });

  // #2 이전 주문 다시 담기 — 현재 상품 정보(가격/품절) 기준으로 담기 위해 상품 목록 조회
  const { data: products, isLoading: productsLoading, isFetching: productsFetching, isError: productsError, refetch: retryProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { add } = useCart();
  const reordering = useRef(false);

  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // #2 이전 주문 품목을 장바구니에 다시 담기 (카탈로그의 '지난 주문 그대로 담기'와 같은 규칙)
  function reorder() {
    if (!order || isError || productsFetching || productsError || !products || reordering.current) return;
    reordering.current = true;
    const r = reorderItems(order, products, add);
    if (!r) {
      reordering.current = false;
      toast({ title: "불러오기 실패", description: "주문 품목을 읽을 수 없습니다.", variant: "destructive" });
      return;
    }
    if (r.added === 0) {
      reordering.current = false;
      toast({ title: "담을 수 있는 품목이 없습니다", description: "주문 품목이 모두 품절이거나 판매 종료되었습니다.", variant: "destructive" });
      return;
    }
    toast({
      title: "장바구니에 담았습니다",
      description: `${r.added}개 품목을 다시 담았습니다.` + (r.skipped.length > 0 ? ` (품절/종료 제외: ${r.skipped.join(", ")})` : ""),
    });
    navigate("/cart");
  }

  async function doCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await apiRequest("POST", `/api/orders/${id}/cancel`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/mine"] });
      toast({ title: "주문이 취소되었습니다." });
      setConfirmCancel(false);
    } catch (err: any) {
      toast({ title: "취소 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="order-history order-detail min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate("/orders")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back-orders"
          >
            <ArrowLeft className="h-4 w-4" /> 주문 내역
          </button>
          {order && !isError && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={reorder}
                disabled={productsFetching || productsError || !products}
                data-testid="button-reorder"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> {productsFetching ? "상품 정보 확인 중" : "이 주문 다시 담기"}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/invoice/${order.id}`)}
                data-testid="button-view-invoice"
              >
                <FileText className="mr-1.5 h-4 w-4" /> 거래명세서 보기
              </Button>
            </div>
          )}
        </div>

        {isError ? (<LoadError onRetry={() => refetch()} title="주문을 불러오지 못했습니다." />) : isLoading || !order ? (
          <Skeleton className="h-[500px] w-full rounded-none" />
        ) : (
          <>
            {productsError && <div className="reorder-error" role="alert">상품 정보를 불러오지 못했습니다. 다시 담기는 잠시 사용할 수 없습니다.<button disabled={productsFetching} data-testid="button-retry-products" onClick={() => retryProducts()}>다시 시도</button></div>}
            <Card className="order-summary mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-semibold tabular text-foreground">
                    {fmtDate(order.createdAt)} · {order.orderNo}
                  </span>
                  {order.status === "cancelled" ? (
                    <Badge className="bg-gray-200 text-[11px] text-gray-500 hover:bg-gray-200">
                      취소됨
                    </Badge>
                  ) : order.status === "done" ? (
                    <Badge variant="secondary" className="text-[11px]">처리완료</Badge>
                  ) : (
                    <Badge className="bg-foreground text-[11px] text-background hover:bg-foreground">
                      접수됨
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {STATUS_LABEL[order.status] ?? order.status} · 합계{" "}
                  {new Intl.NumberFormat("ko-KR").format(order.totalAmount)}원
                  {order.desiredDate ? ` · 희망 배송일 ${order.desiredDate}` : ""}
                </p>
              </div>

              {/* pending 상태일 때만 수정/취소 버튼 노출 */}
              {order.status === "pending" && !editing && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-order">
                    <Pencil className="mr-1.5 h-4 w-4" /> 주문 수정
                  </Button>
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/5"
                    onClick={() => setConfirmCancel(true)}
                    data-testid="button-cancel-order"
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> 주문 취소
                  </Button>
                </div>
              )}
            </Card>

            <CustomerShipping shipping={order.shipping} />
            {editing ? (
              <OrderItemsEditor
                order={order}
                mode="customer"
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className={order.status === "cancelled" ? "opacity-50 grayscale" : ""}>
                <section className="order-quick" aria-label="주문 상품"><h2>주문 상품 <span className="text-xs text-muted-foreground">· 금액은 공급가 기준</span></h2>{(JSON.parse(order.items) as OrderItem[]).map((it,i)=><div className="quick-item" key={i}><span>{it.name}</span><strong>{it.qty} EA</strong><span>{won(it.amount)}</span></div>)}<div className="quick-total"><span>주문 합계 <span className="text-xs text-muted-foreground">(부가세 포함)</span></span><strong>{won(order.totalAmount)}</strong></div><p>다시 담기는 현재 판매 상품과 적용 단가를 기준으로 합니다.</p></section><details className="invoice-fold"><summary>배송 정보 · 요청사항 · 거래명세서</summary><Invoice order={order} /></details>
              </div>
            )}
          </>
        )}
      </main>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              취소된 주문은 되돌릴 수 없습니다. 계속 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doCancel();
              }}
              disabled={cancelling}
              data-testid="button-confirm-cancel"
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              주문 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
