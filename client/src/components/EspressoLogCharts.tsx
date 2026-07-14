import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoStats, EspressoSetupItem } from "@shared/schema";
import { Coffee } from "lucide-react";

export function EspressoLogCharts() {
  const { data: stats, isLoading } = useQuery<EspressoStats>({
    queryKey: ["/api/espresso-log-stats"],
    queryFn: async () => (await apiRequest("GET", "/api/espresso-log-stats")).json(),
    refetchInterval: 10 * 60 * 1000,
  });
  const { data: setup } = useQuery<EspressoSetupItem[]>({
    queryKey: ["/api/espresso-setup"],
    queryFn: async () => (await apiRequest("GET", "/api/espresso-setup")).json(),
  });

  const setupItems = setup ?? [];
  const recipes = stats?.byBeanRecipe ?? [];

  return (
    <div className="space-y-8">
      {/* 추출 환경 인포그래픽 */}
      {setupItems.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">추출 환경</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {setupItems.map((s) => (
              <Card key={s.id} className="flex items-center gap-4 p-4" data-testid={`setup-${s.id}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-2xl">
                  {s.icon || "☕"}
                </div>
                <div className="min-w-0">
                  <div className="font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{s.value || "-"}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 원두별 평균 레시피 (긍정·매우 긍정 기준) */}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="text-sm font-semibold text-foreground">원두별 평균 레시피</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">'긍정'·'매우 긍정' 평가 기록만 반영 · 브루비율 = 추출량 ÷ 도징</p>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : stats?.error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Coffee className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">추출 로그를 불러오지 못했습니다.</p>
          </div>
        ) : recipes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Coffee className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">긍정 평가 기록이 아직 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">원두</th>
                  <th className="px-4 py-2 text-right font-medium">평균 도징(g)</th>
                  <th className="px-4 py-2 text-right font-medium">평균 추출량(g)</th>
                  <th className="px-4 py-2 text-right font-medium">평균 시간(초)</th>
                  <th className="px-4 py-2 text-right font-medium">브루비율</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recipes.map((b) => (
                  <tr key={b.bean}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{b.bean}</td>
                    <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgDose}</td>
                    <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgYield}</td>
                    <td className="px-4 py-2.5 text-right tabular text-foreground">{b.avgTime}</td>
                    <td className="px-4 py-2.5 text-right tabular font-semibold text-foreground">1 : {b.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
