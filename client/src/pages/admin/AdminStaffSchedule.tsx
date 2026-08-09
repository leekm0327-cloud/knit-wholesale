import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { SHIFT_POSITIONS, type Shift, type PublicStaff } from "@shared/schema";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function weekStart(base: Date): Date {
  const d = new Date(base);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Res = { shifts: Shift[]; staff: PublicStaff[]; from: string; to: string };

export default function AdminStaffSchedule() {
  const { toast } = useToast();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({ staffId: "", startTime: "09:00", endTime: "18:00", position: "" });

  const base = new Date();
  base.setDate(base.getDate() + offset * 7);
  const start = weekStart(base);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const todayStr = ymd(new Date());

  const key = `/api/admin/staff/shifts?from=${from}&to=${to}`;
  const { data, isLoading } = useQuery<Res>({ queryKey: [key] });
  const nameOf = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });

  async function add(dateStr: string) {
    const staffId = Number(draft.staffId);
    if (!staffId) {
      toast({ variant: "destructive", title: "직원을 선택해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/shifts", {
        staffId,
        workDate: dateStr,
        startTime: draft.startTime,
        endTime: draft.endTime,
        position: draft.position,
      });
      toast({ title: "스케줄이 추가되었습니다." });
      setAddFor(null);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await apiRequest("DELETE", `/api/admin/staff/shifts/${id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Schedule</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">근무 스케줄</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          여기서 짠 스케줄이 직원 앱의 스케줄표와 홈 화면에 그대로 표시됩니다.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
            이전 주
          </Button>
          <span className="text-sm text-muted-foreground">{from} ~ {to}</span>
          <Button variant="outline" size="sm" onClick={() => setOffset((o) => o + 1)}>
            다음 주
            <ChevronRight className="h-4 w-4" />
          </Button>
          {offset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>이번 주</Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : (
          <div className="space-y-3">
            {days.map((d) => {
              const dateStr = ymd(d);
              const rows = (data?.shifts ?? []).filter((s) => s.workDate === dateStr);
              return (
                <Card key={dateStr} className={`p-4 ${dateStr === todayStr ? "border-foreground" : ""}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-foreground">
                        {d.getMonth() + 1}.{d.getDate()}
                      </span>
                      <span className="text-xs text-muted-foreground">({DOW[d.getDay()]})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddFor(addFor === dateStr ? null : dateStr)}
                      data-testid={`button-add-shift-${dateStr}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      추가
                    </Button>
                  </div>

                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">근무 없음</p>
                  ) : (
                    <div className="space-y-1.5">
                      {rows.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <span className="text-sm text-foreground">
                            {nameOf.get(s.staffId) ?? "-"}
                            {s.position ? <span className="ml-1.5 text-xs text-muted-foreground">{s.position}</span> : null}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-display tabular text-xs text-muted-foreground">
                              {s.startTime} – {s.endTime}
                            </span>
                            <button onClick={() => remove(s.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {addFor === dateStr && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">직원</Label>
                        <select
                          value={draft.staffId}
                          onChange={(e) => setDraft((p) => ({ ...p, staffId: e.target.value }))}
                          className="h-9 w-32 rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">선택</option>
                          {(data?.staff ?? []).filter((s) => s.active === 1).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">시작</Label>
                        <Input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} className="w-28" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">종료</Label>
                        <Input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} className="w-28" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">포지션</Label>
                        <select
                          value={draft.position}
                          onChange={(e) => setDraft((p) => ({ ...p, position: e.target.value }))}
                          className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">없음</option>
                          {SHIFT_POSITIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <Button size="sm" onClick={() => add(dateStr)} disabled={busy}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "저장"}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
