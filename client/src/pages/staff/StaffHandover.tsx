import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { HandoverDay, HandoverRow } from "@shared/schema";
import { Loader2, Check, Trash2, AlertCircle, Pencil, X } from "lucide-react";

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
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${dow}요일`;
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function StaffHandover() {
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  const key = `/api/staff/handover?date=${date}`;
  const { data, isLoading } = useQuery<HandoverDay>({ queryKey: [key] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [key] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
  };

  async function submit() {
    if (!body.trim()) {
      toast({ variant: "destructive", title: "내용을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/handover", { workDate: date, body: body.trim(), important });
      setBody("");
      setImportant(false);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmRead(r: HandoverRow) {
    try {
      await apiRequest("POST", `/api/staff/handover/${r.id}/read`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "실패", description: errMsg(err) });
    }
  }

  async function remove(r: HandoverRow) {
    if (!confirm("이 인수인계를 지울까요?")) return;
    try {
      await apiRequest("DELETE", `/api/staff/handover/${r.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function saveEdit(r: HandoverRow) {
    if (!editBody.trim()) return;
    try {
      await apiRequest("PATCH", `/api/staff/handover/${r.id}`, {
        body: editBody.trim(),
        important: r.important === 1,
      });
      setEditId(null);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "수정 실패", description: errMsg(err) });
    }
  }

  const isToday = date === today();
  const rows = data?.rows ?? [];

  return (
    <StaffLayout title="인수인계" subtitle="교대">
      {/* 날짜 */}
      <div className="s-card flex items-center justify-between" style={{ padding: "9px 10px" }}>
        <button
          className="s-icon"
          onClick={() => setDate((v) => addDays(v, -1))}
          aria-label="이전 날"
          data-testid="button-prev-handover-day"
        >
          <span className="text-[15px] leading-none">‹</span>
        </button>
        <button className="text-center" onClick={() => setDate(today())} disabled={isToday}>
          <div className="text-[14.5px] font-semibold tracking-tight">{fmtDay(date)}</div>
          <div className="s-k" style={{ marginTop: 1 }}>
            {isToday ? `오늘 · ${rows.length}건` : "오늘로"}
          </div>
        </button>
        <button
          className="s-icon"
          onClick={() => setDate((v) => addDays(v, 1))}
          aria-label="다음 날"
          data-testid="button-next-handover-day"
        >
          <span className="text-[15px] leading-none">›</span>
        </button>
      </div>

      {/* 쓰기 */}
      <div className="s-sect">남길 말</div>
      <div className="s-card">
        <textarea
          className="s-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="다음 근무자가 알아야 할 것을 적어주세요."
          data-testid="input-handover-body"
        />
        <div className="s-li" style={{ paddingBottom: 0 }}>
          <span className="text-[13px]" style={{ color: "var(--s-muted)" }}>
            꼭 확인해야 함
          </span>
          <button
            onClick={() => setImportant((v) => !v)}
            className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
            style={{ background: important ? "var(--s-ink)" : "#dedcd6" }}
            data-testid="toggle-handover-important"
            aria-label="중요 표시"
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: important ? 21 : 3 }}
            />
          </button>
        </div>
        <button className="s-pill wide mt-3" onClick={submit} disabled={busy} data-testid="button-submit-handover">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          등록
        </button>
      </div>

      {/* 목록 */}
      <div className="s-sect">이날의 인수인계</div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="s-card">
          <div className="s-empty">남겨진 인수인계가 없습니다.</div>
        </div>
      ) : (
        rows.map((r) => {
          const editing = editId === r.id;
          return (
            <div key={r.id} className="s-card" data-testid={`row-handover-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {r.important === 1 && (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#a2483f" }} strokeWidth={1.8} />
                  )}
                  <span className="truncate text-[13.5px] font-semibold">{r.staffName}</span>
                  <span className="s-k shrink-0">{hhmm(r.createdAt)}</span>
                </div>
                {r.mine && !editing && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="s-icon"
                      onClick={() => {
                        setEditId(r.id);
                        setEditBody(r.body);
                      }}
                      aria-label="수정"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                    <button className="s-icon" onClick={() => remove(r)} aria-label="삭제">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                )}
                {editing && (
                  <button className="s-icon shrink-0" onClick={() => setEditId(null)} aria-label="취소">
                    <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>

              {editing ? (
                <>
                  <textarea
                    className="s-input mt-2.5"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                  />
                  <button className="s-pill wide mt-2.5" onClick={() => saveEdit(r)}>
                    저장
                  </button>
                </>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.body}</p>
              )}

              {/* 확인 */}
              <div className="mt-3 flex items-center justify-between gap-2 pt-2.5" style={{ borderTop: "1px solid var(--s-hair)" }}>
                <div className="min-w-0 text-[11px]" style={{ color: "var(--s-muted)" }}>
                  {r.readers.length === 0 ? (
                    "아직 확인한 사람이 없습니다"
                  ) : (
                    <span className="truncate">확인 {r.readers.map((x) => x.staffName).join(", ")}</span>
                  )}
                </div>
                {r.mine ? (
                  <span className="shrink-0 text-[11px]" style={{ color: "var(--s-faint)" }}>
                    내가 씀
                  </span>
                ) : r.readByMe ? (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--s-accent-soft)", color: "var(--s-accent)" }}
                  >
                    <Check className="h-3 w-3" strokeWidth={2.4} />
                    확인함
                  </span>
                ) : (
                  <button
                    className="shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-medium"
                    style={{ background: "var(--s-ink)", color: "#fff" }}
                    onClick={() => confirmRead(r)}
                    data-testid={`button-read-handover-${r.id}`}
                  >
                    확인
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
        확인 버튼을 누르면 이름이 남습니다.
        <br />
        내가 쓴 글은 수정하거나 지울 수 있습니다.
      </p>
    </StaffLayout>
  );
}
