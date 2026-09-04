import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import {
  ESPRESSO_BEAN_PRESETS,
  ESPRESSO_RATINGS,
  espressoRatingLabel,
  type EspressoLog,
  type EspressoStats,
} from "@shared/schema";
import { Loader2, Plus, Trash2, X } from "lucide-react";

const FLAVORS = ["단맛", "산미", "쓴맛", "고소", "과일", "초콜릿", "너티", "플로럴", "묵직", "가벼움"];

type Draft = {
  logDate: string;
  beanName: string;
  roastDays: string;
  doseG: string;
  yieldG: string;
  timeSec: string;
  grindSetting: string;
  waterTemp: string;
  grinderTemp: string;
  roomTemp: string;
  roomHumidity: string;
  rating: number;
  flavorTags: string[];
  memo: string;
};

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    logDate: today(),
    beanName: "",
    roastDays: "",
    doseG: "",
    yieldG: "",
    timeSec: "",
    grindSetting: "",
    waterTemp: "",
    grinderTemp: "",
    roomTemp: "",
    roomHumidity: "",
    rating: 0,
    flavorTags: [],
    memo: "",
  };
}

/** 2026-08-09 → 8.9 */
function shortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
}

/** 평가에 따른 색 — 긍정은 세이지, 부정은 벽돌색 */
function ratingTone(n: number): { bg: string; fg: string } {
  if (n >= 4) return { bg: "var(--s-accent-soft)", fg: "var(--s-accent)" };
  if (n === 3) return { bg: "var(--s-bg)", fg: "#6d6c67" };
  if (n > 0) return { bg: "#efe3e1", fg: "#8d4038" };
  return { bg: "var(--s-bg)", fg: "var(--s-faint)" };
}

