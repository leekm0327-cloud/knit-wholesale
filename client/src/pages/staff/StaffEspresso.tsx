import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { EspressoLog } from "@shared/schema";
import { Loader2, Plus, Trash2, Star } from "lucide-react";

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
    try {
      await apiRequest("DELETE", `/api/staff/espresso-logs/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/staff/espresso-logs"] });
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <StaffLayout title="에스프레소 추출 기록" subtitle="이번 달 기록입니다">
      {!open && (
        <Button className="w-full" onClick={() => setOpen(true)} data-testid="button-open-espresso-form">
          <Plus className="h-4 w-4" />
          오늘 추출 기록하기
        </Button>
      )}

      {open && (
        <Card className="p-5">
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">원두</Label>
              <Input
                value={d.beanName}
                onChange={(e) => set({ beanName: e.target.value })}
                placeholder="예: 코튼 블렌드"
                data-testid="input-bean-name"
              />
              {(beans?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {beans!.slice(0, 8).map((b) => (
                    <button
                      key={b}
                      onClick={() => set({ beanName: b })}
                      className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover-elevate"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="도징 (g)" value={d.doseG} onChange={(v) => set({ doseG: v })} placeholder="20" />
              <Field label="추출량 (g)" value={d.yieldG} onChange={(v) => set({ yieldG: v })} placeholder="40" />
              <Field label="시간 (초)" value={d.timeSec} onChange={(v) => set({ timeSec: v })} placeholder="27" />
              <Field label="물 온도 (℃)" value={d.waterTemp} onChange={(v) => set({ waterTemp: v })} placeholder="93" />
              <Field label="분쇄도" value={d.grindSetting} onChange={(v) => set({ grindSetting: v })} placeholder="4.2" text />
              <Field label="TDS" value={d.tds} onChange={(v) => set({ tds: v })} placeholder="9.2%" text />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">머신</Label>
              <Input value={d.machine} onChange={(e) => set({ machine: e.target.value })} placeholder="예: 라마르조꼬" />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">평가</Label>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => set({ rating: d.rating === n ? 0 : n })} data-testid={`star-${n}`}>
                    <Star
                      className={`h-6 w-6 ${n <= d.rating ? "fill-foreground text-foreground" : "text-muted-foreground/40"}`}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">맛 노트</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {FLAVORS.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleFlavor(f)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] hover-elevate ${
                      d.flavorTags.includes(f) ? "border-foreground text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">메모</Label>
              <Textarea
                value={d.memo}
                onChange={(e) => set({ memo: e.target.value })}
                rows={2}
                placeholder="세팅을 바꾼 이유, 특이사항 등"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={save} disabled={busy} data-testid="button-save-espresso">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
              </Button>
              <Button variant="outline" onClick={() => { setOpen(false); setD(EMPTY); }}>
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-5 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (logs?.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">아직 기록이 없습니다.</p>
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
              <Card key={l.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{l.beanName}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {l.logDate} · {l.staffName}
                      {l.rating > 0 ? ` · ${"★".repeat(l.rating)}` : ""}
                    </div>
                  </div>
                  {me?.id === l.staffId && (
                    <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="font-display tabular mt-2 text-xs text-muted-foreground">
                  {l.doseG || 0}g → {l.yieldG || 0}g · {l.timeSec || 0}초 · {l.waterTemp || 0}℃
                  {l.grindSetting ? ` · 분쇄 ${l.grindSetting}` : ""}
                  {l.tds ? ` · TDS ${l.tds}` : ""}
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
                {l.memo && <p className="mt-2 text-xs text-muted-foreground">{l.memo}</p>}
              </Card>
            );
          })
        )}
      </div>
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={text ? undefined : "decimal"}
      />
    </div>
  );
}
