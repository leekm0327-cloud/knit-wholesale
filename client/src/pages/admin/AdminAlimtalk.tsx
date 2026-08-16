// 카카오 알림톡 — 설정, 테스트 발송, 미수금 안내 수동 발송, 발송 기록.
// 승인된 템플릿 ID 는 코드에 박지 않고 여기서 골라 쓴다.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg, won } from "@/lib/format";
import { Send, RefreshCw, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Loader2, BellOff } from "lucide-react";

type Settings = {
  enabled: boolean;
  pfId: string;
  sender: string;
  tplOrder: string;
  tplBalance: string;
  disableSms: boolean;
  testPhone: string;
};

type Log = {
  id: number;
  createdAt: number;
  kind: string;
  businessName: string;
  phone: string;
  status: string;
  detail: string;
};

type Res = {
  settings: Settings;
  status: { ready: boolean; reasons: string[] };
  keyConfigured: boolean;
  optOutIds: number[];
  logs: Log[];
};

type Template = {
  templateId: string;
  name: string;
  status: string;
  inspectionStatus: string;
  content: string;
};

type Target = {
  customerId: number;
  businessName: string;
  managerName: string;
  phone: string;
  balance: number;
  optedOut: boolean;
};

const API = "/api/admin/alimtalk";

function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminAlimtalk() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Res>({ queryKey: [API] });

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const s = data?.settings;

  const saveMut = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const res = await apiRequest("PATCH", API, patch);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [API] }),
    onError: (e) => toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" }),
  });

  const { data: targetData } = useQuery<{ rows: Target[] }>({
    queryKey: [`${API}/balance-targets`],
    enabled: !!data,
  });

  async function loadTemplates() {
    setLoadingTpl(true);
    try {
      const res = await apiRequest("GET", `${API}/templates`);
      const body = await res.json();
      if (!res.ok) throw new Error((body as any).message ?? "불러오지 못했습니다.");
      setTemplates((body as any).templates ?? []);
      if (((body as any).templates ?? []).length === 0)
        toast({ title: "등록된 템플릿이 없습니다", description: "솔라피에서 템플릿을 먼저 등록해 주세요." });
    } catch (e) {
      toast({ title: "템플릿 조회 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setLoadingTpl(false);
    }
  }

  async function fillPfId() {
    try {
      const res = await apiRequest("GET", `${API}/channels`);
      const body = await res.json();
      if (!res.ok) throw new Error((body as any).message ?? "불러오지 못했습니다.");
      const first = ((body as any).channels ?? [])[0];
      if (!first) return toast({ title: "연동된 채널이 없습니다", variant: "destructive" });
      saveMut.mutate({ pfId: first.pfId });
      toast({ title: "발신프로필키를 채웠습니다", description: `${first.name} (${first.searchId})` });
    } catch (e) {
      toast({ title: "채널 조회 실패", description: errMsg(e), variant: "destructive" });
    }
  }

  async function testSend(which: "order" | "balance") {
    setSending(true);
    try {
      const res = await apiRequest("POST", `${API}/test`, { which, phone: s?.testPhone });
      const body = await res.json();
      toast({
        title: res.ok ? "테스트 발송 완료" : "테스트 발송 실패",
        description: (body as any).message ?? "",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (e) {
      toast({ title: "테스트 발송 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: [API] });
    }
  }

  async function sendBalanceNotice() {
    const ids = Array.from(picked);
    if (ids.length === 0) return toast({ title: "보낼 거래처를 선택해 주세요.", variant: "destructive" });
    if (!confirm(`${ids.length}곳에 미수금 안내를 보냅니다. 진행할까요?`)) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", `${API}/balance-notice`, { customerIds: ids });
      const body = await res.json();
      toast({
        title: res.ok ? "발송 완료" : "발송 실패",
        description: (body as any).message ?? "",
        variant: res.ok ? undefined : "destructive",
      });
      setPicked(new Set());
    } catch (e) {
      toast({ title: "발송 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setSending(false);
      qc.invalidateQueries({ queryKey: [API] });
    }
  }

  async function toggleOptOut(customerId: number, off: boolean) {
    try {
      await apiRequest("PATCH", `${API}/optout/${customerId}`, { off });
      qc.invalidateQueries({ queryKey: [API] });
      qc.invalidateQueries({ queryKey: [`${API}/balance-targets`] });
    } catch (e) {
      toast({ title: "변경 실패", description: errMsg(e), variant: "destructive" });
    }
  }

  function isApproved(t: Template): boolean {
    return t.inspectionStatus === "APR" || t.status === "APPROVED" || t.inspectionStatus === "APPROVED";
  }

  function TemplatePicker({ value, field, label }: { value: string; field: keyof Settings; label: string }) {
    return (
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {templates === null ? (
          <Input
            value={value}
            onChange={(e) => saveMut.mutate({ [field]: e.target.value } as Partial<Settings>)}
            placeholder="템플릿 ID (또는 위에서 목록 불러오기)"
            className="mt-1"
            data-testid={`input-${String(field)}`}
          />
        ) : (
          <select
            value={value}
            onChange={(e) => saveMut.mutate({ [field]: e.target.value } as Partial<Settings>)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            data-testid={`select-${String(field)}`}
          >
            <option value="">선택 안 함</option>
            {/* 승인 전 템플릿도 함께 보여준다. 목록에서 빼버리면 이미 저장해 둔 값이 화면에서 사라져
                아무것도 고르지 않은 것처럼 보인다. */}
            {templates.map((t) => (
              <option key={t.templateId} value={t.templateId}>
                {t.name}
                {isApproved(t) ? "" : " — 심사 중"}
              </option>
            ))}
            {value && !templates.some((t) => t.templateId === value) && (
              <option value={value}>{value} (목록에 없는 ID)</option>
            )}
          </select>
        )}
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Alimtalk</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">카카오 알림톡</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          거래처에게 나가는 알림입니다. 주문 접수는 자동으로, 미수금 안내는 고른 곳에만 직접 보냅니다. 카카오톡을 쓰지
          않는 번호로는 문자로 대신 나갑니다.
        </p>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-5">
            {/* 상태 */}
            {!data?.status.ready && (
              <Card className="border-amber-300 bg-amber-50 p-4" data-testid="banner-not-ready">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="text-xs leading-relaxed text-amber-900">
                    <p className="mb-1 font-semibold">아직 발송할 수 없는 상태입니다.</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {data?.status.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {/* 설정 */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">기본 설정</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!s?.enabled}
                    onChange={(e) => saveMut.mutate({ enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#6b6a45]"
                    data-testid="toggle-alimtalk"
                  />
                  알림톡 사용
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">발신프로필키 (PFID)</Label>
                  <div className="mt-1 flex gap-1">
                    <Input
                      defaultValue={s?.pfId}
                      onBlur={(e) => saveMut.mutate({ pfId: e.target.value })}
                      placeholder="KA01PF..."
                      data-testid="input-pfid"
                    />
                    <Button variant="outline" onClick={fillPfId} aria-label="채널에서 불러오기">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">발신번호</Label>
                  <Input
                    defaultValue={s?.sender}
                    onBlur={(e) => saveMut.mutate({ sender: e.target.value })}
                    placeholder="숫자만 (예: 01012345678)"
                    className="mt-1"
                    data-testid="input-sender"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  승인된 템플릿을 불러와 고르면, 나중에 문구를 바꿔도 배포 없이 바꿔 끼울 수 있습니다.
                </p>
                <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loadingTpl} data-testid="button-load-templates">
                  {loadingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  템플릿 목록 불러오기
                </Button>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <TemplatePicker value={s?.tplOrder ?? ""} field="tplOrder" label="주문 접수 확인 템플릿" />
                <TemplatePicker value={s?.tplBalance ?? ""} field="tplBalance" label="미수금 안내 템플릿" />
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-border pt-4">
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!s?.disableSms}
                    onChange={(e) => saveMut.mutate({ disableSms: !e.target.checked })}
                    className="h-4 w-4 accent-[#6b6a45]"
                    data-testid="toggle-fallback"
                  />
                  실패 시 문자로 대신 보내기
                </label>

                <div>
                  <Label className="text-xs text-muted-foreground">테스트로 받을 번호</Label>
                  <Input
                    defaultValue={s?.testPhone}
                    onBlur={(e) => saveMut.mutate({ testPhone: e.target.value })}
                    placeholder="01012345678"
                    className="mt-1 w-40"
                    data-testid="input-test-phone"
                  />
                </div>

                <Button variant="outline" onClick={() => testSend("order")} disabled={sending} data-testid="button-test-order">
                  <Send className="h-4 w-4" />
                  주문 접수 테스트
                </Button>
                <Button variant="outline" onClick={() => testSend("balance")} disabled={sending} data-testid="button-test-balance">
                  <Send className="h-4 w-4" />
                  미수금 테스트
                </Button>
              </div>

              {!data?.keyConfigured && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  API 키는 Railway 환경변수 <code>SOLAPI_API_KEY</code>, <code>SOLAPI_API_SECRET</code> 에 넣어주세요.
                  이 화면에서는 입력하지 않습니다.
                </p>
              )}
            </Card>

            {/* 미수금 안내 */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">미수금 안내 보내기</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    자동으로 나가지 않습니다. 보낼 곳을 직접 고르고 눌러야 발송됩니다.
                  </p>
                </div>
                <Button onClick={sendBalanceNotice} disabled={sending || picked.size === 0} data-testid="button-send-balance">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  선택한 {picked.size}곳에 보내기
                </Button>
              </div>

              {(targetData?.rows ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">미수금이 있는 거래처가 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {(targetData?.rows ?? []).map((t) => (
                    <div key={t.customerId} className="flex items-center gap-3 px-5 py-3" data-testid={`target-${t.customerId}`}>
                      <input
                        type="checkbox"
                        checked={picked.has(t.customerId)}
                        disabled={t.optedOut}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(t.customerId);
                          else next.delete(t.customerId);
                          setPicked(next);
                        }}
                        className="h-4 w-4 accent-[#6b6a45]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">{t.businessName}</span>
                          {t.optedOut && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <BellOff className="h-3 w-3" />
                              수신 꺼짐
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t.managerName}
                          {t.phone ? ` · ${t.phone}` : " · 연락처 없음"}
                        </div>
                      </div>
                      <div className="font-display tabular text-sm font-semibold text-destructive">{won(t.balance)}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleOptOut(t.customerId, !t.optedOut)}
                        data-testid={`optout-${t.customerId}`}
                      >
                        {t.optedOut ? "수신 켜기" : "수신 끄기"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 발송 기록 */}
            <Card className="overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">최근 발송 기록</h2>
              </div>
              {(data?.logs ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">아직 발송 기록이 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {(data?.logs ?? []).map((l) => (
                    <div key={l.id} className="flex items-start gap-2.5 px-5 py-2.5 text-xs">
                      {l.status === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : l.status === "fail" ? (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      ) : (
                        <MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-display w-20 shrink-0 text-muted-foreground">{fmtWhen(l.createdAt)}</span>
                      <span className="w-16 shrink-0 text-muted-foreground">
                        {l.kind.startsWith("test") ? "테스트" : l.kind === "order" ? "주문접수" : "미수금"}
                      </span>
                      <span className="w-28 shrink-0 truncate text-foreground">{l.businessName}</span>
                      <span className={`min-w-0 flex-1 ${l.status === "fail" ? "text-destructive" : "text-muted-foreground"}`}>
                        {l.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
