import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Users, Eye, Globe, ArrowUpRight, AlertCircle } from "lucide-react";

type Analytics = {
  configured: boolean;
  error?: string;
  range?: { start: string; end: string; days: number };
  totals?: { visits: number; pageviews: number };
  daily?: { date: string; visits: number; pageviews: number }[];
  referers?: { name: string; count: number }[];
  countries?: { name: string; count: number }[];
};

const num = (n: number | undefined) => (n ?? 0).toLocaleString("ko-KR");

export default function AdminWebAnalytics() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const [days, setDays] = useState(7);
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/admin/web-analytics", days],
    queryFn: async () => (await apiRequest("GET", `/api/admin/web-analytics?days=${days}`)).json(),
    refetchInterval: 5 * 60 * 1000,
  });

  const chartData = (data?.daily ?? []).map((d) => ({
    label: d.date.slice(5).replace("-", "."),
    visits: d.visits,
  }));

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Web Analytics</div>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground">방문자 통계</h1>
            <p className="mt-1 text-sm text-muted-foreground">Cloudflare Web Analytics 기준 · 익명 집계</p>
          </div>
          {/* 기간 토글 */}
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {[
              { d: 7, label: "최근 7일" },
              { d: 30, label: "최근 30일" },
            ].map((o) => (
              <button
                key={o.d}
                onClick={() => setDays(o.d)}
                data-testid={`range-${o.d}`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  days === o.d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data && data.configured === false ? (
          <SetupNotice />
        ) : data?.error ? (
          <Card className="flex flex-col items-start gap-2 border-destructive/30 bg-destructive/5 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertCircle className="h-4 w-4" /> 통계를 불러오지 못했습니다
            </div>
            <p className="text-sm text-muted-foreground">{data.error}</p>
            <p className="text-xs text-muted-foreground">토큰 권한(Account Analytics: Read)이 맞는지 확인해 주세요. 문제가 계속되면 알려주세요.</p>
          </Card>
        ) : (
          <>
            {/* KPI */}
            <div className="mb-6 grid grid-cols-2 gap-3">
              <Kpi icon={Users} label="방문자 (visits)" value={num(data?.totals?.visits)} />
              <Kpi icon={Eye} label="페이지뷰 (page views)" value={num(data?.totals?.pageviews)} />
            </div>

            {/* 일별 방문 차트 */}
            <Card className="mb-6 p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">일별 방문자</h2>
              {chartData.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">
                  아직 집계된 방문 데이터가 없습니다.
                  <br />
                  방문이 발생하면 몇 분 내로 표시됩니다.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      formatter={(v: number) => [`${num(v)}명`, "방문자"]}
                    />
                    <Bar dataKey="visits" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* 유입 경로 + 국가 */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <RankCard title="유입 경로" icon={ArrowUpRight} rows={data?.referers ?? []} unit="회" />
              <RankCard title="국가" icon={Globe} rows={data?.countries ?? []} unit="회" />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular text-foreground">{value}</div>
    </Card>
  );
}

function RankCard({ title, icon: Icon, rows, unit }: { title: string; icon: any; rows: { name: string; count: number }[]; unit: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">데이터 없음</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} data-testid={`rank-${title}-${i}`}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
                <span className="ml-2 shrink-0 tabular text-muted-foreground">{num(r.count)}{unit}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SetupNotice() {
  return (
    <Card className="flex flex-col items-start gap-3 border-teal-600/20 bg-teal-50/40 p-6 dark:bg-teal-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertCircle className="h-4 w-4 text-teal-700" /> 연동 준비가 필요합니다
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cloudflare에서 발급한 <span className="font-semibold text-foreground">읽기 전용 API 토큰</span>을 Railway 환경변수
        <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">CLOUDFLARE_API_TOKEN</code>에 등록하면
        이 화면에 방문자 수·페이지뷰·유입 경로가 표시됩니다.
      </p>
      <p className="text-xs text-muted-foreground">토큰 발급·등록 방법은 담당(클로드)에게 문의하세요.</p>
    </Card>
  );
}
