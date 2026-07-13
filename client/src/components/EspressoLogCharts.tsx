import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoStats } from "@shared/schema";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Coffee } from "lucide-react";

const INK = "hsl(0 0% 15%)";
const INK_SOFT = "hsl(0 0% 45%)";

export function EspressoLogCharts() {
  const { data, isLoading } = useQuery<EspressoStats>({
    queryKey: ["/api/espresso-log-stats"],
    queryFn: async () => (await apiRequest("GET", "/api/espresso-log-stats")).json(),
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!data || data.error || data.totalLogs === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Coffee className="h-9 w-9 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {data?.error ? "추출 로그를 불러오지 못했습니다." : "아직 집계된 추출 로그가 없습니다."}
        </p>
      </Card>
    );
  }

  const ratingData = data.byRating.map((r) => ({ name: r.rating, count: r.count }));
  const dateData = data.byDate.map((d) => ({ name: d.date.slice(5).replace("-", "."), count: d.count }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          총 <span className="font-semibold text-foreground">{data.totalLogs.toLocaleString()}</span>건의 추출 기록
        </span>
        {data.from && (
          <span className="text-xs">
            {data.from} ~ {data.to}
          </span>
        )}
      </div>

      {/* 종합 평가 분포 */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">종합 평가 분포</h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratingData} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 90%)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: INK_SOFT }} tickLine={false} axisLine={{ stroke: "hsl(0 0% 85%)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                cursor={{ fill: "hsl(0 0% 95%)" }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(0 0% 85%)" }}
                formatter={(v: any) => [`${v}건`, "건수"]}
              />
              <Bar dataKey="count" fill={INK} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 일자별 추출 추이 */}
      <Card className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">일자별 추출 추이</h3>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dateData} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 90%)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={{ stroke: "hsl(0 0% 85%)" }} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK_SOFT }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(0 0% 85%)" }}
                formatter={(v: any) => [`${v}건`, "추출"]}
              />
              <Line type="monotone" dataKey="count" stroke={INK} strokeWidth={2} dot={{ r: 2.5, fill: INK }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 원두별 평균 레시피 */}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="text-sm font-semibold text-foreground">원두별 평균 레시피</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">브루비율 = 추출량 ÷ 도징</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">원두</th>
                <th className="px-4 py-2 text-right font-medium">기록</th>
                <th className="px-4 py-2 text-right font-medium">평균 도징(g)</th>
                <th className="px-4 py-2 text-right font-medium">평균 추출량(g)</th>
                <th className="px-4 py-2 text-right font-medium">평균 시간(초)</th>
                <th className="px-4 py-2 text-right font-medium">브루비율</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.byBeanRecipe.map((b) => (
                <tr key={b.bean}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{b.bean}</td>
                  <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{b.count.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgDose}</td>
                  <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgYield}</td>
                  <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgTime}</td>
                  <td className="px-4 py-2.5 text-right tabular font-semibold text-foreground">1 : {b.ratio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