export default function StaffEspresso() {
  const { toast } = useToast();
  const { data: me } = useStaff();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [beanEtc, setBeanEtc] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: logs, isLoading } = useQuery<EspressoLog[]>({ queryKey: ["/api/staff/espresso-logs"] });
  // 요즘 세팅 — 공개 통계 API(전체 기간 · 긍정 평가 기준)를 그대로 쓴다. 서버가 30초 캐시한다.
  const { data: stats } = useQuery<EspressoStats>({ queryKey: ["/api/espresso-log-stats"] });

  // 원두별 가장 최근에 적힌 분쇄도 (이번 달 기록 중)
  const latestGrind = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs ?? []) {
      if (l.grindSetting && !m.has(l.beanName)) m.set(l.beanName, l.grindSetting);
    }
    return m;
  }, [logs]);

  // 오늘 입력한 습도가 있으면 그 구간, 없으면 가장 최근 기록의 습도 구간을 권장 레시피로 보여준다
  const humidityHint = useMemo(() => {
    if (!stats?.byHumidity?.length) return null;
    const h = Number(d.roomHumidity) || (logs ?? []).find((l) => l.roomHumidity > 0)?.roomHumidity || 0;
    if (!h) return null;
    const idx = h < 50 ? 0 : h < 60 ? 1 : h < 70 ? 2 : h < 80 ? 3 : 4;
    const row = stats.byHumidity[idx];
    return row && row.count > 0 ? { h, row } : null;
  }, [stats, logs, d.roomHumidity]);

  function set(patch: Partial<Draft>) {
    setD((prev) => ({ ...prev, ...patch }));
  }

  function toggleFlavor(f: string) {
    setD((prev) => ({
      ...prev,
      flavorTags: prev.flavorTags.includes(f) ? prev.flavorTags.filter((x) => x !== f) : [...prev.flavorTags, f],
    }));
  }

  function close() {
    setOpen(false);
    setBeanEtc(false);
    setD(emptyDraft());
  }

  async function save() {
    if (!d.beanName.trim()) {
      toast({ variant: "destructive", title: "원두를 골라 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/espresso-logs", {
        logDate: d.logDate,
        beanName: d.beanName.trim(),
        doseG: Number(d.doseG) || 0,
        yieldG: Number(d.yieldG) || 0,
        timeSec: Number(d.timeSec) || 0,
        grindSetting: d.grindSetting.trim(),
        waterTemp: Number(d.waterTemp) || 0,
        grinderTemp: Number(d.grinderTemp) || 0,
        roomTemp: Number(d.roomTemp) || 0,
        roomHumidity: Number(d.roomHumidity) || 0,
        roastDays: Number(d.roastDays) || 0,
        rating: d.rating,
        flavorTags: d.flavorTags,
        memo: d.memo.trim(),
      });
      toast({ title: "기록되었습니다." });
      close();
      queryClient.invalidateQueries({ queryKey: ["/api/staff/espresso-logs"] });
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("이 기록을 지울까요?")) return;
    try {
      await apiRequest("DELETE", `/api/staff/espresso-logs/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/staff/espresso-logs"] });
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <StaffLayout title="추출 기록" subtitle="에스프레소">
      {!open ? (
        <button className="s-pill wide" onClick={() => setOpen(true)} data-testid="button-open-espresso-form">
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          오늘 추출 기록하기
        </button>
      ) : (
        <>
          <div className="s-sect flex items-center justify-between" style={{ margin: "2px 4px 9px" }}>
            <span>새 기록</span>
            <button className="s-icon" onClick={close} aria-label="닫기">
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          {/* 날짜 · 원두 */}
          <div className="s-card">
            <label className="s-label">날짜</label>
            <input
              className="s-input"
              type="date"
              value={d.logDate}
              onChange={(e) => set({ logDate: e.target.value })}
              data-testid="input-log-date"
            />

            <div className="mt-3">
              <label className="s-label">원두 종류</label>
              <div className="flex flex-wrap gap-1.5">
                {ESPRESSO_BEAN_PRESETS.map((b) => (
                  <button
                    key={b}
                    className={`s-chip ${!beanEtc && d.beanName === b ? "on" : ""}`}
                    onClick={() => {
                      setBeanEtc(false);
                      set({ beanName: b });
                    }}
                    data-testid={`bean-${b}`}
                  >
                    {b}
                  </button>
                ))}
                <button
                  className={`s-chip ${beanEtc ? "on" : ""}`}
                  onClick={() => {
                    setBeanEtc(true);
                    set({ beanName: "" });
                  }}
                >
                  기타
                </button>
              </div>
              {beanEtc && (
                <input
                  className="s-input mt-2"
                  value={d.beanName}
                  onChange={(e) => set({ beanName: e.target.value })}
                  placeholder="원두 이름을 적어주세요"
                  data-testid="input-bean-name"
                />
              )}
            </div>

            <div className="mt-3">
              <label className="s-label">로스팅 경과일 (D+)</label>
              <input
                className="s-input"
                value={d.roastDays}
                onChange={(e) => set({ roastDays: e.target.value })}
                inputMode="decimal"
                placeholder="9"
                data-testid="input-roast-days"
              />
            </div>
          </div>

          {/* 레시피 */}
          <div className="s-sect">레시피</div>
          <div className="s-card">
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
              <Field label="도징 (g)" value={d.doseG} onChange={(v) => set({ doseG: v })} placeholder="19.5" test="input-dose" />
              <Field label="추출량 (g)" value={d.yieldG} onChange={(v) => set({ yieldG: v })} placeholder="34" test="input-yield" />
              <Field label="시간 (초)" value={d.timeSec} onChange={(v) => set({ timeSec: v })} placeholder="27" test="input-time" />
            </div>
            <div className="mt-3">
              <label className="s-label">분쇄도 (그라인더 눈금)</label>
              <input
                className="s-input"
                value={d.grindSetting}
                onChange={(e) => set({ grindSetting: e.target.value })}
                placeholder="예: 2.4 / 한 칸 곱게"
                data-testid="input-grind"
              />
            </div>
          </div>

          {/* 환경 */}
          <div className="s-sect">그날의 환경</div>
          <div className="s-card">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="추출 온도 (℃)" value={d.waterTemp} onChange={(v) => set({ waterTemp: v })} placeholder="93" />
              <Field
                label="그라인더 온도 (℃)"
                value={d.grinderTemp}
                onChange={(v) => set({ grinderTemp: v })}
                placeholder="27"
              />
              <Field label="실내 온도 (℃)" value={d.roomTemp} onChange={(v) => set({ roomTemp: v })} placeholder="25" />
              <Field
                label="실내 습도 (%)"
                value={d.roomHumidity}
                onChange={(v) => set({ roomHumidity: v })}
                placeholder="50"
              />
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
              실내 온도와 습도는 거래처가 보는 페이지에서 환경별 권장 레시피를 뽑는 데 쓰입니다.
            </p>
          </div>

          {/* 평가 */}
          <div className="s-sect">종합 평가</div>
          <div className="s-card">
            <div className="grid grid-cols-5 gap-1.5">
              {ESPRESSO_RATINGS.map((r) => {
                const on = d.rating === r.value;
                const tone = ratingTone(r.value);
                return (
                  <button
                    key={r.value}
                    onClick={() => set({ rating: on ? 0 : r.value })}
                    className="rounded-[10px] py-2.5 text-[11px] leading-tight"
                    style={
                      on
                        ? { background: "var(--s-ink)", color: "#fff", fontWeight: 600 }
                        : { background: tone.bg, color: tone.fg }
                    }
                    data-testid={`rating-${r.value}`}
                  >
                    {r.label.replace(" ", "\n")}
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="s-label">맛 코멘트</label>
              <textarea
                className="s-input"
                value={d.memo}
                onChange={(e) => set({ memo: e.target.value })}
                rows={3}
                placeholder="어떤 맛이었는지, 세팅을 바꿨다면 그 이유를 적어주세요."
                data-testid="input-memo"
              />
            </div>

            <div className="mt-3">
              <label className="s-label">맛 노트 (선택)</label>
              <div className="flex flex-wrap gap-1.5">
                {FLAVORS.map((f) => (
                  <button
                    key={f}
                    className={`s-chip ${d.flavorTags.includes(f) ? "on" : ""}`}
                    onClick={() => toggleFlavor(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
            <button className="s-pill" onClick={save} disabled={busy} data-testid="button-save-espresso">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
            </button>
            <button className="s-pill line" style={{ paddingLeft: 22, paddingRight: 22 }} onClick={close}>
              취소
            </button>
          </div>
        </>
      )}

      {/* 요즘 세팅 — 긍정 평가 기록의 원두별 평균 */}
      {(stats?.byBeanRecipe?.length ?? 0) > 0 && (
        <>
          <div className="s-sect flex items-baseline justify-between">
            <span>요즘 세팅</span>
            <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
              긍정 평가 기준 평균
            </span>
          </div>
          <div className="s-card" data-testid="card-recipe">
            {stats!.byBeanRecipe.slice(0, 4).map((b, i) => (
              <div
                key={b.bean}
                className="flex items-center gap-2 py-2"
                style={i > 0 ? { borderTop: "1px solid var(--s-hair)" } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{b.bean}</div>
                  <div className="s-k mt-0.5">
                    {b.count}회{latestGrind.get(b.bean) ? ` · 분쇄 ${latestGrind.get(b.bean)}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13.5px] font-medium">
                    {b.avgDose}g → {b.avgYield}g
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--s-muted)" }}>
                    {b.avgTime}초 · 1:{b.ratio}
                  </div>
                </div>
              </div>
            ))}
            {humidityHint && (
              <div
                className="mt-2 rounded-[10px] px-3 py-2 text-[12px] leading-relaxed"
                style={{ background: "var(--s-accent-soft)", color: "var(--s-accent)" }}
              >
                습도 {humidityHint.row.label}일 때 잘 나온 세팅 · {humidityHint.row.avgDose}g → {humidityHint.row.avgYield}g,{" "}
                {humidityHint.row.avgTime}초 ({humidityHint.row.count}회)
              </div>
            )}
          </div>
        </>
      )}

      <div className="s-sect flex items-baseline justify-between">
        <span>이번 달 기록</span>
        {(logs?.length ?? 0) > 0 && (
          <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
            {logs!.length}건
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : (logs?.length ?? 0) === 0 ? (
        <div className="s-card">
          <div className="s-empty">
            아직 기록이 없습니다.
            <br />첫 추출을 남겨 보세요.
          </div>
        </div>
      ) : (
        logs!.map((l) => {
          const tags: string[] = (() => {
            try {
              return JSON.parse(l.flavorTags);
            } catch {
              return [];
            }
          })();
          const tone = ratingTone(l.rating);
          return (
            <div key={l.id} className="s-card" data-testid={`row-espresso-${l.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{l.beanName}</span>
                    {l.rating > 0 && (
                      <span
                        className="rounded-full px-2 py-[3px] text-[10px] font-medium"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {espressoRatingLabel(l.rating)}
                      </span>
                    )}
                  </div>
                  <div className="s-k mt-0.5">
                    {shortDate(l.logDate)}
                    {l.staffName ? ` · ${l.staffName}` : ""}
                    {l.roastDays > 0 ? ` · D+${l.roastDays}` : ""}
                  </div>
                </div>
                {me?.id === l.staffId && (
                  <button className="s-icon" onClick={() => remove(l.id)} aria-label="삭제">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-[17px] font-semibold tracking-tight">{l.doseG || 0}</span>
                <span className="text-[11px]" style={{ color: "var(--s-muted)" }}>
                  g
                </span>
                <span className="mx-0.5 text-[12px]" style={{ color: "var(--s-faint)" }}>
                  →
                </span>
                <span className="text-[17px] font-semibold tracking-tight">{l.yieldG || 0}</span>
                <span className="text-[11px]" style={{ color: "var(--s-muted)" }}>
                  g
                </span>
                <span className="ml-auto text-[12px]" style={{ color: "var(--s-muted)" }}>
                  {l.timeSec || 0}초{l.grindSetting ? ` · 분쇄 ${l.grindSetting}` : ""}{l.waterTemp ? ` · ${l.waterTemp}℃` : ""}
                </span>
              </div>

              {(l.roomTemp > 0 || l.roomHumidity > 0 || l.grinderTemp > 0) && (
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
                  {[
                    l.roomTemp > 0 ? `실내 ${l.roomTemp}℃` : "",
                    l.roomHumidity > 0 ? `습도 ${l.roomHumidity}%` : "",
                    l.grinderTemp > 0 ? `그라인더 ${l.grinderTemp}℃` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              {l.memo && (
                <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
                  {l.memo}
                </p>
              )}

              {tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span key={t} className="s-chip tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
        여기 남긴 기록이 거래처가 보는 에스프레소 추출 로그에 그대로 반영됩니다.
        <br />
        담당자 이름과 개인적인 내용은 공개 페이지에서 지워집니다.
      </p>
    </StaffLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  test,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  test?: string;
}) {
  return (
    <div>
      <label className="s-label" style={{ whiteSpace: "nowrap" }}>
        {label}
      </label>
      <input
        className="s-input center"
        style={{ padding: "10px 4px" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        data-testid={test}
      />
    </div>
  );
}
