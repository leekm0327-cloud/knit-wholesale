import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@shared/schema";
import { Send, MessageSquare } from "lucide-react";

interface MessagesResponse {
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

export default function Chat() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<MessagesResponse>({
    queryKey: ["/api/account/chat"],
    queryFn: async () => (await apiRequest("GET", "/api/account/chat")).json(),
    refetchInterval: 10000,
  });
  const messages = data?.messages ?? [];

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/account/chat/unread-count"] });
  }, [data]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (body: string) => (await apiRequest("POST", "/api/account/chat", { body })).json(),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/account/chat"] });
    },
    onError: (e: any) => toast({ title: "전송 실패", description: e?.message ?? "", variant: "destructive" }),
  });

  const onSend = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate(body);
  };

  return (
    <div className="min-h-screen bg-background pb-16 sm:pb-0">
      <AppHeader />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Chat</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">니트커피 문의</h1>
        <p className="mb-5 text-sm text-muted-foreground">니트커피 관리자에게 1:1로 메시지를 보낼 수 있습니다. 답변이 오면 이 화면에서 확인하세요.</p>

        <Card className="flex h-[64vh] flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="ml-auto h-10 w-2/3" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                궁금한 점을 편하게 남겨주세요.
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender === "customer";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? "bg-foreground text-background" : "border border-border bg-card text-foreground"
                    }`}>
                      {!mine && <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">니트커피</div>}
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

          <div className="flex items-end gap-2 border-t p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
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
      </div>
    </div>
  );
}
