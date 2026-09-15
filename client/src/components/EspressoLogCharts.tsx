import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { EspressoSetupItem } from "@shared/schema";
import { BASIC_SENSES, SENSE_LABELS, type PartnerBrewGuide, type PublicExtraction } from "@shared/espresso-sensory";

const dateText = (s: string) => s.replace(/-/g, ".");
const numberText = (n: number, suffix = "") => n > 0 ? `${n}${suffix}` : "미기록";
const PARTNER_BEAN_ORDER = ["코튼 블렌드", "실크 블렌드", "디카페인"];

export function EspressoLogCharts() {
  const [selected, setSelected] = useState("");
  const guide = useQuery<PartnerBrewGuide>({
    queryKey: ["/api/espresso-brew-guide"],
    queryFn: async () => (await apiRequest("GET", "/api/espresso-brew-guide")).json(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const { data: setup = [] } = useQuery<EspressoSetupItem[]>({ queryKey: ["/api/espresso-setup"] });
  const beans = (guide.data?.beans ?? [])
    .filter(b => PARTNER_BEAN_ORDER.includes(b.bean))
    .sort((a, b) => PARTNER_BEAN_ORDER.indexOf(a.bean) - PARTNER_BEAN_ORDER.indexOf(b.bean));
  const bean = beans.find(b => b.bean === selected) ?? beans[0];
  return <div className="space-y-3 text-sm" data-testid="partner-brew-guide">
    {guide.isLoading ? <p className="py-5 text-muted-foreground">추출 기록을 불러오는 중입니다.</p> : guide.isError ? (
      <div className="rounded-lg border p-4"><p>추출 가이드를 불러오지 못했습니다.</p><button className="mt-2 underline" onClick={() => guide.refetch()}>다시 시도</button></div>
    ) : !bean ? <p className="py-5 text-muted-foreground">아직 추출 기록이 없습니다.</p> : <>
      <label className="flex items-center gap-3"><span className="text-xs text-muted-foreground">원두</span>
        <select aria-label="가이드 원두 선택" className="min-h-10 min-w-0 flex-1 rounded-md border bg-background px-3 sm:max-w-xs" value={bean.bean} onChange={e => setSelected(e.target.value)}>
          {beans.map(b => <option key={b.bean} value={b.bean}>{b.bean}</option>)}
        </select>
      </label>
      <BeanGuide key={bean.bean} bean={bean} from={guide.data!.from} to={guide.data!.to} />
    </>}
    {!!setup.length && <details className="rounded-lg border px-4 py-1">
      <summary className="cursor-pointer py-2 text-xs font-medium text-muted-foreground">매장 추출 장비 · 환경</summary>
      <dl className="mb-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{setup.map(s => <div key={s.id}><dt className="text-muted-foreground">{s.label}</dt><dd className="mt-1">{s.value || "미등록"}</dd></div>)}</dl>
    </details>}
  </div>;
}

function BeanGuide({ bean, from, to }: { bean: PartnerBrewGuide["beans"][number]; from: string; to: string }) {
  const [visible, setVisible] = useState(5);
  const recipe = bean.recommendation;
  return <section className="rounded-lg border bg-card p-4 sm:p-5" data-testid="bean-brew-guide">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{recipe && bean.recommendationSource === "legacy" ? "기존 참고 레시피" : "권장 레시피"}</h3>
      {recipe && <span className="text-[11px] text-muted-foreground">{dateText(recipe.date)}{recipe.date < from ? " · 이전 기록" : ""}</span>}
    </div>
    {recipe ? <>
      <RecipeMetrics recipe={recipe} />
      <p className="mt-2 text-[11px] text-muted-foreground">추출 온도 {numberText(recipe.waterTemp, "℃")} · 비율 1 : {Math.round(recipe.yield / recipe.dose * 10) / 10}</p>
      {bean.recommendationSource === "legacy" && <p className="mt-1 text-[11px] text-muted-foreground">새 권장 레시피가 등록되기 전까지 기존 긍정 평가의 최신 세팅을 보여드립니다.</p>}
    </> : <p className="py-4 text-xs text-muted-foreground">아직 지정된 권장 레시피가 없습니다.</p>}
    <div className="mt-4 flex flex-wrap gap-1.5" aria-label="최근 대표 향미">
      {bean.notes.slice(0, 5).map(n => <span key={n.label} className="rounded-full bg-muted px-2.5 py-1 text-xs">{n.label}</span>)}
      {!bean.notes.length && <span className="text-xs text-muted-foreground">최근 선택한 향미가 없습니다.</span>}
    </div>
    <div className="mt-4 border-t pt-3">
      <div className="mb-3 text-xs font-medium">최근 14일 · 평균 강도</div>
      <div className="grid grid-cols-1 gap-x-7 gap-y-3 sm:grid-cols-2">{BASIC_SENSES.map(key => {
        const item = bean.intensities[key];
        return <div key={key} className="grid grid-cols-[35px_1fr_60px] items-center gap-2 text-xs">
          <span>{SENSE_LABELS[key]}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${SENSE_LABELS[key]} ${item.mean === null ? "미평가" : `${item.mean} / 5, ${item.count}건`}`}>
            <div className="h-full rounded-full bg-[#657b68]" style={{ width: `${(item.mean ?? 0) * 20}%` }} />
          </div><span className="text-right tabular-nums text-muted-foreground">{item.mean === null ? "미평가" : `${item.mean} / 5`}</span>
        </div>;
      })}</div>
    </div>
    <details className="mt-4 border-t pt-1">
      <summary className="cursor-pointer py-2 text-xs font-medium">추출 기록 · 상세 보기</summary>
      <p className="text-xs text-muted-foreground">{dateText(from)} – {dateText(to)} · {bean.count}회 기록. 미평가는 평균에서 제외하고, ‘0 · 없음’은 포함합니다.</p>
      <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">{BASIC_SENSES.map(key => {
        const s = bean.intensities[key];
        return <p key={key}>{SENSE_LABELS[key]} · {s.count ? `평균 ${s.mean}, 범위 ${s.min}–${s.max} / 5 · ${s.count}건 평가` : "평가 없음"}</p>;
      })}</div>
      {!!bean.notes.length && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="향미 빈도">{bean.notes.map(n => <span key={n.label} className="rounded border px-2 py-1 text-[11px]">{n.label} · {n.count}회</span>)}</div>}
      {recipe && <details className="mt-3 rounded border px-3">
        <summary className="cursor-pointer py-2 text-xs">{bean.recommendationSource === "legacy" ? "참고" : "권장"} 레시피의 추출 환경</summary>
        <Environment recipe={recipe} />
      </details>}
      <div className="mt-3 divide-y">{bean.recent.slice(0, visible).map(r => <div key={r.id} className="py-3">
        <div className="flex flex-wrap justify-between gap-1 text-xs"><span>{dateText(r.date)}</span><span>{numberText(r.dose, "g")} → {numberText(r.yield, "g")} · {numberText(r.seconds, "초")}</span></div>
        <Environment recipe={r} />
        <p className="mt-1 text-xs">{r.notes.join(" · ") || "향미 미기록"}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{BASIC_SENSES.map(key => `${SENSE_LABELS[key]} ${r.intensities[key] ?? "미평가"}`).join(" · ")}</p>
      </div>)}</div>
      {!bean.count && <p className="py-3 text-xs text-muted-foreground">최근 14일의 추출 기록이 없습니다.</p>}
      {bean.count > visible && <button type="button" className="mt-2 rounded border px-3 py-2 text-xs" onClick={() => setVisible(v => v + 10)}>기록 더 보기 ({visible} / {bean.count})</button>}
      <p className="mt-3 text-[11px] text-muted-foreground">원두 경과일과 장비·환경에 따라 달라질 수 있습니다. 매장 세팅에 참고해 주세요.</p>
    </details>
  </section>;
}
function RecipeMetrics({ recipe: r }: { recipe: PublicExtraction }) {
  return <div className="mt-3 grid grid-cols-3 divide-x border-y py-3 text-center">
    {[["도징", `${r.dose}g`], ["추출량", `${r.yield}g`], ["시간", `${r.seconds}초`]].map(([label, value]) => <div key={label}><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div></div>)}
  </div>;
}
function Environment({ recipe: r }: { recipe: PublicExtraction }) {
  return <p className="my-2 break-keep text-[11px] leading-relaxed text-muted-foreground">
    온도 {numberText(r.waterTemp, "℃")} · 분쇄 {r.grind || "미기록"} · 로스팅 {r.roastDays > 0 ? `D+${r.roastDays}` : "미기록"}
    <br />실내 {numberText(r.roomTemp, "℃")} · 습도 {numberText(r.humidity, "%")} · 그라인더 {numberText(r.grinderTemp, "℃")}
  </p>;
}
