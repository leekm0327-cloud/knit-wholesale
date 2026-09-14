import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import type { PopupNotice } from "@shared/schema";
import {
  NOTICE_MESSAGE_URL, NOTICE_MESSAGE_BUTTON, NOTICE_MESSAGE_LIMIT,
  type NoticeMessageContext, type NoticeMessageBatch,
} from "@shared/notice-message";
import { Loader2, Send, X, RotateCw } from "lucide-react";

const BASE = "/api/admin/notice-messages";
const won = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
const labels: Record<string, string> = {
  draft: "최종 확인", preparing: "준비 중 · 재발송 차단", sending: "발송 요청 중",
  submitted: "결과 확인 대기", complete: "결과 확인됨", unknown: "결과 확인 필요",
  queued: "발송 전", accepted: "솔라피 접수", delivered: "전달 완료", failed: "실패",
};

function defaultText(n: PopupNotice) {
  return [
    `[니트커피] ${n.title}`, n.body,
    n.orderUntil && `주문 마감: ${n.orderUntil}`, n.orderResume && `주문 재개: ${n.orderResume}`,
    n.deliveryNote, "자세한 일정은 공지를 확인해 주세요.",
  ].filter(Boolean).join("\n\n");
}

export function NoticeMessageComposer({ notice, onClose }: { notice: PopupNotice; onClose: () => void }) {
  const context = useQuery<NoticeMessageContext>({
    queryKey: [`${BASE}?noticeId=${notice.id}`], staleTime: 0,
  });
  const [text, setText] = useState(() => defaultText(notice));
  const [includeImage, setIncludeImage] = useState(!!notice.imageUrl);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [batch, setBatch] = useState<NoticeMessageBatch | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const locked = busy || !!batch;
  const recipients = context.data?.recipients || [];
  const eligible = recipients.filter(c => !c.reason);
  const visible = recipients.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(search.trim().toLowerCase()));
  const uniqueCount = useMemo(() => new Set(recipients.filter(c => selected.includes(c.id) && !c.reason).map(c => c.phone)).size, [recipients, selected]);
  const limit = includeImage ? 400 : 1300;
  const tooLong = text.trim().length > limit || (text.match(/\n/g) || []).length > (includeImage ? 29 : 99);
  const ready = context.data?.ready && !tooLong && !!text.trim();

  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setHint("");
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }
  function choose(ids: number[]) {
    setSelected(ids.slice(0, NOTICE_MESSAGE_LIMIT));
    setHint(ids.length > NOTICE_MESSAGE_LIMIT ? `한 번에 ${NOTICE_MESSAGE_LIMIT}곳까지 선택할 수 있습니다. 나머지는 다음 발송에서 선택해 주세요.` : "");
  }
  async function prepare(mode: "live" | "test") {
    await action(async () => {
      const res = await apiRequest("POST", `${BASE}/prepare`, { noticeId: notice.id, text, includeImage, customerIds: mode === "test" ? [] : selected, mode });
      setBatch(await res.json()); setConfirmed(false);
      await context.refetch();
    });
  }
  async function send() {
    if (!batch || !confirmed) return;
    const current = batch;
    await action(async () => {
      // Even when the browser loses the response, this batch ID is kept for reconciliation.
      try {
        const res = await apiRequest("POST", `${BASE}/${current.id}/send`, { confirmed: true });
        setBatch(await res.json()); setConfirmed(false);
      } catch (e) {
        setBatch({ ...current, status: "unknown" });
        throw e;
      } finally { await context.refetch(); }
    });
  }
  async function refresh() {
    if (!batch) return;
    await action(async () => {
      const res = await apiRequest("POST", `${BASE}/${batch.id}/refresh`, {});
      setBatch(await res.json()); await context.refetch(); setConfirmed(false);
    });
  }
  function reset() { setBatch(null); setConfirmed(false); setError(""); setSelected([]); }

  return <section className="mt-5 rounded-lg border bg-background p-4 sm:p-5 space-y-5 break-keep" aria-label="거래처 공지 메시지" data-testid="notice-message-composer">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">거래처에게 카카오 공지 보내기</h3>
        <p className="mt-1 text-xs text-muted-foreground">선택한 거래처 중 니트커피 채널 친구에게 전달됩니다. 채널 친구 전체 목록을 불러오는 기능은 아닙니다.</p>
      </div>
      <Button size="icon" variant="ghost" onClick={onClose} disabled={busy} aria-label="메시지 작성 닫기"><X className="h-4 w-4" /></Button>
    </div>

    {context.isLoading && <p role="status" className="text-sm">거래처와 연결 설정을 확인하고 있습니다.</p>}
    {context.error && <p role="alert" className="text-sm text-destructive">{errMsg(context.error)} <Button variant="ghost" onClick={() => context.refetch()}>다시 확인</Button></p>}
    {context.data && !context.data.ready && <div className="rounded border p-3 text-sm space-y-1">
      {context.data.reasons.map(reason => <p key={reason}>{reason}</p>)}
      <Link href="/admin/alimtalk" className="underline">알림톡 연결 설정 열기</Link>
      <Button variant="ghost" onClick={() => context.refetch()}>설정 다시 확인</Button>
    </div>}

    {!batch && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <fieldset disabled={locked} className="min-w-0 space-y-3">
        <Label htmlFor={`notice-message-text-${notice.id}`}>보낼 내용</Label>
        <Textarea id={`notice-message-text-${notice.id}`} value={text} onChange={e => setText(e.target.value)} rows={7} />
        <p className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>{text.trim().length.toLocaleString()} / {limit.toLocaleString()}자 · 줄바꿈 {includeImage ? 29 : 99}개까지</p>
        {notice.imageUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeImage} onChange={e => setIncludeImage(e.target.checked)} />공지 이미지 함께 보내기</label>}
        {includeImage && notice.imageUrl && <img src={notice.imageUrl} alt="메시지에 첨부할 공지" className="max-h-56 max-w-full rounded border object-contain" />}
        <p className="text-xs text-muted-foreground">{NOTICE_MESSAGE_BUTTON} 버튼이 함께 전송됩니다. 메시지를 수정해도 사이트 공지는 바뀌지 않습니다.</p>
      </fieldset>
      <fieldset disabled={locked} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`notice-recipient-search-${notice.id}`}>받을 거래처 · {selected.length}곳 선택 / 번호 {uniqueCount}개</Label>
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => choose(eligible.map(c => c.id))}>전체 선택</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => choose(eligible.filter(c => c.recent).map(c => c.id))}>최근 90일 주문</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => choose([])}>해제</Button>
          </div>
        </div>
        <Input id={`notice-recipient-search-${notice.id}`} placeholder="거래처명·전화번호 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-72 overflow-y-auto rounded border divide-y">
          {visible.map(c => <label key={c.id} className={`flex items-center gap-3 p-3 text-sm ${c.reason ? "text-muted-foreground" : "cursor-pointer"}`}>
            <input type="checkbox" checked={selected.includes(c.id)} disabled={!!c.reason} onChange={e => choose(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id))} aria-label={`${c.name} 선택`} />
            <span className="min-w-0 flex-1">{c.name}<span className="block text-xs text-muted-foreground">{c.phone || "전화번호 없음"}</span></span>
            {c.reason && <span className="text-xs">{c.reason}</span>}
          </label>)}
          {!visible.length && <p className="p-5 text-sm text-muted-foreground">표시할 거래처가 없습니다.</p>}
        </div>
        <p className="text-xs text-muted-foreground">중복 번호·수신거부·이미 발송한 번호는 제외합니다. 카카오에서 채널 친구 여부를 확인하므로 선택한 수와 전달 완료 수는 다를 수 있습니다.</p>
      </fieldset>
    </div>}

    {!batch && <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      <Button onClick={() => prepare("live")} disabled={busy || !ready || !uniqueCount}><Send className="h-4 w-4" />대상·비용 확인</Button>
      <Button variant="outline" onClick={() => prepare("test")} disabled={busy || !ready || !context.data?.testPhone}>내 번호로 먼저 확인</Button>
      <p className="text-xs text-muted-foreground">{context.data?.testPhone ? `테스트 번호 ${context.data.testPhone} · 테스트도 유료` : "테스트 번호는 알림톡 설정에서 등록할 수 있습니다."}</p>
    </div>}

    {batch && <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{batch.mode === "test" ? "내 번호 테스트" : "거래처 발송"} · {labels[batch.status] || batch.status}</span>
        <span className="text-muted-foreground">{batch.recipients.length}개 번호 · 예상 차감액 {won(batch.total)}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg bg-[#ecedf0] p-4">
          <p className="mb-2 text-xs text-muted-foreground">{batch.channelName} · 메시지 미리보기</p>
          <div className="max-w-sm overflow-hidden rounded-lg border bg-white text-[#252525]">
            {batch.imageUrl && <img src={batch.imageUrl} alt="발송할 공지 이미지" className="block w-full object-contain" />}
            <p className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">{batch.text}</p>
            <a href={batch.buttonUrl} target="_blank" rel="noreferrer" className="block border-t bg-[#f8f8f8] p-3 text-center text-sm">{NOTICE_MESSAGE_BUTTON}</a>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">카카오의 실제 말풍선·안내 표시는 다를 수 있습니다.</p>
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-sm">번호당 {won(batch.unitPrice)} × {batch.recipients.length}건. 전달 실패에 따른 최종 차감액은 솔라피에서 확인할 수 있습니다.</p>
          <div className="max-h-72 overflow-auto rounded border divide-y">
            {batch.recipients.map(r => <div key={r.phone} className="p-3 text-sm">
              <div className="flex justify-between gap-3"><span>{r.name}</span><span className={r.status === "failed" || r.status === "unknown" ? "text-destructive" : ""}>{labels[r.status]}</span></div>
              <p className="text-xs text-muted-foreground">{r.phone}</p>
              {r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
            </div>)}
          </div>
          {!!batch.exclusions.length && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">제외한 거래처 {batch.exclusions.length}곳</summary>
            {batch.exclusions.map((e, i) => <p key={i} className="mt-1">{e.name} · {e.reason}</p>)}
          </details>}
        </div>
      </div>
      {batch.status === "draft" ? <div className="space-y-3 border-t pt-4">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
          <span>위 문구·이미지·받는 번호와 예상 차감액 {won(batch.total)}을 확인했습니다.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={busy || !confirmed}>{batch.mode === "test" ? "테스트 메시지 1건 발송" : `${batch.recipients.length}건 최종 발송`}</Button>
          <Button variant="outline" onClick={() => { setBatch(null); setConfirmed(false); }} disabled={busy}>내용·대상 수정</Button>
        </div>
        <p className="text-xs text-muted-foreground">최종 발송을 눌러야 전송됩니다. 오전 8시~오후 8시 50분 전까지 가능하며, 이 확인은 10분간 유효합니다.</p>
      </div> : <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh} disabled={busy}><RotateCw className="h-4 w-4" />전달 결과 확인</Button>
          <Button variant="ghost" onClick={reset} disabled={busy}>다른 대상 선택</Button>
          <a href="https://console.solapi.com" target="_blank" rel="noreferrer" className="self-center text-sm underline">솔라피 발송 내역 열기</a>
        </div>
        <p className="text-xs text-muted-foreground">접수는 전달 완료가 아닙니다. 결과가 불확실한 번호는 중복 발송을 막습니다. 아래 발송 이력에서 다시 확인할 수 있습니다.</p>
      </div>}
    </div>}

    {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />처리 중입니다. 잠시 기다려 주세요.</p>}
    {error && <p role="alert" className="rounded border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {hint && <p role="status" className="text-sm text-muted-foreground">{hint}</p>}

    {!!context.data?.history.length && <details className="border-t pt-4 text-sm"><summary className="cursor-pointer">이 공지 발송 이력 {context.data.history.length}건</summary>
      <div className="mt-3 divide-y">
        {context.data.history.map(h => <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div><p>{h.mode === "test" ? "내 번호 테스트" : "거래처 발송"} · {h.recipients.length}건 · {labels[h.status] || h.status}</p>
            <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => action(async () => {
            const res = await apiRequest("GET", `${BASE}/${h.id}`); setBatch(await res.json()); setConfirmed(false);
          })}>내용·결과</Button>
        </div>)}
      </div>
    </details>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">발송 안내</summary>
      <p className="mt-2">이 기능은 연결된 솔라피 계정에서 카카오 브랜드 메시지로 보냅니다. 친구가 아니거나 수신을 거부한 번호에는 전달되지 않으며, 문자로 대체 발송하지 않습니다.</p>
      <p className="mt-1">버튼 주소: <a href={NOTICE_MESSAGE_URL} target="_blank" rel="noreferrer" className="underline break-all">{NOTICE_MESSAGE_URL}</a></p>
    </details>
  </section>;
}
