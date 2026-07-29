import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ensureChatNotifyPermission } from "@/hooks/use-chat-alert";
import type { ChatThread, ChatMessage } from "@shared/schema";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";

interface ThreadsResponse {
  threads: ChatThread[];
  unread: number;
}
interface MessagesResponse {
  customer: { id: number; businessName: string; managerName: string };
  messages: ChatMessage[];
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) + " " +
    d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminChat() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/chat/:customerId");
  const selectedId = params ? Number(params.customerId) : 0;

  useEffect(() => { ensureChatNotifyPermission(); }, []);

  const { data: threadsData, isLoading: threadsLoading } = useQuery<ThreadsResponse>({
    queryKey: ["/api/admin/chat/threads"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/chat/threads")).json(),
    refetchInterval: 15000,
  });
  const threads = threadsData?.threads ?? [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Chat</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">거래처 채팅</h1>
        <p className="mb-6 text-sm text-muted-foreground">거래처와 1:1로 메시지를 주고받습니다. 거래처가 보낸 메시지는 알림센터에도 표시됩니다.</p>

        <div className="grid gap-4 sm:grid-cols-[300px_1fr]">
          {/* 스레드 목록 — 모바일에선 대화 선택 시 숨김 */}
          <Card className={`overflow-hidden ${selectedId ? "hidden sm:block" : ""}`}>
            <div className="border-b p-4">
              <h2 className="text-sm font-semibold text-foreground">대화 목록</h2>
            </div>
            {threadsLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">아직 대화가 없습니다.</p>
                <p className="text-xs text-muted-foreground">거래처 관리에서 대화를 시작할 수 있습니다.</p>
              </div>
            ) : (
              <div className="max-h-[70vh] divide-y overflow-y-auto">
                {threads.map((t) => (
                  <button
                    key={t.customerId}
                    onClick={() => navigate(`/admin/chat/${t.customerId}`)}
                    data-testid={`thread-${t.customerId}`}
                    className={`flex w-full flex-col gap-0.5 p-3.5 text-left hover-elevate ${
                      selectedId === t.customerId ? "bg-muted/50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{t.businessName}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(t.lastAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {t.lastSender === "admin" ? "나: " : ""}{t.lastBody}
                      </span>
                      {t.unread > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                          {t.unread}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* 대화창 */}
          <div className={selectedId ? "" : "hidden sm:block"}>
            {selectedId ? (
              <Conversation customerId={selectedId} onBack={() => navigate("/admin/chat")} />
            ) : (
              <Card className="flex h-[400px] flex-col items-center justify-center gap-2 text-center">
                <MessageSquare className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">왼쪽에서 대화를 선택하세요.</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Conversation({ customerId, onBack }: { customerId: number; onBack: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false); // 중복 전송(한글 IME Enter 이중 발생 등) 방지

  const { data, isLoading } = useQuery<MessagesResponse>({
    queryKey: ["/api/admin/chat", customerId],
    queryFn: async () => (await apiRequest("GET", `/api/admin/chat/${customerId}`)).json(),
    refetchInterval: 10000,
  });
  const messages = data?.messages ?? [];

  useEffect(() => {
    // 관리자가 열면 목록의 미읽음 배지도 갱신
    queryClient.invalidateQueries({ queryKey: ["/api/admin/chat/threads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/chat/unread-count"] });
  }, [customerId, data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (body: string) => (await apiRequest("POST", `/api/admin/chat/${customerId}`, { body })).json(),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chat", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chat/threads"] });
    },
    onError: (e: any) => toast({ title: "전송 실패", description: e?.message ?? "", variant: "destructive" }),
  });

  const onSend = () => {
    const body = text.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    send.mutate(body, { onSettled: () => { sendingRef.current = false; } });
  };

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 border-b p-4">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground sm:hidden" aria-label="뒤로">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{data?.customer.businessName ?? "…"}</div>
          <div className="truncate text-xs text-muted-foreground">{data?.customer.managerName}</div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            첫 메시지를 보내보세요.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender === "admin";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? "bg-foreground text-background" : "border border-border bg-card text-foreground"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`mt-1 text-[10px] ${mine ? "text-background/60" : "text-muted-foreground"}`}>
                    {fmtTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 입력 */}
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter는 무시 (조합 확정 Enter가 이중 전송되는 문제 방지)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); }
          }}
          placeholder="메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
          rows={1}
          data-testid="input-chat"
          className="max-h-32 min-h-[42px] flex-1 resize-none"
        />
        <Button onClick={onSend} disabled={send.isPending || !text.trim()} data-testid="btn-send" className="h-[42px] shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
