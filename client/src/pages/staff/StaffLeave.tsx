import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
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
import { Loader2, Plus, Trash2, AlertTriangle, HelpCircle, ChevronDown, X } from "lucide-react";

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

const GUIDE: { q: string; a: React.ReactNode }[] = [
  {
    q: "연차가 무엇인가요",
    a: "쉬어도 급여가 나오는 휴가입니다. 정해진 일수만큼 쓸 수 있고, 쓰는 만큼 잔여에서 빠집니다.",
  },
  {
    q: "며칠이 생기나요",
    a: (
      <>
        입사일을 기준으로 자동으로 쌓입니다. 입사 1년 전까지는 매달 1일씩 생기고, 입사한 날과 같은 날짜에 하나씩
        늘어납니다. 입사 1년이 되는 날 15일이 한 번에 생기고, 그 뒤로는 매년 같은 날 다시 생깁니다. 3년째부터는 2년마다
        하루씩 늘어납니다.
      </>
    ),
  },
  {
    q: "언제까지 써야 하나요",
    a: "생긴 날로부터 1년입니다. 그 안에 쓰지 않으면 없어집니다. 아래 부여 내역에서 각각의 소멸일을 볼 수 있고, 소멸이 가까워지면 위쪽에 알려드립니다.",
  },
  {
    q: "어떻게 신청하나요",
    a: "연차 신청을 눌러 날짜를 고르면 됩니다. 하루만 쉬려면 시작일과 종료일을 같은 날로 두시고, 여러 날 이어서 쉬려면 기간으로 고르시면 됩니다. 반나절만 쉴 때는 반차를 켜면 0.5일만 차감됩니다.",
  },
  {
    q: "신청하면 바로 되나요",
    a: "대표님 승인이 있어야 확정됩니다. 승인 전까지는 대기로 뜨고, 이때는 직접 취소할 수 있습니다. 승인된 뒤에 사정이 바뀌면 대표님께 말씀해 주세요.",
  },
  {
    q: "알아두실 것",
    a: "잔여보다 많이 신청할 수는 없습니다. 대기 중인 신청도 미리 빼고 계산합니다. 근무표에 이미 들어가 있는 날이라면 미리 말씀해 주시는 편이 좋습니다.",
  },
];

