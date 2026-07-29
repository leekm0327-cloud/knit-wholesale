import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

// 브라우저 알림 권한을 (아직 물어보지 않았다면) 요청.
// 채팅 화면 진입 시 한 번 호출하는 용도.
export function ensureChatNotifyPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch { /* noop */ }
}

/**
 * 미읽음 수(count)가 이전보다 늘어나면 = 새 메시지 도착 → 토스트 + 브라우저 알림.
 * count 는 서버에서 실제로 받아온 값만 넘길 것(초기 undefined 는 무시되어 첫 로드 시 오알림 방지).
 */
export function useChatAlert(
  count: number | undefined,
  opts: { title: string; body?: string; onClick?: () => void },
) {
  const { toast } = useToast();
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (count == null) return; // 아직 미로딩
    if (prev.current == null) {
      prev.current = count; // 첫 실제값은 기준선으로만 저장 (알림 X)
      return;
    }
    if (count > prev.current) {
      toast({ title: opts.title, description: opts.body });
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(opts.title, { body: opts.body, tag: "knit-chat" });
          if (opts.onClick) {
            n.onclick = () => {
              try { window.focus(); } catch { /* noop */ }
              opts.onClick?.();
              n.close();
            };
          }
        }
      } catch { /* noop */ }
    }
    prev.current = count;
    // opts/toast 는 의도적으로 deps 제외 (count 변화에만 반응)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
}
