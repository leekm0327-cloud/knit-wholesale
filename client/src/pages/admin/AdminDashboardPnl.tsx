import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { won, wonNum } from "@/lib/format";
import type { DashboardSummary, DashboardGranularity } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const GRANULARITY: { key: DashboardGranularity; label: string }[] = [
  { key: "day", label: "일" },
  { key: "week", label: "주" },
  { key: "month", label: "월" },
  { key: "year", label: "연" },
];

// 흑백 톤 팔레트 (사이트 톤 유지)
const PIE_COLORS = ["hsl(0 0% 13%)", "hsl(0 0% 40%)", "hsl(0 0% 62%)", "hsl(0 0% 78%)", "hsl(0 0% 88%)"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// granularity 별 기본 범위 (오늘 기준)
function defaultRange(g: DashboardGranularity): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  const start = new Date(now);
  if (g === "day") start.setDate(now.getDate() - 29);
  else if (g === "week") start.setDate(now.getDate() - 7 * 11);
  else if (g === "month") start.setMonth(now.getMonth() - 11);
  else start.setFullYear(now.getFullYear() - 4);
  return { from: ymd(start), to };
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "pos" | "neg" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-display mt-1 text-lg font-semibold tabular ${
          tone === "neg" ? "text-destructive" : "text-foreground"
        }`}
      >
        {won(value)}
      </p>
    </Card>
  );
}

export default function AdminDashboardPnl() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";

  const [granularity, setGranularity] = useState<DashboardGranularity>("month");
  const init = useMemo(() => defaultRange("month"), []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/admin/dashboard/summary", { from, to, granularity }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/dashboard/summary?from=${from}&to=${to}&granularity=${granularity}`,
      );
      return res.json();
    },
    enabled: isOwner,
  });

  function pickGranularity(g: DashboardGranularity) {
    setGranularity(g);
    const r = defaultRange(g);
    setFrom(r.from);
    setTo(r.to);
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const incomeParts = data
    ? [
        { name: "도매매출", value: data.wholesaleSales },
        { name: "매장매출", value: data.storeSales },
      ].filter((p) => p.value > 0)
    : [];

  const expenseParts = data
    ? data.expenseByCategory.filter((p) => p.amount > 0).map((p) => ({ name: p.category, value: p.amount }))
    : [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Management</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">경영 대시보드</h1>
        <p className="mb-6 text-sm text-muted-foreground">기간별 수입·지출·손익을 한눈에 봅니다.</p>

        {/* 기간 컨트롤 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex gap-1">
              {GRANULARITY.map((g) => (
                <Button
                  key={g.key}
                  variant={granularity === g.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => pickGranularity(g.key)}
                  data-testid={`button-granularity-${g.key}`}
                >
                  {g.label}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-to" />
            </div>
          </div>
        </Card>

        {isLoading || !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi label="총 수입" value={data.totalIncome} />
              <Kpi label="총 지출" value={data.totalExpense} />
              <Kpi label="손익" value={data.netProfit} tone={data.netProfit < 0 ? "neg" : "pos"} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Kpi label="도매매출" value={data.wholesaleSales} />
              <Kpi label="매장매출" value={data.storeSales} />
              <Kpi label="공장지급" value={data.supplierPaid} />
              <Kpi label="기타지출(고정비 포함)" value={data.otherExpense} />
            </div>

            {/* 비중 PieChart */}
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">수입 비중</h2>
                {incomeParts.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={incomeParts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {incomeParts.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => won(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">지출 비중</h2>
                {expenseParts.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={expenseParts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {expenseParts.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => won(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>

            {/* 추이 BarChart */}
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">기간별 추이</h2>
              {data.buckets.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">데이터가 없습니다.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.buckets}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => wonNum(v)} width={70} />
                    <Tooltip formatter={(v: number) => won(v)} />
                    <Legend />
                    <Bar dataKey="income" name="수입" fill="hsl(0 0% 30%)" />
                    <Bar dataKey="expense" name="지출" fill="hsl(0 0% 70%)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
