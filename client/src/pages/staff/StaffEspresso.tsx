import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { EspressoLog } from "@shared/schema";
import { Loader2, Plus, Trash2, Star, X } from "lucide-react";

const FLAVORS = ["단맛", "산미", "쓴맛", "고소", "과일", "초콜릿", "너티", "플로럴", "묵직", "가벼움"];

type Draft = {
  beanName: string;
  machine: string;
  grindSetting: string;
  doseG: string;
  yieldG: string;
  timeSec: string;
  waterTemp: string;
  tds: string;
  rating: number;
  flavorTags: string[];
  memo: string;
};

const EMPTY: Draft = {
  beanName: "",
  machine: "",
  grindSetting: "",
  doseG: "",
  yieldG: "",
  timeSec: "",
  waterTemp: "",
  tds: "",
  rating: 0,
  flavorTags: [],
  memo: "",
};

/** 2026-08-09 → 8.9 */
function shortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  return `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
}

export default function StaffEspresso() {
  const { toast } = useToast();
  const { data: me } = useStaff();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const { data: logs, isLoading } = useQuery<EspressoLog[]>({ queryKey: ["/api/staff/espresso-logs"] });
  const { data: beans } = useQuery<string[]>({ queryKey: ["/api/staff/espresso-logs/beans"] });

  function set(patch: Partial<Draft>) {
    setD((prev) => ({ ...prev, ...patch }));
  }

  function toggleFlavor(f: string) {
    setD((prev) => ({
      ...prev,
      flavorTags: prev.flavorTags.includes(f) ? prev.flavorTags.filter((x) => x !== f) : [...prev.flavorTags, f],
    }));
  }

  async function save() {
    if (!d.beanName.trim()) {
      toast({ variant: "destructive", title: "원두를 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/espresso-logs", {
        beanName: d.beanName.trim(),
        machine: d.machine.trim(),
        grindSetting: d.grindSetting.trim(),
        doseG: Number(d.doseG) || 0,
        yieldG: Number(d.yieldG) || 0,
        timeSec: Number(d.timeSec) || 0,
        waterTemp: Number(d.waterTemp) || 0,
        tds: d.tds.trim(),
        rating: d.rating,
        flavorTags: d.flavorTags,
        memo: d.memo.trim(),
      });
      toast({ title: "기록되었습니다." });
      setD(EMPTY);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/staff/espresso-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/espresso-logs/beans"] });
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
            <button
              className="s-icon"
              onClick={() => {
                setOpen(false);
                setD(EMPTY);
              }}
              aria-label="닫기"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="s-card">
            <label className="s-label">원두</label>
            <input
              className="s-input"
              value={d.beanName}
              onChange={(e) => set({ beanName: e.target.value })}
              placeholder="예: 코튼 블렌드"
              data-testid="input-bean-name"
            />
            {(beans?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {beans!.slice(0, 6).map((b) => (
                  <button key={b} className={`s-chip ${d.beanName === b ? "on" : ""}`} onClick={() => set({ beanName: b })}>
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="s-card">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="도징 (g)" value={d.doseG} onChange={(v) => set({ doseG: v })} placeholder="20" />
              <Field label="추출량 (g)" value={d.yieldG} onChange={(v) => set({ yieldG: v })} placeholder="40" />
              <Field label="시간 (초)" value={d.timeSec} onChange={(v) => set({ timeSec: v })} placeholder="27" />
              <Field label="물 온도 (℃)" value={d.waterTemp} onChange={(v) => set({ waterTemp: v })} placeholder="93" />
              <Field label="분쇄도" value={d.grindSetting} onChange={(v) => set({ grindSetting: v })} placeholder="4.2" text />
              <Field label="TDS" value={d.tds} onChange={(v) => set({ tds: v })} placeholder="9.2%" text />
            </div>
            <div className="mt-3">
              <label className="s-label">머신</label>
              <input
                className="s-input"
                value={d.machine}
                onChange={(e) => set({ machine: e.target.value })}
                placeholder="예: 라마르조꼬"
              />
            </div>
          </div>

          <div className="s-card">
            <label className="s-label">평가</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => set({ rating: d.rating === n ? 0 : n })}
                  data-testid={`star-${n}`}
                  className="p-0.5"
                  aria-label={`${n}점`}
                >
                  <Star
                    className="h-6 w-6"
                    strokeWidth={1.4}
                    style={
                      n <= d.rating
                        ? { fill: "var(--s-ink)", color: "var(--s-ink)" }
                        : { color: "var(--s-faint)" }
                    }
                  />
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="s-label">맛 노트</label>
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

            <div className="mt-4">
              <label className="s-label">메모</label>
              <textarea
                className="s-input"
                value={d.memo}
                onChange={(e) => set({ memo: e.target.value })}
                rows={2}
                placeholder="세팅을 바꾼 이유, 특이사항 등"
              />
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
            <button className="s-pill" onClick={save} disabled={busy} data-testid="button-save-espresso">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
            </button>
            <button
              className="s-pill line"
              style={{ paddingLeft: 22, paddingRight: 22 }}
              onClick={() => {
                setOpen(false);
                setD(EMPTY);
              }}
            >
              취소
            </button>
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
          return (
            <div key={l.id} className="s-card" data-testid={`row-espresso-${l.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{l.beanName}</div>
                  <div className="s-k mt-0.5">
                    {shortDate(l.logDate)} · {l.staffName}
                    {l.rating > 0 ? ` · ${"★".repeat(l.rating)}` : ""}
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
                  {l.timeSec || 0}초 · {l.waterTemp || 0}℃
                </span>
              </div>

              {(l.grindSetting || l.tds) && (
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
                  {l.grindSetting ? `분쇄 ${l.grindSetting}` : ""}
                  {l.grindSetting && l.tds ? " · " : ""}
                  {l.tds ? `TDS ${l.tds}` : ""}
                </div>
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

              {l.memo && (
                <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
                  {l.memo}
                </p>
              )}
            </div>
          );
        })
      )}
    </StaffLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  text,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  text?: boolean;
}) {
  return (
    <div>
      <label className="s-label">{label}</label>
      <input
        className="s-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={text ? undefined : "decimal"}
      />
    </div>
  );
}
