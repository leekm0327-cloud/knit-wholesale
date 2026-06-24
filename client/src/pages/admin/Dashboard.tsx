import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { won, wonNum, fmtDate } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart,
  Clock,
  Building2,
  Coins,
  Bell,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  totalOrders: number;
  pendingOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  monthly: { month: string; revenue: number }[];
  customerStats: { id: number; businessName: string; managerName: string; orders: number; revenue: number }[];
}

export default function Dashboard() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 30000,
  });
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    refetchInterval: 30000,
  });

  // 브라우저 알림 (신규 주문 감지)
  const seenIds = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!orders) return;
    const pendingIds = orders.filter((o) => o.status === "pending").map((o) => o.id);
    if (seenIds.current === null) {
      seenIds.current = new Set(orders.map((o) => o.id));
      return;
    }
    const newOnes = orders.filter((o) => !seenIds.current!.has(o.id));
    if (newOnes.length > 0) {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("니트커피 · 신규 주문", {
            body: `${newOnes.length}건의 새 주문이 접수되었습니다.`,
          });
        } catch {}
      }
      toast({ title: "신규 주문", description: `${newOnes.length}건의 새 주문이 접수되었습니다.` });
    }
    orders.forEach((o) => seenIds.current!.add(o.id));
  }, [orders, toast]);

  async function toggleStatus(o: Order) {
    const next = o.status === "pending" ? "done" : "pending";
    await apiRequest("PATCH", `/api/admin/orders/${o.id}`, { status: next });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
  }

  const chartData = (stats?.monthly ?? []).map((m) => ({
    month: m.month.slice(2).replace("-", "."),
    revenue: Math.round(m.revenue / 1000),
  }));

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">대시보드</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">니트커피 도매 주문 현황</p>
          </div>
          {stats && stats.pendingOrders > 0 && (
            <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent" data-testid="badge-pending">
              <Bell className="h-3.5 w-3.5" />
              신규/미처리 {stats.pendingOrders}건
            </Badge>
          )}
        </div>

        {/* KPI */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={ShoppingCart} label="총 주문" value={isLoading ? "" : String(stats!.totalOrders)} loading={isLoading} />
          <Kpi icon={Clock} label="미처리 주문" value={isLoading ? "" : String(stats!.pendingOrders)} accent loading={isLoading} />
          <Kpi icon={Building2} label="거래처 수" value={isLoading ? "" : String(stats!.totalCustomers)} loading={isLoading} />
          <Kpi icon={Coins} label="누적 매출" value={isLoading ? "" : won(stats!.totalRevenue)} loading={isLoading} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* 월별 매출 차트 */}
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">월별 매출 (천원)</h2>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(v: number) => [`${wonNum(v)}천원`, "매출"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[5, 5, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* 거래처별 누적 */}
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">거래처별 누적</h2>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-3">
                {stats!.customerStats.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2" data-testid={`stat-customer-${c.id}`}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{c.businessName}</div>
                      <div className="text-xs text-muted-foreground">{c.orders}건 주문</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold tabular text-foreground">{won(c.revenue)}</div>
                  </div>
                ))}
                {stats!.customerStats.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">거래처 없음</div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* 최근 주문 */}
        <Card className="mt-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">최근 주문</h2>
          </div>
          {!orders ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">주문 없음</div>
          ) : (
            <div className="divide-y">
              {orders.slice(0, 10).map((o) => {
                const items: OrderItem[] = JSON.parse(o.items);
                const snap = JSON.parse(o.customerSnapshot);
                return (
                  <div key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-order-${o.id}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      {o.status === "done" ? (
                        <Badge variant="secondary" className="shrink-0 text-[11px]">처리완료</Badge>
                      ) : (
                        <Badge className="shrink-0 bg-accent text-[11px] text-accent-foreground hover:bg-accent">미처리</Badge>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold tabular text-foreground">{o.orderNo}</span>
                          <span className="truncate text-sm text-muted-foreground">{snap.businessName}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {items[0].name}{items.length > 1 ? ` 외 ${items.length - 1}건` : ""} · {fmtDate(o.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular text-foreground">{won(o.totalAmount)}</span>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(o)} data-testid={`button-toggle-${o.id}`} title="상태 토글">
                        {o.status === "pending" ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/orders/${o.id}`)} data-testid={`button-detail-${o.id}`}>
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

function Kpi({ icon: Icon, label, value, accent, loading }: { icon: any; label: string; value: string; accent?: boolean; loading?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : ""}`} />
        <span className="text-xs">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className={`mt-1.5 font-display text-xl font-semibold tabular ${accent ? "text-accent" : "text-foreground"}`}>{value}</div>
      )}
    </Card>
  );
}
