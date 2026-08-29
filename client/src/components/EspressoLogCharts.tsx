import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoStats, EspressoSetupItem } from "@shared/schema";
import { ChevronDown } from "lucide-react";

// 섹션 구분 라벨. 제목을 크게 키우는 대신 조용한 라벨 + 헤어라인으로 두고,
// 시선은 아래의 숫자(도징·추출량·시간)가 가져가게 한다.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="font-ui text-xs font-bold tracking-[0.01em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="font-ui text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none tabular text-foreground">{value}</div>
    </div>
  );
}

// 2026-06-22 → 2026.06.22
function dotDate(s: string): string {
  return (s || "").replace(/-/g, ".");
}

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
  const showSummary = !!stats && !stats.error && stats.totalLogs > 0;

  return (
    <div className="space-y-9">
      {/* 기록 규모 — 이 페이지의 근거 */}
      {showSummary && (
        <p className="font-ui text-xs text-muted-foreground" data-testid="text-espresso-summary">
          총 <span className="tabular font-bold text-foreground">{stats!.totalLogs}</span>회 기록
          <span className="mx-2 text-border">|</span>
          <span className="tabular">{dotDate(stats!.from)} – {dotDate(stats!.to)}</span>
        </p>
      )}

      {/* 추출 환경 */}
      {setupItems.length > 0 && (
        <div>
          <SectionLabel>추출 환경</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {setupItems.map((s) => (
              <Card key={s.id} className="p-4 sm:p-5" data-testid={`setup-${s.id}`}>
                <div className="font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {s.label}
                </div>
                <div className="mt-1.5 break-keep text-[15px] font-semibold leading-snug text-foreground">
                  {s.value || "-"}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 원두별 평균 레시피 · 맛 노트 */}
      <div>
        <SectionLabel>원두별 평균 레시피</SectionLabel>
        <p className="-mt-1 mb-4 break-keep text-sm leading-relaxed text-muted-foreground">
          니트커피 바리스타가 매장에서 직접 추출하며 기록한 원두별 평균 레시피예요. 매장 세팅에 참고해 주세요.
        </p>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : stats?.error ? (
          <Card className="py-12 text-center text-sm text-muted-foreground">추출 로그를 불러오지 못했습니다.</Card>
        ) : recipes.length === 0 ? (
          <Card className="py-12 text-center text-sm text-muted-foreground">긍정 평가 기록이 아직 없습니다.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {recipes.map((b) => {
              const tags = (b as any).tags ?? [];
              const notes: string[] = (b as any).notes ?? [];
              const isOpen = openBean === b.bean;
              return (
                <Card key={b.bean} className="flex flex-col p-5" data-testid={`recipe-${b.bean}`}>
                  {/* 원두명 + 브루비율 */}
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="break-keep text-lg font-semibold leading-tight text-foreground">{b.bean}</h4>
                    <span className="shrink-0 rounded-full bg-foreground px-3 py-1 font-ui text-xs font-bold tabular text-background">
                      1 : {b.ratio}
                    </span>
                  </div>

                  {/* 도징 / 추출량 / 시간 — 이 카드의 주인공 */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-4 text-center">
                    <Metric label="도징" value={`${b.avgDose}g`} />
                    <Metric label="추출량" value={`${b.avgYield}g`} className="border-x border-border" />
                    <Metric label="시간" value={`${b.avgTime}초`} />
                  </div>

                  {/* 맛 태그 */}
                  {tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {tags.map((t: { label: string; count: number }) => (
                        <span
                          key={t.label}
                          className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground/75"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 대표 코멘트 펼치기 */}
                  {notes.length > 0 && (
                    <div className="mt-auto pt-4">
                      <button
                        type="button"
                        onClick={() => setOpenBean(isOpen ? null : b.bean)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        data-testid={`button-notes-${b.bean}`}
                      >
                        추출 코멘트 {notes.length}개
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="mt-3 space-y-2.5 border-l-2 border-border pl-3.5">
                          {notes.map((n, i) => (
                            <p key={i} className="break-keep text-[13px] leading-relaxed text-foreground/70">
                              {n}
                            </p>
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
