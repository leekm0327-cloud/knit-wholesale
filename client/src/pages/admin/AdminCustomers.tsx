import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { won, fmtDate, PAYMENT_LABEL } from "@/lib/format";
import type { PublicCustomer, Order, OrderItem } from "@shared/schema";
import { Building2, FileText } from "lucide-react";

export default function AdminCustomers() {
  const [, navigate] = useLocation();
  const { data: customers, isLoading } = useQuery<PublicCustomer[]>({ queryKey: ["/api/admin/customers"] });
  const [detailId, setDetailId] = useState<number | null>(null);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display mb-1 text-xl font-semibold text-foreground">거래처 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">가입한 거래처 목록과 상세 정보입니다.</p>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : !customers || customers.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">등록된 거래처가 없습니다.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customers.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer p-5 hover-elevate"
                onClick={() => setDetailId(c.id)}
                data-testid={`card-customer-${c.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{c.businessName}</span>
                  <Badge variant="secondary" className="text-[11px]">{PAYMENT_LABEL[c.paymentMethod]}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div>담당자 {c.managerName} · {c.phone}</div>
                  <div className="truncate">{c.email}</div>
                  <div className="truncate">{c.defaultAddress || "배송지 미등록"}</div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">가입일 {fmtDate(c.createdAt)}</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CustomerDetail id={detailId} onClose={() => setDetailId(null)} onOpenOrder={(oid) => { setDetailId(null); navigate(`/admin/orders/${oid}`); }} />
    </AdminLayout>
  );
}

function CustomerDetail({ id, onClose, onOpenOrder }: { id: number | null; onClose: () => void; onOpenOrder: (oid: number) => void }) {
  const { data, isLoading } = useQuery<{ customer: PublicCustomer; orders: Order[] }>({
    queryKey: ["/api/admin/customers", id],
    enabled: id != null,
  });

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.customer.businessName ?? "거래처 상세"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Row label="담당자" value={data.customer.managerName} />
              <Row label="연락처" value={data.customer.phone} />
              <Row label="사업자번호" value={data.customer.bizRegNo || "-"} />
              <Row label="결제방식" value={PAYMENT_LABEL[data.customer.paymentMethod]} />
              <Row label="세금계산서" value={data.customer.taxEmail || "-"} />
              <Row label="로그인 이메일" value={data.customer.email} />
            </div>
            <Row label="기본 배송지" value={data.customer.defaultAddress || "-"} />

            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">주문 내역 ({data.orders.length}건)</div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {data.orders.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">주문 없음</div>
                ) : (
                  data.orders.map((o) => {
                    const items: OrderItem[] = JSON.parse(o.items);
                    return (
                      <button
                        key={o.id}
                        onClick={() => onOpenOrder(o.id)}
                        className="flex w-full items-center justify-between rounded-md border p-3 text-left hover-elevate"
                        data-testid={`button-customer-order-${o.id}`}
                      >
                        <div className="min-w-0">
                          <div className="font-display text-xs font-semibold tabular text-foreground">{o.orderNo}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {items[0].name}{items.length > 1 ? ` 외 ${items.length - 1}건` : ""} · {fmtDate(o.createdAt)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-semibold tabular text-foreground">{won(o.totalAmount)}</span>
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-sm text-foreground">{value}</div>
    </div>
  );
}
