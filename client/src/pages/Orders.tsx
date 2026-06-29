import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { won, fmtDate } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";
import { FileText, ClipboardList } from "lucide-react";

const DAY = 1000 * 60 * 60 * 24;

export default function Orders() {
  const [, navigate] = useLocation();
  const { data: orders, isLoading } = useQuery<Order[]>({ queryKey: ["/api/orders/mine"] });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return orders.filter((o) => {
      // 검색: 주문번호 또는 상품명
      if (q) {
        const inOrderNo = o.orderNo.toLowerCase().includes(q);
        let inItems = false;
        try {
          const items: OrderItem[] = JSON.parse(o.items);
          inItems = items.some((it) => it.name.toLowerCase().includes(q));
        } catch {
          inItems = false;
        }
        if (!inOrderNo && !inItems) return false;
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
  }, [orders, query, statusFilter, dateRange, fromDate, toDate]);

  const hasOrders = !!orders && orders.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div className="eyebrow">Order history</div>
          <h1 className="font-display mt-1 text-xl font-semibold text-foreground">주문 내역</h1>
        </div>

        {hasOrders && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              placeholder="주문번호, 상품명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-xs"
              data-testid="input-order-search"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32" data-testid="select-order-status">
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
              <SelectTrigger className="w-32" data-testid="select-order-range">
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
                  data-testid="input-order-from"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-order-to"
                />
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-none" />
            ))}
          </div>
        ) : !hasOrders ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">아직 주문 내역이 없습니다.</p>
            <Button onClick={() => navigate("/catalog")}>상품 보러가기</Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">조건에 맞는 주문이 없습니다.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((o) => {
              const items: OrderItem[] = JSON.parse(o.items);
              const summary =
                items.length === 1
                  ? items[0].name
                  : `${items[0].name} 외 ${items.length - 1}건`;
              const cancelled = o.status === "cancelled";
              return (
                <Card
                  key={o.id}
                  className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${cancelled ? "opacity-50 grayscale" : ""}`}
                  data-testid={`row-order-${o.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold tabular text-foreground">
                        {o.orderNo}
                      </span>
                      {cancelled ? (
                        <Badge className="bg-gray-200 text-[11px] text-gray-500 hover:bg-gray-200">취소됨</Badge>
                      ) : o.status === "done" ? (
                        <Badge variant="secondary" className="text-[11px]">처리완료</Badge>
                      ) : (
                        <Badge className="bg-foreground text-[11px] text-background hover:bg-foreground">접수됨</Badge>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">{summary}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(o.createdAt)} · 합계 <span className="font-medium text-foreground">{won(o.totalAmount)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/orders/${o.id}`)}
                    data-testid={`button-view-order-${o.id}`}
                    className="shrink-0"
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    상세 보기
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
