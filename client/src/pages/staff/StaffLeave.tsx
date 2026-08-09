import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import {
  LEAVE_STATUS_LABEL,
  LEAVE_GRANT_KIND_LABEL,
  type LeaveBalance,
  type LeaveGrant,
  type LeaveRequest,
  type LeaveStatus,
} from "@shared/schema";
import { Loader2, Plus, Trash2, CalendarOff, AlertTriangle } from "lucide-react";

type Res =
  | { enabled: false }
  | { enabled: true; balance: LeaveBalance | null; grants: LeaveGrant[]; requests: LeaveRequest[] };

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 0.5 단위를 보기 좋게 */
function d(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function StaffLeave() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<Res>({ queryKey: ["/api/staff/leave"] });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/staff/leave"] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
  };

  async function submit() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/leave/requests", {
        startDate: start,
        endDate: half ? start : end,
        halfDay: half,
        reason: reason.trim(),
      });
      toast({ title: "신청되었습니다.", description: "대표님 승인 후 확정됩니다." });
      setOpen(false);
      setReason("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "신청 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: number) {
    if (!confirm("이 신청을 취소할까요?")) return;
    try {
      await apiRequest("DELETE", `/api/staff/leave/requests/${id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "취소 실패", description: errMsg(err) });
    }
  }

  if (isLoading) {
    return (
      <StaffLayout title="연차">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </StaffLayout>
    );
  }

  if (!data || data.enabled === false) {
    return (
      <StaffLayout title="연차">
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <CalendarOff className="h-10 w-10 text-muted-foreground/50" />
          <p className="px-6 text-sm text-muted-foreground">연차 적용 대상이 아닙니다.</p>
        </Card>
      </StaffLayout>
    );
  }

  const bal = data.balance;
  const available = Math.max(0, (bal?.remaining ?? 0) - (bal?.pending ?? 0));

  return (
    <StaffLayout title="연차" subtitle={bal?.hireDate ? `입사일 ${bal.hireDate}` : ""}>
      {/* 잔여 */}
      <Card className="p-5 text-center">
        <div className="font-ui text-[11px] font-semibold tracking-widest text-muted-foreground">REMAINING</div>
        <div className="font-display mt-1 text-4xl font-semibold text-foreground">
          {d(bal?.remaining ?? 0)}
          <span className="ml-1 text-base font-normal text-muted-foreground">일</span>
        </div>
        <div className="mt-3 flex justify-center gap-4 text-[11px] text-muted-foreground">
          <span>부여 {d(bal?.granted ?? 0)}일</span>
          <span>사용 {d(bal?.used ?? 0)}일</span>
          {(bal?.pending ?? 0) > 0 && <span className="text-foreground">대기 {d(bal!.pending)}일</span>}
        </div>
        {(bal?.expiringSoon ?? 0) > 0 && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {bal!.expiringDate}에 {d(bal!.expiringSoon)}일 소멸 예정
          </div>
        )}
      </Card>

      {!open && (
        <Button className="mt-4 w-full" onClick={() => setOpen(true)} data-testid="button-open-leave-form">
          <Plus className="h-4 w-4" />
          연차 신청
        </Button>
      )}

      {open && (
        <Card className="mt-4 p-5">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={half}
                onChange={(e) => setHalf(e.target.checked)}
                data-testid="checkbox-half-day"
              />
              반차 (0.5일)
            </label>
            <div>
              <Label className="text-xs text-muted-foreground">{half ? "날짜" : "시작일"}</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > end) setEnd(e.target.value);
                }}
                data-testid="input-leave-start"
              />
            </div>
            {!half && (
              <div>
                <Label className="text-xs text-muted-foreground">종료일</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="input-leave-end" />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">사유 (선택)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 개인 일정" />
            </div>
            <p className="text-[11px] text-muted-foreground">신청 가능 {d(available)}일</p>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={submit} disabled={busy} data-testid="button-submit-leave">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "신청"}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            </div>
          </div>
        </Card>
      )}

      {/* 신청 내역 */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">신청 내역</h2>
      {data.requests.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">신청한 연차가 없습니다.</Card>
      ) : (
        <div className="space-y-2">
          {data.requests.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3 p-4" data-testid={`row-leave-${r.id}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {r.startDate}
                    {r.startDate !== r.endDate ? ` ~ ${r.endDate}` : ""}
                  </span>
                  <Badge
                    variant={r.status === "approved" ? "default" : r.status === "rejected" ? "secondary" : "outline"}
                    className="text-[10px]"
                  >
                    {LEAVE_STATUS_LABEL[r.status as LeaveStatus] ?? r.status}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {d(r.days)}일{r.halfDay === 1 ? " (반차)" : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                </div>
                {r.adminMemo && <p className="mt-1 text-[11px] text-muted-foreground">메모: {r.adminMemo}</p>}
              </div>
              {r.status === "pending" && (
                <button onClick={() => cancel(r.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 부여 내역 */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-foreground">부여 내역</h2>
      {data.grants.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">부여된 연차가 없습니다.</Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {data.grants.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
              <div>
                <div className="text-foreground">{g.grantDate}</div>
                <div className="text-[10px] text-muted-foreground">
                  {LEAVE_GRANT_KIND_LABEL[g.kind] ?? g.kind} · {g.expiresAt} 소멸
                </div>
              </div>
              <span className="font-display tabular font-semibold text-foreground">+{d(g.days)}일</span>
            </div>
          ))}
        </Card>
      )}

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        연차는 발생일로부터 1년 안에 쓰지 않으면 없어집니다.
      </p>
    </StaffLayout>
  );
}
