import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate } from "@/lib/format";
import type { Announcement } from "@shared/schema";
import { Pin, AlertCircle, ChevronDown } from "lucide-react";

type Row = Announcement & { read: boolean };

export default function StaffNotices() {
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading } = useQuery<Row[]>({ queryKey: ["/api/staff/announcements"] });

  async function open(a: Row) {
    setOpenId((cur) => (cur === a.id ? null : a.id));
    if (!a.read) {
      try {
        await apiRequest("POST", `/api/staff/announcements/${a.id}/read`);
        queryClient.invalidateQueries({ queryKey: ["/api/staff/announcements"] });
        queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
      } catch {
        /* 무시 */
      }
    }
  }

  const unread = (data ?? []).filter((a) => !a.read).length;

  return (
    <StaffLayout title="공지사항" subtitle="알림">
      {unread > 0 && (
        <div className="s-dark flex items-center justify-between">
          <div>
            <div className="s-k">읽지 않은 공지</div>
            <div className="mt-0.5 text-[19px] font-semibold tracking-tight">{unread}건</div>
          </div>
        </div>
      )}

      <div className="s-sect" style={{ marginTop: unread > 0 ? 18 : 4 }}>
        전체
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="s-card">
          <div className="s-empty">등록된 공지가 없습니다.</div>
        </div>
      ) : (
        data!.map((a) => {
          const isOpen = openId === a.id;
          return (
            <div key={a.id} className="s-card" style={{ padding: "13px 16px" }}>
              <button
                onClick={() => open(a)}
                className="flex w-full items-start justify-between gap-2.5 text-left"
                data-testid={`notice-${a.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {a.pinned === 1 && <Pin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-muted)" }} />}
                    {a.important === 1 && <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#a2483f" }} />}
                    <span className={`truncate text-[14px] ${a.read ? "font-medium" : "font-semibold"}`}>{a.title}</span>
                    {!a.read && (
                      <span
                        className="h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{ background: "var(--s-accent)" }}
                        aria-label="읽지 않음"
                      />
                    )}
                  </div>
                  <div className="s-k mt-1">
                    {fmtDate(a.createdAt)} · {a.authorName}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--s-faint)" }}
                />
              </button>
              {isOpen && (
                <p
                  className="mt-3 whitespace-pre-wrap pt-3 text-[13.5px] leading-relaxed"
                  style={{ borderTop: "1px solid var(--s-hair)" }}
                >
                  {a.body || "내용 없음"}
                </p>
              )}
            </div>
          );
        })
      )}
    </StaffLayout>
  );
}
