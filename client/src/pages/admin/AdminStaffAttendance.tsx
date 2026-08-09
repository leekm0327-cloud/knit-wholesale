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
import { errMsg, won } from "@/lib/format";
import type { Attendance, PublicStaff, AttendanceSummaryRow } from "@shared/schema";
import { Clock, Loader2, Save } from "lucide-react";

type Row = Attendance & { minutes: number; staffName: string };
type Res = { rows: Row[]; summary: AttendanceSummaryRow[]; staff: PublicStaff[]; from: string; to: string };

function monthStart(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function hhmm(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** "09:30" + 날짜 → epoch ms (로컬 기준) */
function toTs(date: string, hm: string): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function fmtMinutes(m: number): string {
  if (!m) return "-";
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export default function AdminStaffAttendance() {
  const { toast } = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [edit, setEdit] = useState<Record<number, { inT: string; outT: string; brk: string }>>({});
  const [busy, setBusy] = useState(false);

  // 수동 입력 폼
  const [mStaff, setMStaff] = useState("");
  const [mDate, setMDate] = useState(today());
  const [mIn, setMIn] = useState("09:00");
  const [mOut, setMOut] = useState("18:00");

  const key = `/api/admin/staff/attendance?from=${from}&to=${to}`;
  const { data, isLoading } = useQuery<Res>({ queryKey: [key] });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });

  async function saveRow(r: Row) {
    const e = edit[r.id] ?? { inT: hhmm(r.clockInAt), outT: hhmm(r.clockOutAt), brk: String(r.breakMinutes) };
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/attendance", {
        staffId: r.staffId,
        workDate: r.workDate,
        clockInAt: toTs(r.workDate, e.inT),
        clockOutAt: toTs(r.workDate, e.outT),
        breakMinutes: Number(e.brk) || 0,
      });
      toast({ title: "저장되었습니다." });
      setEdit((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    const staffId = Number(mStaff);
    if (!staffId) {
      toast({ variant: "destructive", title: "직원을 선택해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/attendance", {
        staffId,
        workDate: mDate,
        clockInAt: toTs(mDate, mIn),
        clockOutAt: toTs(mDate, mOut),
        breakMinutes: 0,
      });
      toast({ title: "근태가 입력되었습니다." });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "입력 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const totalMinutes = (data?.summary ?? []).reduce((s, r) => s + r.minutes, 0);
  const totalPay = (data?.summary ?? []).reduce((s, r) => s + r.estimatedPay, 0);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Attendance</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">근태 현황</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          직원이 직접 찍은 출퇴근 기록입니다. 빠뜨렸거나 잘못 찍힌 기록은 이 화면에서 고칠 수 있습니다.
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

        {/* 요약 */}
        <Card className="mb-5 overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">직원별 합계</h2>
            <div className="text-xs text-muted-foreground">
              총 {fmtMinutes(totalMinutes)}
              {totalPay > 0 ? ` · 예상 인건비 ${won(totalPay)}` : ""}
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.summary ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {data!.summary.map((s) => (
                <div key={s.staffId} className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.position} · {s.days}일 근무</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display tabular text-sm font-semibold text-foreground">{fmtMinutes(s.minutes)}</div>
                    {s.hourlyWage > 0 && (
                      <div className="text-[11px] text-muted-foreground">{won(s.estimatedPay)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 수동 입력 */}
        <Card className="mb-5 p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">근태 수동 입력</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">직원</Label>
              <select
                value={mStaff}
                onChange={(e) => setMStaff(e.target.value)}
                className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">선택</option>
                {(data?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">날짜</Label>
              <Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">출근</Label>
              <Input type="time" value={mIn} onChange={(e) => setMIn(e.target.value)} className="w-28" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">퇴근</Label>
              <Input type="time" value={mOut} onChange={(e) => setMOut(e.target.value)} className="w-28" />
            </div>
            <Button onClick={addManual} disabled={busy} data-testid="button-add-attendance">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "입력"}
            </Button>
          </div>
        </Card>

        {/* 상세 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">일별 기록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Clock className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">이 기간에 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data!.rows.map((r) => {
                const e = edit[r.id] ?? { inT: hhmm(r.clockInAt), outT: hhmm(r.clockOutAt), brk: String(r.breakMinutes) };
                const dirty = !!edit[r.id];
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-attendance-${r.id}`}>
                    <div className="w-32 shrink-0">
                      <div className="text-sm font-semibold text-foreground">{r.staffName}</div>
                      <div className="text-[11px] text-muted-foreground">{r.workDate}</div>
                    </div>
                    <Input
                      type="time"
                      value={e.inT}
                      onChange={(ev) => setEdit((p) => ({ ...p, [r.id]: { ...e, inT: ev.target.value } }))}
                      className="w-28"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={e.outT}
                      onChange={(ev) => setEdit((p) => ({ ...p, [r.id]: { ...e, outT: ev.target.value } }))}
                      className="w-28"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        value={e.brk}
                        onChange={(ev) => setEdit((p) => ({ ...p, [r.id]: { ...e, brk: ev.target.value } }))}
                        inputMode="numeric"
                        className="w-16"
                      />
                      <span className="text-[11px] text-muted-foreground">분 휴게</span>
                    </div>
                    <div className="font-display tabular ml-auto text-sm text-foreground">{fmtMinutes(r.minutes)}</div>
                    {r.editedByAdmin === 1 && <Badge variant="secondary" className="text-[10px]">수정됨</Badge>}
                    {dirty && (
                      <Button size="sm" onClick={() => saveRow(r)} disabled={busy}>
                        <Save className="h-3.5 w-3.5" />
                        저장
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
