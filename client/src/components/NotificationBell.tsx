import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bell, UserPlus, ShoppingBag, PlusCircle, MessageSquare, CalendarClock, Check } from "lucide-react";

interface NotiItem {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt: number | null;
  createdAt: number;
}
interface NotiResult {
  items: NotiItem[];
  unread: number;
}

const ICON_BY_TYPE: Record<string, any> = {
  customer_register: UserPlus,
  order_new: ShoppingBag,
  order_merged: PlusCircle,
  inquiry: MessageSquare,
  visit_request: CalendarClock,
};

function relTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const dt = new Date(ts);
  return `${dt.getMonth() + 1}.${dt.getDate()}`;
}

export function NotificationBell() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const nowMs = Date.now();

  const { data } = useQuery<NotiResult>({
    queryKey: ["/api/admin/notifications"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/notifications")).json(),
    refetchInterval: 60 * 1000, // 1분마다 갱신
    refetchOnWindowFocus: true,
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const readAllMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/notifications/read-all", {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] }),
  });

  async function openItem(n: NotiItem) {
    setOpen(false);
    if (!n.readAt) {
      try {
        await apiRequest("POST", `/api/admin/notifications/${n.id}/read`, {});
        queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      } catch { /* noop */ }
    }
    if (n.link) navigate(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="알림"
          data-testid="button-notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6b6a45] px-1 font-ui text-[10px] font-bold text-white"
              data-testid="badge-notification-count"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="popover-notifications">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground">
            알림{unread > 0 ? ` (${unread})` : ""}
          </span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => readAllMut.mutate()}
              disabled={readAllMut.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              data-testid="button-read-all"
            >
              <Check className="h-3 w-3" /> 모두 읽음
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">알림이 없습니다.</div>
          ) : (
            items.map((n) => {
              const Icon = ICON_BY_TYPE[n.type] ?? Bell;
              const isUnread = !n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  data-testid={`notification-${n.id}`}
                  className={`flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${isUnread ? "bg-[#f6f5ef]" : ""}`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-[#6b6a45]">
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs ${isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">{relTime(n.createdAt, nowMs)}</span>
                    </div>
                    {n.body ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.body}</div> : null}
                  </div>
                  {isUnread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6b6a45]" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
