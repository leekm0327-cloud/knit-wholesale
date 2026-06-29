import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollText, CheckCircle2, XCircle, Filter, RefreshCcw, FileSearch } from "lucide-react";
import type { EcountLog } from "@shared/schema";

const ACTION_LABEL: Record<string, string> = {
  customer: "거래처 등록",
  product: "품목 등록",
  sale: "판매전표",
  payment: "회계자동분개",
  invoice_auto: "전표자동등록",
  verify: "검증호출",
  login: "세션발급",
  zone: "Zone조회",
};

function actionLabel(a: string) {
  return ACTION_LABEL[a] ?? a;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminEcountLogs() {
  const [action, setAction] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [refId, setRefId] = useState<string>("");
  const [limit] = useState<number>(200);
  const [selected, setSelected] = useState<EcountLog | null>(null);

  // 쿼리 파라미터 구성
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (action !== "all") p.set("action", action);
    if (status !== "all") p.set("status", status);
    if (refId.trim()) p.set("refId", refId.trim());
    p.set("limit", String(limit));
    return p.toString();
  }, [action, status, refId, limit]);

  const { data, isLoading, refetch, isFetching } = useQuery<EcountLog[]>({
    queryKey: ["/api/admin/ecount/logs", action, status, refId, limit],
    // apiRequest 를 써야 __API_BASE__ (/port/5000) prefix 가 붙음.
    // 직접 fetch 하면 라이브에서 S3 SPA HTML이 떨어져 빈 배열로 파싱됨.
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/ecount/logs?${queryString}`);
      return res.json();
    },
  });

  const logs = data ?? [];
  const successCount = logs.filter((l) => l.ok === 1).length;
  const failCount = logs.length - successCount;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">ERP Audit</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">
          ECOUNT 호출 로그
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          ECOUNT에 실제로 전송된 모든 요청과 응답을 기록합니다. 어떤 주문/거래처/입금이 ECOUNT에 반영되었는지, 또는 실패했는지 한눈에 확인할 수 있습니다.
        </p>

        {/* 안내 카드 */}
        <Card className="mb-6 border-amber-300/50 bg-amber-50/40 p-4 dark:bg-amber-950/20">
          <div className="flex gap-3">
            <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">로그 사용법</p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                <li>주문 상세 페이지 또는 채권 관리에서 "ECOUNT 전송" 버튼을 누르면 여기에 기록됩니다.</li>
                <li>각 행을 클릭하면 ECOUNT가 돌려준 원본 응답을 펼쳐서 볼 수 있습니다.</li>
                <li>실패한 로그는 빨간색으로 표시되며, 메시지에 원인이 나옵니다.</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* KPI */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Kpi label="조회된 로그" value={String(logs.length)} loading={isLoading} />
          <Kpi label="성공" value={String(successCount)} loading={isLoading} accentSuccess />
          <Kpi label="실패" value={String(failCount)} loading={isLoading} accentFail />
        </div>

        {/* 필터 */}
        <Card className="mb-6 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="h-4 w-4" />
            필터
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">작업 종류</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="mt-1.5" data-testid="filter-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="customer">거래처 등록</SelectItem>
                  <SelectItem value="product">품목 등록</SelectItem>
                  <SelectItem value="sale">판매전표</SelectItem>
                  <SelectItem value="payment">회계자동분개</SelectItem>
                  <SelectItem value="invoice_auto">전표자동등록</SelectItem>
                  <SelectItem value="verify">검증호출</SelectItem>
                  <SelectItem value="login">세션발급</SelectItem>
                  <SelectItem value="zone">Zone조회</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">결과</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5" data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="ok">성공만</SelectItem>
                  <SelectItem value="fail">실패만</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">참조번호 (주문번호 / 거래처ID / 입금ID)</Label>
              <Input
                className="mt-1.5"
                placeholder="예: KN20260625-001"
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
                data-testid="filter-refid"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-logs"
            >
              <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          </div>
        </Card>

        {/* 로그 테이블 */}
        <Card className="overflow-hidden">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold text-foreground">로그 목록</h2>
            <p className="text-xs text-muted-foreground">최근 순 · 최대 {limit}건</p>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileSearch className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">조건에 맞는 로그가 없습니다.</p>
              <p className="text-xs text-muted-foreground">
                주문 상세 / 채권 관리에서 "ECOUNT 전송" 버튼을 눌러보세요.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelected(log)}
                  className="flex w-full flex-col items-start gap-1 p-4 text-left hover-elevate sm:flex-row sm:items-center sm:gap-4"
                  data-testid={`row-log-${log.id}`}
                >
                  <div className="flex shrink-0 items-center gap-2">
                    {log.ok === 1 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <Badge variant="outline" className="text-[11px]">
                      {actionLabel(log.action)}
                    </Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold text-foreground">{log.label}</span>
                      {log.refId && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {log.refKind && `[${log.refKind}] `}
                          {log.refId}
                        </span>
                      )}
                    </div>
                    {log.summary && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {log.summary}
                      </div>
                    )}
                    <div
                      className={`mt-0.5 truncate text-xs ${
                        log.ok === 1 ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      {log.message}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {fmtTime(log.createdAt)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">
                      {log.durationMs}ms
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* 상세 다이얼로그 */}
        <LogDetailDialog log={selected} onClose={() => setSelected(null)} />
      </div>
    </AdminLayout>
  );
}

function Kpi({
  label,
  value,
  loading,
  accentSuccess,
  accentFail,
}: {
  label: string;
  value: string;
  loading?: boolean;
  accentSuccess?: boolean;
  accentFail?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <div
          className={`mt-1.5 font-display text-xl font-semibold tabular ${
            accentSuccess ? "text-emerald-600" : accentFail ? "text-destructive" : "text-foreground"
          }`}
        >
          {value}
        </div>
      )}
    </Card>
  );
}

function prettyJson(s: string): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function LogDetailDialog({ log, onClose }: { log: EcountLog | null; onClose: () => void }) {
  return (
    <Dialog open={log != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {log?.ok === 1 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            {log ? `${actionLabel(log.action)} · ${log.label}` : ""}
          </DialogTitle>
        </DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Info label="시각" value={fmtTime(log.createdAt)} />
              <Info label="처리시간" value={`${log.durationMs}ms`} />
              <Info label="참조" value={log.refId ? `${log.refKind} / ${log.refId}` : "—"} />
              <Info label="결과" value={log.ok === 1 ? "성공" : "실패"} />
            </div>

            {log.summary && (
              <div>
                <Label className="text-xs">요약</Label>
                <div className="mt-1 rounded border bg-muted/40 p-2 text-xs">{log.summary}</div>
              </div>
            )}

            <div>
              <Label className="text-xs">메시지</Label>
              <div
                className={`mt-1 rounded border p-2 text-xs ${
                  log.ok === 1
                    ? "bg-muted/40 text-foreground"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {log.message || "—"}
              </div>
            </div>

            <div>
              <Label className="text-xs">요청 (Request)</Label>
              <pre className="mt-1 max-h-60 overflow-auto rounded border bg-muted/40 p-2 text-[10px] leading-relaxed">
                {prettyJson(log.requestJson) || "—"}
              </pre>
            </div>

            <div>
              <Label className="text-xs">응답 (Response)</Label>
              <pre className="mt-1 max-h-60 overflow-auto rounded border bg-muted/40 p-2 text-[10px] leading-relaxed">
                {prettyJson(log.responseJson) || "—"}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-foreground">{value}</div>
    </div>
  );
}
