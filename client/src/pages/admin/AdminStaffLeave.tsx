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
import { errMsg, fmtDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_GRANT_KIND_LABEL,
  type LeaveBalance,
  type LeaveGrant,
  type LeaveRequest,
  type LeaveStatus,
  type PublicStaff,
} from "@shared/schema";
import { Loader2, Check, X, Trash2, CalendarOff, AlertTriangle, Plus } from "lucide-react";

type Res = {
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  grants: LeaveGrant[];
  staff: PublicStaff[];
};

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function d(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function AdminStaffLeave() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const [busy, setBusy] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [gStaff, setGStaff] = useState("");
  const [gDays, setGDays] = useState("1");
  const [gDate, setGDate] = useState(today());
  const [gMemo, setGMemo] = useState("");

  const { data, isLoading } = useQuery<Res>({ queryKey: ["/api/admin/staff/leave"], refetchInterval: 60000 });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/leave"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/leave/pending-count"] });
  };

  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
  const decided = (data?.requests ?? []).filter((r) => r.status !== "pending");
  const nameOf = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));

  async function decide(id: number, status: "approved" | "rejected") {
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/admin/staff/leave/requests/${id}`, { status });
      toast({ title: status === "approved" ? "승인했습니다." : "반려했습니다." });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "처리 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function addGrant() {
    const staffId = Number(gStaff);
    const days = Number(gDays);
    if (!staffId) {
      toast({ variant: "destructive", title: "직원을 선택해 주세요." });
      return;
    }
    if (!Number.isFinite(days) || days === 0) {
      toast({ variant: "destructive", title: "일수를 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/leave/grants", {
        staffId,
        days,
        grantDate: gDate,
        memo: gMemo.trim(),
      });
      toast({ title: "부여되었습니다." });
      setGrantOpen(false);
      setGMemo("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "부여 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removeGrant(id: number) {
    if (!confirm("이 부여 기록을 지울까요? 자동 부여분은 다음 조회 때 다시 생깁니다.")) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/leave/grants/${id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Annual Leave</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">연차 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          입사일 기준으로 자동 부여되며, 발생일로부터 1년이 지나면 소멸합니다. 직원 계정에서 입사일과 연차 적용을 켜야
          집계됩니다.
        </p>

        {/* 대기 중 신청 */}
        <Card className="mb-5 overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">승인 대기</h2>
            {pending.length > 0 && <Badge className="text-[11px]">{pending.length}건</Badge>}
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">대기 중인 신청이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {pending.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`row-pending-${r.id}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {r.staffName} · {r.startDate}
                      {r.startDate !== r.endDate ? ` ~ ${r.endDate}` : ""}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {d(r.days)}일{r.halfDay === 1 ? " (반차)" : ""} · 신청 {fmtDateTime(r.createdAt)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={busy}>
                      <Check className="h-3.5 w-3.5" />
                      승인
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")} disabled={busy}>
                      <X className="h-3.5 w-3.5" />
                      반려
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 직원별 현황 */}
        <Card className="mb-5 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">직원별 현황</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (data?.balances ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <CalendarOff className="h-10 w-10 text-muted-foreground/50" />
              <p className="px-6 text-sm text-muted-foreground">
                연차 적용 중인 직원이 없습니다.
                <br />
                직원 계정에서 입사일을 넣고 연차 적용을 켜주세요.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {data!.balances.map((b) => (
                <div key={b.staffId} className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      입사 {b.hireDate || "-"} · 부여 {d(b.granted)}일 · 사용 {d(b.used)}일
                      {b.pending > 0 ? ` · 대기 ${d(b.pending)}일` : ""}
                    </div>
                    {b.expiringSoon > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {b.expiringDate}에 {d(b.expiringSoon)}일 소멸 예정
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">잔여</div>
                    <div className="font-display tabular text-xl font-semibold text-foreground">{d(b.remaining)}일</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 수동 부여 */}
        {isOwner && (
          <Card className="mb-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">연차 수동 부여</h2>
              <Button variant="ghost" size="sm" onClick={() => setGrantOpen((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                {grantOpen ? "닫기" : "부여"}
              </Button>
            </div>
            {grantOpen && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">직원</Label>
                  <select
                    value={gStaff}
                    onChange={(e) => setGStaff(e.target.value)}
                    className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">선택</option>
                    {(data?.staff ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">일수 (음수 가능)</Label>
                  <Input value={gDays} onChange={(e) => setGDays(e.target.value)} className="w-24" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">발생일</Label>
                  <Input type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">메모</Label>
                  <Input value={gMemo} onChange={(e) => setGMemo(e.target.value)} placeholder="예: 포상" className="w-40" />
                </div>
                <Button onClick={addGrant} disabled={busy} data-testid="button-add-grant">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
                </Button>
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              수동 부여도 발생일로부터 1년 뒤 소멸합니다. 차감하려면 일수에 음수를 넣으세요.
            </p>
          </Card>
        )}

        {/* 처리된 신청 */}
        <Card className="mb-5 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">처리 내역</h2>
          </div>
          {decided.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">처리된 신청이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {decided.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-foreground">
                        {r.staffName} · {r.startDate}
                        {r.startDate !== r.endDate ? ` ~ ${r.endDate}` : ""}
                      </span>
                      <Badge
                        variant={r.status === "approved" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {LEAVE_STATUS_LABEL[r.status as LeaveStatus] ?? r.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {d(r.days)}일{r.decidedByName ? ` · ${r.decidedByName}` : ""}
                      {r.decidedAt ? ` · ${fmtDateTime(r.decidedAt)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm("이 기록을 지울까요?")) return;
                      await apiRequest("DELETE", `/api/admin/staff/leave/requests/${r.id}`);
                      invalidate();
                    }}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 부여 이력 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">부여 이력</h2>
          </div>
          {(data?.grants ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">부여 기록이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {data!.grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div>
                    <div className="text-foreground">
                      {nameOf.get(g.staffId) ?? "-"} · {g.grantDate}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {LEAVE_GRANT_KIND_LABEL[g.kind] ?? g.kind} · {g.expiresAt} 소멸
                      {g.memo ? ` · ${g.memo}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display tabular font-semibold text-foreground">
                      {g.days > 0 ? "+" : ""}
                      {d(g.days)}일
                    </span>
                    {isOwner && (
                      <button onClick={() => removeGrant(g.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
