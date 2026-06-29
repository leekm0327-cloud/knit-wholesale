import { useState } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import type { Order } from "@shared/schema";
import { ArrowLeft, Pencil, XCircle, FileText, Loader2 } from "lucide-react";

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

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", id],
    enabled: !!id,
  });

  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
    <div className="min-h-screen bg-background">
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
          {order && (
            <Button
              variant="outline"
              onClick={() => navigate(`/invoice/${order.id}`)}
              data-testid="button-view-invoice"
            >
              <FileText className="mr-1.5 h-4 w-4" /> 거래명세서 보기
            </Button>
          )}
        </div>

        {isLoading || !order ? (
          <Skeleton className="h-[500px] w-full rounded-none" />
        ) : (
          <>
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-semibold tabular text-foreground">
                    {order.orderNo}
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

            {editing ? (
              <OrderItemsEditor
                order={order}
                mode="customer"
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <div className={order.status === "cancelled" ? "opacity-50 grayscale" : ""}>
                <Invoice order={order} />
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
