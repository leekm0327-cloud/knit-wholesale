import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoStats, EspressoSetupItem } from "@shared/schema";
import { resolveEspressoIcon } from "@/lib/espressoIcons";
import { Coffee, ChevronDown, Quote } from "lucide-react";

export function EspressoLogCharts() {
  const [openBean, setOpenBean] = useState<string | null>(null);
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
            {setupItems.map((s) => {
              const Icon = resolveEspressoIcon(s.icon);
              return (
                <Card key={s.id} className="flex items-center gap-4 p-4" data-testid={`setup-${s.id}`}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{s.value || "-"}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 원두별 평균 레시피 · 맛 노트 */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">원두별 평균 레시피 · 맛 노트</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          니트커피 바리스타가 매장에서 직접 추출하며 기록한 원두별 평균 레시피예요. 매장 세팅에 참고해 주세요.
        </p>

        {isLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : stats?.error ? (
          <Card className="mt-4 flex flex-col items-center gap-3 py-12 text-center">
            <Coffee className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">추출 로그를 불러오지 못했습니다.</p>
          </Card>
        ) : recipes.length === 0 ? (
          <Card className="mt-4 flex flex-col items-center gap-3 py-12 text-center">
            <Coffee className="h-9 w-9 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">긍정 평가 기록이 아직 없습니다.</p>
          </Card>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {recipes.map((b) => {
              const tags = (b as any).tags ?? [];
              const notes: string[] = (b as any).notes ?? [];
              const isOpen = openBean === b.bean;
              return (
                <Card key={b.bean} className="flex flex-col p-4" data-testid={`recipe-${b.bean}`}>
                  {/* 원두명 + 브루비율 */}
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold text-foreground">{b.bean}</h4>
                    <span className="shrink-0 rounded-full bg-foreground px-2.5 py-0.5 font-ui text-[11px] font-semibold tabular text-background">
                      1 : {b.ratio}
                    </span>
                  </div>

                  {/* 도징 / 추출량 / 시간 — 3칸 그리드 (모바일에서도 안 잘림) */}
                  <div className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-3 text-center">
                    <div>
                      <div className="font-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">도징</div>
                      <div className="mt-0.5 text-sm font-semibold tabular text-foreground">{b.avgDose}g</div>
                    </div>
                    <div className="border-x border-border">
                      <div className="font-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">추출량</div>
                      <div className="mt-0.5 text-sm font-semibold tabular text-foreground">{b.avgYield}g</div>
                    </div>
                    <div>
                      <div className="font-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">시간</div>
                      <div className="mt-0.5 text-sm font-semibold tabular text-foreground">{b.avgTime}초</div>
                    </div>
                  </div>

                  {/* 맛 태그 */}
                  {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tags.map((t: { label: string; count: number }) => (
                        <span
                          key={t.label}
                          className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 대표 코멘트 펼치기 */}
                  {notes.length > 0 && (
                    <div className="mt-auto pt-3">
                      <button
                        type="button"
                        onClick={() => setOpenBean(isOpen ? null : b.bean)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        data-testid={`button-notes-${b.bean}`}
                      >
                        추출 코멘트 {notes.length}개
                        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-3">
                          {notes.map((n, i) => (
                            <div key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                              <span>{n}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