export default function StaffLeave() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
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
      <StaffLayout title="연차" subtitle="휴가">
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      </StaffLayout>
    );
  }

  if (!data || data.enabled === false) {
    return (
      <StaffLayout title="연차" subtitle="휴가">
        <div className="s-card">
          <div className="s-empty">연차 적용 대상이 아닙니다.</div>
        </div>
      </StaffLayout>
    );
  }

  const bal = data.balance;
  const available = Math.max(0, (bal?.remaining ?? 0) - (bal?.pending ?? 0));

  return (
    <StaffLayout title="연차" subtitle="휴가">
      {/* 잔여 */}
      <div className="s-dark">
        <div className="s-k">남은 연차</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[34px] font-semibold leading-none tracking-tight">{d(bal?.remaining ?? 0)}</span>
          <span className="text-[14px]" style={{ color: "#a9aaa4" }}>
            일
          </span>
        </div>
        <div className="mt-3.5 flex gap-4 text-[11.5px]" style={{ color: "#a9aaa4" }}>
          <span>부여 {d(bal?.granted ?? 0)}일</span>
          <span>사용 {d(bal?.used ?? 0)}일</span>
          {(bal?.pending ?? 0) > 0 && <span style={{ color: "#fff" }}>대기 {d(bal!.pending)}일</span>}
        </div>
        {bal?.hireDate && (
          <div className="mt-1 text-[11px]" style={{ color: "#7b7c76" }}>
            입사일 {bal.hireDate}
          </div>
        )}
      </div>

      {(bal?.expiringSoon ?? 0) > 0 && (
        <div className="s-card mt-2.5 flex items-center gap-2" style={{ padding: "12px 14px" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "#a2483f" }} strokeWidth={1.8} />
          <span className="text-[12.5px]">
            {bal!.expiringDate}에 <b className="font-semibold">{d(bal!.expiringSoon)}일</b> 소멸 예정
          </span>
        </div>
      )}

      {/* 신청 */}
      {!open ? (
        <button className="s-pill wide mt-2.5" onClick={() => setOpen(true)} data-testid="button-open-leave-form">
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          연차 신청
        </button>
      ) : (
        <>
          <div className="s-sect flex items-center justify-between">
            <span>연차 신청</span>
            <button className="s-icon" onClick={() => setOpen(false)} aria-label="닫기">
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <div className="s-card">
            <div className="s-li" style={{ paddingTop: 2 }}>
              <span className="text-[13.5px]">반차 (0.5일)</span>
              <button
                onClick={() => setHalf((v) => !v)}
                className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
                style={{ background: half ? "var(--s-ink)" : "#dedcd6" }}
                data-testid="checkbox-half-day"
                aria-label="반차"
              >
                <span
                  className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
                  style={{ left: half ? 21 : 3 }}
                />
              </button>
            </div>

            <div className="mt-3">
              <label className="s-label">{half ? "날짜" : "시작일"}</label>
              <input
                className="s-input"
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
              <div className="mt-3">
                <label className="s-label">종료일</label>
                <input
                  className="s-input"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  data-testid="input-leave-end"
                />
              </div>
            )}

            <div className="mt-3">
              <label className="s-label">사유 (선택)</label>
              <input
                className="s-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 개인 일정"
              />
            </div>

            <p className="mt-3 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
              신청 가능 {d(available)}일
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
            <button className="s-pill" onClick={submit} disabled={busy} data-testid="button-submit-leave">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "신청"}
            </button>
            <button className="s-pill line" style={{ paddingLeft: 22, paddingRight: 22 }} onClick={() => setOpen(false)}>
              취소
            </button>
          </div>
        </>
      )}

      {/* 제도 안내 */}
      <div className="s-card mt-2.5" style={{ padding: "13px 16px" }}>
        <button
          onClick={() => setGuide((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          data-testid="button-toggle-leave-guide"
        >
          <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
            <HelpCircle className="h-4 w-4" style={{ color: "var(--s-muted)" }} strokeWidth={1.6} />
            연차 제도 안내
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${guide ? "rotate-180" : ""}`}
            style={{ color: "var(--s-faint)" }}
          />
        </button>
        {guide && (
          <div className="mt-3 space-y-3.5 pt-3" style={{ borderTop: "1px solid var(--s-hair)" }}>
            {GUIDE.map((g) => (
              <div key={g.q}>
                <div className="text-[13px] font-semibold">{g.q}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
                  {g.a}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 신청 내역 */}
      <div className="s-sect">신청 내역</div>
      {data.requests.length === 0 ? (
        <div className="s-card">
          <div className="s-empty" style={{ padding: "28px 20px" }}>
            신청한 연차가 없습니다.
          </div>
        </div>
      ) : (
        data.requests.map((r) => {
          const st = r.status as LeaveStatus;
          const tone =
            st === "approved"
              ? { bg: "var(--s-ink)", fg: "#fff" }
              : st === "rejected"
                ? { bg: "#efe3e1", fg: "#8d4038" }
                : { bg: "var(--s-accent-soft)", fg: "var(--s-accent)" };
          return (
            <div key={r.id} className="s-card" style={{ padding: "13px 16px" }} data-testid={`row-leave-${r.id}`}>
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold">
                      {r.startDate}
                      {r.startDate !== r.endDate ? ` ~ ${r.endDate}` : ""}
                    </span>
                    <span
                      className="rounded-full px-2 py-[3px] text-[10px] font-medium"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {LEAVE_STATUS_LABEL[st] ?? r.status}
                    </span>
                  </div>
                  <div className="s-k mt-1">
                    {d(r.days)}일{r.halfDay === 1 ? " (반차)" : ""}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                  {r.adminMemo && (
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
                      메모: {r.adminMemo}
                    </p>
                  )}
                </div>
                {r.status === "pending" && (
                  <button className="s-icon" onClick={() => cancel(r.id)} aria-label="신청 취소">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* 부여 내역 */}
      <div className="s-sect">부여 내역</div>
      {data.grants.length === 0 ? (
        <div className="s-card">
          <div className="s-empty" style={{ padding: "28px 20px" }}>
            부여된 연차가 없습니다.
          </div>
        </div>
      ) : (
        <div className="s-card" style={{ padding: "4px 16px" }}>
          {data.grants.map((g) => (
            <div key={g.id} className="s-li">
              <div className="min-w-0">
                <div className="text-[13px]">{g.grantDate}</div>
                <div className="s-k" style={{ fontSize: 10.5 }}>
                  {LEAVE_GRANT_KIND_LABEL[g.kind] ?? g.kind} · {g.expiresAt} 소멸
                </div>
              </div>
              <span className="text-[13px] font-semibold">+{d(g.days)}일</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
        연차는 발생일로부터 1년 안에 쓰지 않으면 없어집니다.
      </p>
    </StaffLayout>
  );
}
