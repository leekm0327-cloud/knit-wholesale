import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { won, fmtDate } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";
import { CheckCircle2, RotateCcw, Plus } from "lucide-react";

const DAY = 1000 * 60 * 60 * 24;

export default function AdminOrders() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    refetchInterval: 30000,
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [quickOnly, setQuickOnly] = useState(false);
  const [sampleOnly, setSampleOnly] = useState(false);

  async function toggleStatus(o: Order) {
    const next = o.status === "pending" ? "done" : "pending";
    await apiRequest("PATCH", `/api/admin/orders/${o.id}`, { status: next });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  }

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return orders.filter((o) => {
      // 퀵 요청만 보기
      if (quickOnly && o.quickRequest !== 1) return false;
      // 샘플 주문만 보기
      if (sampleOnly && o.isSample !== 1) return false;
      // 검색: 주문번호 + 상품명 + 거래처명
      if (q) {
        const inOrderNo = o.orderNo.toLowerCase().includes(q);
        let inItems = false;
        try {
          const items: OrderItem[] = JSON.parse(o.items);
          inItems = items.some((it) => it.name.toLowerCase().includes(q));
        } catch {
          inItems = false;
        }
        let inCustomer = false;
        try {
          const snap = JSON.parse(o.customerSnapshot);
          inCustomer = String(snap.businessName ?? "").toLowerCase().includes(q);
        } catch {
          inCustomer = false;
        }
        if (!inOrderNo && !inItems && !inCustomer) return false;
      }
      // 상태
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      // 기간
      if (dateRange === "1w" && o.createdAt < now - 7 * DAY) return false;
      if (dateRange === "1m" && o.createdAt < now - 30 * DAY) return false;
      if (dateRange === "3m" && o.createdAt < now - 90 * DAY) return false;
      if (dateRange === "custom") {
        if (fromDate) {
          const fromTs = new Date(fromDate + "T00:00:00").getTime();
          if (!Number.isNaN(fromTs) && o.createdAt < fromTs) return false;
        }
        if (toDate) {
          const toTs = new Date(toDate + "T23:59:59").getTime();
          if (!Number.isNaN(toTs) && o.createdAt > toTs) return false;
        }
      }
      return true;
    });
  }, [orders, query, statusFilter, dateRange, fromDate, toDate, quickOnly, sampleOnly]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Orders</div>
            <h1 className="font-display mt-1 text-xl font-semibold text-foreground">주문 관리</h1>
          </div>
          <Button onClick={() => navigate("/admin/orders/new")} data-testid="button-admin-order-new">
            <Plus className="mr-1.5 h-4 w-4" />
            대리 주문 입력
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="주문번호, 상품명, 거래처명 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
            data-testid="input-admin-order-search"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32" data-testid="select-admin-order-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">접수</SelectItem>
              <SelectItem value="done">처리완료</SelectItem>
              <SelectItem value="cancelled">취소됨</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32" data-testid="select-admin-order-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기간</SelectItem>
              <SelectItem value="1w">최근 1주</SelectItem>
              <SelectItem value="1m">최근 1개월</SelectItem>
              <SelectItem value="3m">최근 3개월</SelectItem>
              <SelectItem value="custom">직접 설정</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-[150px]"
                data-testid="input-admin-order-from"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-[150px]"
                data-testid="input-admin-order-to"
              />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 pl-1 text-sm text-muted-foreground">
            <Checkbox
              checked={quickOnly}
              onCheckedChange={(v) => setQuickOnly(v === true)}
              data-testid="checkbox-quick-only"
            />
            퀵 요청만 보기
          </label>
          <label className="flex cursor-pointer items-center gap-2 pl-1 text-sm text-muted-foreground">
            <Checkbox
              checked={sampleOnly}
              onCheckedChange={(v) => setSampleOnly(v === true)}
              data-testid="checkbox-sample-only"
            />
            샘플 주문만 보기
          </label>
        </div>

        <Card className="overflow-hidden">
          {isLoading || !orders ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {orders.length === 0 ? "주문 없음" : "조건에 맞는 주문이 없습니다."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((o) => {
                const items: OrderItem[] = JSON.parse(o.items);
                let snap: any = {};
                try { snap = JSON.parse(o.customerSnapshot); } catch { snap = {}; }
                const cancelled = o.status === "cancelled";
                return (
                  <div
                    key={o.id}
                    className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${cancelled ? "opacity-50 grayscale" : ""}`}
                    data-testid={`row-admin-order-${o.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {cancelled ? (
                        <Badge className="shrink-0 bg-gray-200 text-[11px] text-gray-500 hover:bg-gray-200">취소됨</Badge>
                      ) : o.status === "done" ? (
                        <Badge variant="secondary" className="shrink-0 text-[11px]">처리완료</Badge>
                      ) : (
                        <Badge className="shrink-0 bg-destructive text-[11px] text-destructive-foreground hover:bg-destructive">미처리</Badge>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-sm font-semibold tabular text-foreground">{o.orderNo}</span>
                          <span className="truncate text-sm text-muted-foreground">{snap.businessName}</span>
                          {o.quickRequest === 1 && (
                            <Badge variant="outline" className="shrink-0 border-foreground text-[10px] text-foreground">퀵</Badge>
                          )}
                          {o.isSample === 1 && (
                            <Badge className="shrink-0 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">샘플</Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {items[0]?.name}{items.length > 1 ? ` 외 ${items.length - 1}건` : ""} · {fmtDate(o.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular text-foreground">{won(o.totalAmount)}</span>
                      {!cancelled && (
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(o)} data-testid={`button-admin-toggle-${o.id}`} title="상태 토글">
                          {o.status === "pending" ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/orders/${o.id}`)} data-testid={`button-admin-detail-${o.id}`}>
                        상세
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
