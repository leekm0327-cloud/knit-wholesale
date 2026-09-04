import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { HandoverRow, PrepTask, PrepTaskPreset, StaffEvent } from "@shared/schema";
import { STAFF_EVENT_KIND_LABEL, STAFF_EVENT_KINDS } from "@shared/schema";
import { AlertCircle, ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from "lucide-react";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${iso} (${dow})`;
}
function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminStaffHandover() {
  const { toast } = useToast();
  const { user } = useAuth();
  // 서버가 requireOwner 로 막는 삭제는 매니저에게 버튼 자체를 보이지 않는다 (누르면 403 나던 문제)
  const isOwner = (user as any)?.adminRole === "owner";
  const [from, setFrom] = useState(addDays(today(), -13));
  const [to, setTo] = useState(addDays(today(), 14));

  // 준비 작업 추가 폼
  const [tDate, setTDate] = useState(today());
  const [tTitle, setTTitle] = useState("");
  const [tMemo, setTMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const hKey = `/api/admin/staff/handover?from=${from}&to=${to}`;
  const pKey = `/api/admin/staff/prep-tasks?from=${from}&to=${to}`;
  const { data: hData, isLoading: hLoading } = useQuery<{ rows: HandoverRow[] }>({ queryKey: [hKey] });
  const { data: pData, isLoading: pLoading } = useQuery<{ rows: PrepTask[] }>({ queryKey: [pKey] });
  const { data: presets } = useQuery<PrepTaskPreset[]>({ queryKey: ["/api/admin/staff/prep-presets"] });

  // 자주 하는 일 등록 폼
  const [pTitle, setPTitle] = useState("");
  const [pMemo, setPMemo] = useState("");

  // 일정 등록 폼
  const eKey = `/api/admin/staff/events?from=${from}&to=${to}`;
  const { data: eData } = useQuery<{ rows: StaffEvent[] }>({ queryKey: [eKey] });
  const [evTitle, setEvTitle] = useState("");
  const [evKind, setEvKind] = useState<string>("order");
  const [evStart, setEvStart] = useState(today());
  const [evEnd, setEvEnd] = useState(today());
  const [evMemo, setEvMemo] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [hKey] });
    queryClient.invalidateQueries({ queryKey: [pKey] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/prep-presets"] });
    queryClient.invalidateQueries({ queryKey: [eKey] });
  };

  async function addEvent() {
    if (!evTitle.trim()) {
      toast({ variant: "destructive", title: "일정 이름을 입력해 주세요." });
      return;
    }
    try {
      await apiRequest("POST", "/api/admin/staff/events", {
        title: evTitle.trim(),
        kind: evKind,
        startDate: evStart,
        endDate: evEnd || evStart,
        memo: evMemo.trim(),
      });
      toast({ title: "일정을 등록했습니다." });
      setEvTitle("");
      setEvMemo("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    }
  }

  async function delEvent(e: StaffEvent) {
    if (!confirm(`'${e.title}' 일정을 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/events/${e.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function addPreset() {
    if (!pTitle.trim()) {
      toast({ variant: "destructive", title: "이름을 입력해 주세요." });
      return;
    }
    try {
      await apiRequest("POST", "/api/admin/staff/prep-presets", { title: pTitle.trim(), memo: pMemo.trim() });
      setPTitle("");
      setPMemo("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    }
  }

  async function movePreset(id: number, dir: -1 | 1) {
    try {
      await apiRequest("POST", `/api/admin/staff/prep-presets/${id}/move`, { dir });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "이동 실패", description: errMsg(err) });
    }
  }

  async function delPreset(p: PrepTaskPreset) {
    if (!confirm(`'${p.title}' 을(를) 목록에서 지울까요?\n이미 날짜에 걸어둔 작업은 그대로 남습니다.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/prep-presets/${p.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function addTask() {
    if (!tTitle.trim()) {
      toast({ variant: "destructive", title: "할 일을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/prep-tasks", {
        workDate: tDate,
        title: tTitle.trim(),
        memo: tMemo.trim(),
      });
      toast({ title: "준비 작업을 등록했습니다." });
      setTTitle("");
      setTMemo("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function delTask(t: PrepTask) {
    if (!confirm(`'${t.title}' 을(를) 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/prep-tasks/${t.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function delHandover(h: HandoverRow) {
    if (!confirm("이 인수인계를 지울까요?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/handover/${h.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  // 날짜별로 묶기
  const tasksByDate = new Map<string, PrepTask[]>();
  for (const t of pData?.rows ?? []) {
    const arr = tasksByDate.get(t.workDate) ?? [];
    arr.push(t);
    tasksByDate.set(t.workDate, arr);
  }
  const handoversByDate = new Map<string, HandoverRow[]>();
  for (const h of hData?.rows ?? []) {
    const arr = handoversByDate.get(h.workDate) ?? [];
    arr.push(h);
    handoversByDate.set(h.workDate, arr);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Handover</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">인수인계 · 일정</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          직원들이 남긴 인수인계를 보고, 준비 작업과 일정을 날짜에 걸어둘 수 있습니다. 여기에 등록한 일정은 직원 앱
          첫 화면의 2주 달력에 바로 뜹니다.
        </p>

        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </Card>

        {/* 일정 등록 */}
        <Card className="mb-5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">일정 등록</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            디저트 단체 주문처럼 다 같이 알아야 하는 일을 날짜에 걸어둡니다. 직원 앱 첫 화면 달력에 색 막대로 표시됩니다.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">종류</Label>
              <select
                value={evKind}
                onChange={(e) => setEvKind(e.target.value)}
                className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
                data-testid="select-event-kind"
              >
                {STAFF_EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {STAFF_EVENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <Label className="text-xs text-muted-foreground">이름</Label>
              <Input
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                placeholder="예: 디저트 단체 주문 30개"
                data-testid="input-admin-event-title"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">시작일</Label>
              <Input
                type="date"
                value={evStart}
                onChange={(e) => {
                  setEvStart(e.target.value);
                  if (e.target.value > evEnd) setEvEnd(e.target.value);
                }}
                className="w-40"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">종료일</Label>
              <Input type="date" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} className="w-40" />
            </div>
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs text-muted-foreground">메모 (선택)</Label>
              <Input value={evMemo} onChange={(e) => setEvMemo(e.target.value)} placeholder="수량, 픽업 시간 등" />
            </div>
            <Button onClick={addEvent} data-testid="button-admin-add-event">
              <Plus className="h-4 w-4" />
              등록
            </Button>
          </div>

          {(eData?.rows ?? []).length > 0 && (
            <div className="mt-4 divide-y rounded-md border">
              {(eData?.rows ?? []).map((e) => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2" data-testid={`admin-event-${e.id}`}>
                  <Badge variant="secondary" className="text-[10px]">
                    {STAFF_EVENT_KIND_LABEL[e.kind] ?? "기타"}
                  </Badge>
                  <span className="text-sm text-foreground">{e.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {e.startDate}
                    {e.startDate !== e.endDate ? ` ~ ${e.endDate}` : ""}
                    {e.memo ? ` · ${e.memo}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => delEvent(e)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 준비 작업 등록 */}
        <Card className="mb-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">준비 작업 등록</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">날짜</Label>
              <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} className="w-40" />
            </div>
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs text-muted-foreground">할 일</Label>
              <Input
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                placeholder="예: 휘낭시에 반죽"
                data-testid="input-admin-prep-title"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs text-muted-foreground">메모 (선택)</Label>
              <Input value={tMemo} onChange={(e) => setTMemo(e.target.value)} placeholder="분량, 주의사항 등" />
            </div>
            <Button onClick={addTask} disabled={busy} data-testid="button-admin-add-prep">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              등록
            </Button>
          </div>
          {(presets ?? []).filter((p) => p.active === 1).length > 0 && (
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">자주 하는 일에서 고르기</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(presets ?? [])
                  .filter((p) => p.active === 1)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setTTitle(p.title);
                        setTMemo(p.memo);
                      }}
                      className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover-elevate"
                      data-testid={`admin-preset-pick-${p.id}`}
                    >
                      {p.title}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            등록하면 그 날짜의 직원 앱 생산일지 화면에 뜨고, 담당자가 완료를 체크합니다.
          </p>
        </Card>

        {/* 자주 하는 일 목록 */}
        <Card className="mb-5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">자주 하는 일 목록</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            여기에 저장해 두면 직원 앱에서 타이핑 없이 골라서 그날 할 일로 넣을 수 있습니다. 위에 있는 것부터 보입니다.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Label className="text-xs text-muted-foreground">이름</Label>
              <Input
                value={pTitle}
                onChange={(e) => setPTitle(e.target.value)}
                placeholder="예: 에그타르트 필링"
                data-testid="input-preset-title"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Label className="text-xs text-muted-foreground">메모 (선택)</Label>
              <Input value={pMemo} onChange={(e) => setPMemo(e.target.value)} placeholder="분량, 주의사항 등" />
            </div>
            <Button onClick={addPreset} data-testid="button-add-preset">
              <Plus className="h-4 w-4" />
              목록에 추가
            </Button>
          </div>

          {(presets ?? []).length > 0 && (
            <div className="mt-4 divide-y rounded-md border">
              {(presets ?? []).map((p, i, arr) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2" data-testid={`preset-row-${p.id}`}>
                  <span className="text-sm text-foreground">{p.title}</span>
                  {p.memo && <span className="text-[11px] text-muted-foreground">{p.memo}</span>}
                  <div className="ml-auto flex items-center gap-0.5">
                    <Button size="sm" variant="ghost" onClick={() => movePreset(p.id, -1)} disabled={i === 0} aria-label="위로">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => movePreset(p.id, 1)}
                      disabled={i === arr.length - 1}
                      aria-label="아래로"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => delPreset(p)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 준비 작업 목록 */}
        <Card className="mb-5 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">준비 작업</h2>
          </div>
          {pLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (pData?.rows ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">이 기간에 등록된 준비 작업이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {Array.from(tasksByDate.keys()).sort().map((date) => (
                <div key={date} className="p-4">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">{fmtDay(date)}</div>
                  <div className="space-y-1.5">
                    {tasksByDate.get(date)!.map((t) => (
                      <div key={t.id} className="flex items-center gap-2" data-testid={`admin-prep-${t.id}`}>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                            t.done === 1 ? "bg-foreground text-background" : "border"
                          }`}
                        >
                          {t.done === 1 && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className={`text-sm ${t.done === 1 ? "text-muted-foreground line-through" : ""}`}>
                          {t.title}
                        </span>
                        {t.memo && <span className="text-[11px] text-muted-foreground">{t.memo}</span>}
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {t.done === 1 ? `${t.doneByName} 완료` : t.createdByName ? `${t.createdByName} 등록` : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => delTask(t)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 인수인계 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">인수인계</h2>
          </div>
          {hLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (hData?.rows ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">이 기간에 남겨진 인수인계가 없습니다.</p>
          ) : (
            <div className="divide-y">
              {Array.from(handoversByDate.keys())
                .sort()
                .reverse()
                .map((date) => (
                  <div key={date} className="p-4">
                    <div className="mb-2 text-xs font-semibold text-muted-foreground">{fmtDay(date)}</div>
                    <div className="space-y-3">
                      {handoversByDate.get(date)!.map((h) => (
                        <div key={h.id} className="rounded-md bg-muted/30 p-3" data-testid={`admin-handover-${h.id}`}>
                          <div className="flex items-center gap-1.5">
                            {h.important === 1 && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                            <span className="text-sm font-semibold text-foreground">{h.staffName}</span>
                            <span className="text-[11px] text-muted-foreground">{hhmm(h.createdAt)}</span>
                            {isOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => delHandover(h)}
                                className="ml-auto text-muted-foreground hover:text-destructive"
                                aria-label="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{h.body}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {h.readers.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">확인한 사람 없음</span>
                            ) : (
                              h.readers.map((r) => (
                                <Badge key={r.staffId} variant="secondary" className="text-[10px]">
                                  {r.staffName} 확인
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
