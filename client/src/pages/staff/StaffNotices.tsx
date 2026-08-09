import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

  return (
    <StaffLayout title="공지사항">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">등록된 공지가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {data!.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <button
                onClick={() => open(a)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left hover-elevate"
                data-testid={`notice-${a.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {a.pinned === 1 && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                    {a.important === 1 && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                    <span className="truncate text-sm font-semibold text-foreground">{a.title}</span>
                    {!a.read && <Badge className="shrink-0 text-[10px]">NEW</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmtDate(a.createdAt)} · {a.authorName}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    openId === a.id ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openId === a.id && (
                <div className="border-t px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{a.body || "내용 없음"}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </StaffLayout>
  );
}
