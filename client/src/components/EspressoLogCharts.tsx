import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoStats, EspressoSetupItem, EspressoBinRow } from "@shared/schema";
import { resolveEspressoIcon } from "@/lib/espressoIcons";
import { Coffee, ChevronDown, Quote } from "lucide-react";

function BinCard({ title, rows }: { title: string; rows: EspressoBinRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">데이터가 아직 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">구간</th>
                <th className="px-3 py-2 text-right font-medium">도징</th>
                <th className="px-3 py-2 text-right font-medium">추출량</th>
                <th className="px-3 py-2 text-right font-medium">시간</th>
                <th className="px-3 py-2 text-right font-medium">비율</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((b) => (
                <tr key={b.label}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                    {b.label} <span className="text-[11px] text-muted-foreground/70">n={b.count}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular text-foreground">{b.avgDose}g</td>
                  <td className="px-3 py-2.5 text-right tabular text-foreground">{b.avgYield}g</td>
                  <td className="px-3 py-2.5 text-right tabular text-foreground">{b.avgTime}초</td>
                  <td className="px-3 py-2.5 text-right tabular font-semibold text-foreground">1:{b.ratio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
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
  const hum = stats?.byHumidity ?? [];
  const temp = stats?.byTemp ?? [];

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

      {/* 원두별 평균 레시피 (긍정·매우 긍정 기준) */}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h3 className="text-sm font-semibold text-foreground">원두별 평균 레시피 · 맛 노트</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">'긍정'·'매우 긍정' 평가 기록만 반영 · 브루비율 = 추출량 ÷ 도징 · 맛 노트는 실제 추출 코멘트에서 발췌</p>
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
                {recipes.map((b) => {
                  const tags = (b as any).tags ?? [];
                  const notes = (b as any).notes ?? [];
                  const isOpen = openBean === b.bean;
                  return (
                    <Fragment key={b.bean}>
                      <tr>
                        <td className="px-4 py-2.5 align-top">
                          <div className="font-medium text-foreground">{b.bean}</div>
                          {tags.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
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
                          {notes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setOpenBean(isOpen ? null : b.bean)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              data-testid={`button-notes-${b.bean}`}
                            >
                              추출 코멘트 {notes.length}개
                              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right align-top tabular text-foreground">{b.avgDose}</td>
                        <td className="px-4 py-2.5 text-right align-top tabular text-foreground">{b.avgYield}</td>
                        <td className="px-4 py-2.5 text-right align-top tabular text-foreground">{b.avgTime}</td>
                        <td className="px-4 py-2.5 text-right align-top tabular font-semibold text-foreground">1 : {b.ratio}</td>
                      </tr>
                      {isOpen && notes.length > 0 && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="space-y-2">
                              {notes.map((n: string, i: number) => (
                                <div key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
                                  <span>{n}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 환경 구간별 성공 레시피 (습도 · 실내온도) */}
      {(hum.length > 0 || temp.length > 0) && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">환경별 성공 레시피</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            '긍정'·'매우 긍정' 기록을 습도·실내온도 구간으로 나눈 평균 레시피입니다. 표본 수(n)가 적은 구간은 참고용이에요.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BinCard title="습도 구간별" rows={hum} />
            <BinCard title="실내온도 구간별" rows={temp} />
          </div>
        </div>
      )}
    </div>
  );
}
