import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link2, ShieldCheck, AlertCircle, CheckCircle2, XCircle, KeyRound, Loader2, RefreshCcw } from "lucide-react";

interface EcountSettingsView {
  comCode: string;
  userId: string;
  zone: string;
  warehouseCode: string;
  deliverFieldCode: string;
  discountProductCode: string;
  useTestEndpoint: boolean;
  autoSendSales: boolean;
  autoSendPayments: boolean;
  autoSendCustomer: boolean;
  autoSendProduct: boolean;
  hasKey: boolean;
  lastVerifiedAt: number | null;
  verificationLog: string;
}

interface VerifyResult {
  ok: boolean;
  zone?: string;
  results: Array<{ menu: string; ok: boolean; message: string; sample?: any }>;
  finishedAt: number;
  message?: string;
}

export default function AdminEcount() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<EcountSettingsView>({
    queryKey: ["/api/admin/ecount/settings"],
  });

  const [form, setForm] = useState<EcountSettingsView & { apiCertKey: string }>({
    comCode: "",
    userId: "",
    zone: "",
    warehouseCode: "100",
    deliverFieldCode: "",
    discountProductCode: "",
    useTestEndpoint: true,
    autoSendSales: false,
    autoSendPayments: false,
    autoSendCustomer: true,
    autoSendProduct: true,
    hasKey: false,
    lastVerifiedAt: null,
    verificationLog: "",
    apiCertKey: "",
  });

  useEffect(() => {
    if (data) {
      setForm((f) => ({
        ...f,
        comCode: data.comCode,
        userId: data.userId,
        zone: data.zone,
        warehouseCode: data.warehouseCode || "100",
        deliverFieldCode: data.deliverFieldCode ?? "",
        discountProductCode: data.discountProductCode ?? "",
        useTestEndpoint: data.useTestEndpoint,
        autoSendSales: data.autoSendSales,
        autoSendPayments: data.autoSendPayments,
        autoSendCustomer: data.autoSendCustomer ?? true,
        autoSendProduct: data.autoSendProduct ?? true,
        hasKey: data.hasKey,
        lastVerifiedAt: data.lastVerifiedAt,
        verificationLog: data.verificationLog,
      }));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        comCode: form.comCode,
        userId: form.userId,
        zone: form.zone,
        warehouseCode: form.warehouseCode,
        deliverFieldCode: form.deliverFieldCode,
        discountProductCode: form.discountProductCode,
        useTestEndpoint: form.useTestEndpoint,
        autoSendSales: form.autoSendSales,
        autoSendPayments: form.autoSendPayments,
        autoSendCustomer: form.autoSendCustomer,
        autoSendProduct: form.autoSendProduct,
      };
      if (form.apiCertKey && form.apiCertKey.trim().length > 0) {
        body.apiCertKey = form.apiCertKey.trim();
      }
      const res = await apiRequest("PUT", "/api/admin/ecount/settings", body);
      return res.json();
    },
    onSuccess: (res: any) => {
      toast({ title: "저장 완료", description: `Zone ${res.zone} · 인증키 ${res.hasKey ? "저장됨" : "미저장"}` });
      setForm((f) => ({ ...f, apiCertKey: "", zone: res.zone, hasKey: res.hasKey }));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ecount/settings"] });
    },
    onError: (e: any) => {
      toast({ title: "저장 실패", description: e?.message ?? "오류", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ecount/verify", {});
      return (await res.json()) as VerifyResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ecount/settings"] });
    },
    onError: (e: any) => {
      toast({ title: "검증 실패", description: e?.message ?? "오류", variant: "destructive" });
    },
  });

  const verifyResult = verifyMutation.data as VerifyResult | undefined;
  const cachedLog: VerifyResult["results"] | null = (() => {
    if (verifyResult?.results) return verifyResult.results;
    if (!data?.verificationLog) return null;
    try {
      return JSON.parse(data.verificationLog);
    } catch {
      return null;
    }
  })();

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">ERP Integration</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">ECOUNT 연동</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          이카운트 API 인증키를 저장하고 연결 상태를 확인합니다. 수금·입금보고서·채권채무는 판매·회계자동분개 전표를 통해 ECOUNT에서 자동으로 생성됩니다.
        </p>

        {/* 지금 어느 서버로 나가고 있는지 — 잘못 켜두면 전표가 통째로 엉뚱한 곳에 쌓인다 */}
        {!isLoading && data && (
          <Card
            className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 p-4 ${
              data.useTestEndpoint ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20" : "border-teal-600/40 bg-teal-50/40 dark:bg-teal-950/20"
            }`}
            data-testid="card-ecount-endpoint"
          >
            <Badge className={data.useTestEndpoint ? "bg-amber-600 text-white hover:bg-amber-600" : "bg-teal-700 text-white hover:bg-teal-700"}>
              {data.useTestEndpoint ? "테스트 서버" : "정식 서버"}
            </Badge>
            <span className="text-sm font-semibold text-foreground">
              {data.useTestEndpoint ? "sboapi — 이카운트 테스트 환경으로 전송됩니다" : "oapi — 실제 장부에 전표가 쌓입니다"}
            </span>
            <span className="w-full text-xs leading-relaxed text-muted-foreground break-keep">
              {data.useTestEndpoint
                ? "이 상태에서는 주문·발주를 보내도 실제 이카운트 장부에는 아무것도 남지 않습니다. 실제 운영 중이라면 아래 '테스트 엔드포인트 사용'을 꺼 주세요."
                : "보낸 전표는 이카운트에서 직접 지워야 취소됩니다. 전송 전에 대상을 한 번 더 확인해 주세요."}
            </span>
          </Card>
        )}

        {/* 안내 카드 */}
        <Card className="mb-6 border-amber-300/50 bg-amber-50/40 p-4 dark:bg-amber-950/20">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1.5 text-sm">
              <p className="font-semibold text-foreground">검증 절차 안내</p>
              <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                <li>아래 정보를 입력 후 <strong className="text-foreground">저장</strong> (Zone은 비워두면 자동 조회됩니다)</li>
                <li><strong className="text-foreground">검증 실행</strong> 클릭 → 거래처등록·품목등록 호출 → 결과 표시</li>
                <li>ECOUNT 본사 화면에서 <em>API인증현황</em> 이 "검증됨"으로 바뀌면 정식 키 발급 신청</li>
              </ol>
              <p className="pt-1 text-xs leading-relaxed text-muted-foreground break-keep">
                검증은 <code className="rounded bg-background px-1 font-mono">ZZAPITEST</code> 코드의 거래처·품목만 확인하며,
                <strong className="text-foreground"> 전표는 만들지 않습니다</strong> — 몇 번을 눌러도 지울 것이 생기지 않습니다.
                최신 인증키를 사용해 주세요(이전에 노출된 키는 재발급 권장).
              </p>
            </div>
          </div>
        </Card>

        {/* 입력 폼 */}
        {isLoading ? (
          <Card className="p-5">
            <Skeleton className="h-72 w-full" />
          </Card>
        ) : (
          <Card className="mb-6 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="회사코드 (COM_CODE)"
                placeholder="예: 656053"
                value={form.comCode}
                onChange={(v) => setForm({ ...form, comCode: v })}
                testId="ecount-com-code"
              />
              <Field
                label="발급 ID (USER_ID)"
                placeholder="예: KNITCOFFEE"
                value={form.userId}
                onChange={(v) => setForm({ ...form, userId: v })}
                testId="ecount-user-id"
              />
              <div className="sm:col-span-2">
                <Label className="font-ui text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  API 인증키
                </Label>
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={form.hasKey ? "저장됨 · 변경 시에만 입력" : "ECOUNT에서 발급받은 인증키 붙여넣기"}
                    value={form.apiCertKey}
                    onChange={(e) => setForm({ ...form, apiCertKey: e.target.value })}
                    className="pl-9"
                    data-testid="input-ecount-key"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  키는 서버에서 AES-256-GCM으로 암호화되어 저장됩니다. 입력칸을 비워두면 기존 키를 유지합니다.
                </p>
              </div>
              <Field
                label="Zone (비워두면 자동 조회)"
                placeholder="예: AA"
                value={form.zone}
                onChange={(v) => setForm({ ...form, zone: v.toUpperCase() })}
                testId="ecount-zone"
              />
              <Field
                label="기본 창고코드 (WH_CD)"
                placeholder="예: 100"
                value={form.warehouseCode}
                onChange={(v) => setForm({ ...form, warehouseCode: v })}
                testId="ecount-warehouse"
              />
              <div className="sm:col-span-2">
                <Field
                  label="납품 거래처 필드코드 (구매입력 추가항목)"
                  placeholder="예: U_TXT1 (비워두면 후보 코드를 모두 시도)"
                  value={form.deliverFieldCode}
                  onChange={(v) => setForm({ ...form, deliverFieldCode: v })}
                  testId="ecount-deliver-field"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  발주를 이카운트 구매전표로 보낼 때, 상단 <strong>추가항목(구매상단)</strong>의 납품 거래처 칸에 주문한 거래처명을 넣습니다.
                  이카운트 <em>구매입력 API 문서</em>에서 해당 추가문자형식 항목의 필드코드를 확인해 그대로 입력하세요.
                  쉼표로 여러 개를 넣으면 모두 시도합니다(맞지 않는 코드는 이카운트가 무시).
                </p>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="할인 품목코드 (판매전표)"
                  placeholder="예: DISCOUNT"
                  value={form.discountProductCode}
                  onChange={(v) => setForm({ ...form, discountProductCode: v })}
                  testId="ecount-discount-product"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground break-keep">
                  주문에 정액 할인이 걸리면 판매전표 맨 아래에 이 품목코드로 <strong>음수 한 줄</strong>을 붙입니다.
                  이카운트 품목등록에 할인용 품목을 하나 만들어 두고 그 코드를 입력하세요.
                  비어 있으면 할인이 걸린 주문은 전송이 막힙니다 — 할인 줄이 빠진 채로 넘어가면 세금계산서가 실제보다 크게 발행되기 때문입니다.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t pt-4">
              <ToggleRow
                label="테스트 엔드포인트 사용"
                hint="ON: sboapi (테스트 서버) — 실제 장부에 아무것도 남지 않습니다. OFF: oapi (정식 서버) — 실제 전표가 쌓입니다. 운영 중이라면 OFF."
                value={form.useTestEndpoint}
                onChange={(v) => setForm({ ...form, useTestEndpoint: v })}
              />
              <ToggleRow
                label="판매전표 자동 전송"
                hint="주문을 처리완료로 바꿀 때 ECOUNT 판매전표를 자동 전송합니다. 세금계산서는 이 전표를 근거로 이카운트에서 월 단위로 일괄 발행합니다. (매장 내부 계정 주문은 제외)"
                value={form.autoSendSales}
                onChange={(v) => setForm({ ...form, autoSendSales: v })}
              />
              <ToggleRow
                label="수금 자동 분개"
                hint="입금 등록 시 자동으로 ECOUNT 회계 자동분개 전표 생성 (검증 완료 후 켜세요)"
                value={form.autoSendPayments}
                onChange={(v) => setForm({ ...form, autoSendPayments: v })}
              />
              <ToggleRow
                label="거래처 자동 등록"
                hint="신규 회원 가입 시 ECOUNT에 거래처 자동 생성 (기본 ON)"
                value={form.autoSendCustomer}
                onChange={(v) => setForm({ ...form, autoSendCustomer: v })}
              />
              <ToggleRow
                label="품목 자동 등록"
                hint="신규 품목 생성 시 ECOUNT에 품목 자동 등록 (기본 ON)"
                value={form.autoSendProduct}
                onChange={(v) => setForm({ ...form, autoSendProduct: v })}
              />
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                마지막 검증:{" "}
                {data?.lastVerifiedAt
                  ? new Date(data.lastVerifiedAt).toLocaleString("ko-KR")
                  : "없음"}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !form.comCode || !form.userId || !form.warehouseCode}
                  data-testid="button-save-ecount"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  저장
                </Button>
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending || !form.hasKey}
                  data-testid="button-verify-ecount"
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  검증 실행
                </Button>
              </div>
            </div>
            {!form.hasKey && (
              <p className="mt-2 text-right text-[11px] text-muted-foreground">
                먼저 인증키를 입력하고 저장한 후 검증을 실행할 수 있습니다.
              </p>
            )}
          </Card>
        )}

        {/* 검증 결과 */}
        {(verifyResult || cachedLog) && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-display text-sm font-semibold text-foreground">검증 결과</h2>
                <p className="text-xs text-muted-foreground">
                  {verifyResult
                    ? `방금 실행 · ${new Date(verifyResult.finishedAt).toLocaleString("ko-KR")}`
                    : data?.lastVerifiedAt
                      ? `저장된 결과 · ${new Date(data.lastVerifiedAt).toLocaleString("ko-KR")}`
                      : "저장된 결과"}
                </p>
              </div>
              {verifyResult && (
                <Badge variant={verifyResult.ok ? "default" : "destructive"}>
                  {verifyResult.ok ? "전체 성공" : "부분 실패"}
                </Badge>
              )}
            </div>
            <div className="divide-y">
              {(cachedLog ?? []).map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-4">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{r.menu}</div>
                    <div className="mt-0.5 break-words text-xs text-muted-foreground">{r.message}</div>
                    {r.sample && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer select-none text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
                          원본 응답 보기
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto rounded border bg-muted/50 p-2 text-[10px] leading-relaxed">
                          {JSON.stringify(r.sample, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {verifyMutation.isError && (
          <Card className="mt-4 border-destructive/40 bg-destructive/5 p-4">
            <div className="flex gap-2 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">검증 호출 실패</div>
                <div className="mt-0.5 text-xs">{(verifyMutation.error as Error)?.message}</div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  testId,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div>
      <Label className="font-ui text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        className="mt-1.5"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`input-${testId}`}
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
