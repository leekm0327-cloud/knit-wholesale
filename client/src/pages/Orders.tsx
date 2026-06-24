import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";
import { FileText, ClipboardList } from "lucide-react";

export default function Orders() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading } = useQuery<Order[]>({ queryKey: ["/api/orders/mine"] });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-display mb-6 text-xl font-semibold text-foreground">주문 내역</h1>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">아직 주문 내역이 없습니다.</p>
            <Button onClick={() => navigate("/catalog")}>상품 보러가기</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const items: OrderItem[] = JSON.parse(o.items);
              const summary =
                items.length === 1
                  ? items[0].name
                  : `${items[0].name} 외 ${items.length - 1}건`;
              return (
                <Card
                  key={o.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`row-order-${o.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold tabular text-foreground">
                        {o.orderNo}
                      </span>
                      {o.status === "done" ? (
                        <Badge variant="secondary" className="text-[11px]">처리완료</Badge>
                      ) : (
                        <Badge className="bg-accent text-[11px] text-accent-foreground hover:bg-accent">접수됨</Badge>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">{summary}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(o.createdAt)} · 합계 <span className="font-medium text-foreground">{won(o.totalAmount)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/invoice/${o.id}`)}
                    data-testid={`button-view-invoice-${o.id}`}
                    className="shrink-0"
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    거래명세서 보기
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
