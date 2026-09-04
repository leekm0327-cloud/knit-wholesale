import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatementDoc, StatementPrintStyle, printStatement, type TransactionResult } from "@/components/StatementDoc";
import { Printer } from "lucide-react";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    thisMonth: { start: toDateStr(new Date(y, m, 1)), end: toDateStr(new Date(y, m + 1, 0)), label: "이번달" },
    lastMonth: { start: toDateStr(new Date(y, m - 1, 1)), end: toDateStr(new Date(y, m, 0)), label: "지난달" },
    thisYear: { start: toDateStr(new Date(y, 0, 1)), end: toDateStr(new Date(y, 11, 31)), label: "올해" },
  };
}

// 거래처용 월별 거래내역서 — 관리자가 보내주던 것을 거래처가 직접 조회·인쇄한다.
// 잔액은 조회 기간이 아니라 전체(전월 이월 포함) 기준이다.
export default function Statement() {
  const presets = useMemo(() => getPresets(), []);
  // 처음 열면 지난달이 보이게 — 월초에 지난달 명세를 뽑는 경우가 가장 많다
  const [startDate, setStartDate] = useState(presets.lastMonth.start);
  const [endDate, setEndDate] = useState(presets.lastMonth.end);
  const [queryKey, setQueryKey] = useState<string | null>(`${presets.lastMonth.start}_${presets.lastMonth.end}`);
  const [applied, setApplied] = useState({ start: presets.lastMonth.start, end: presets.lastMonth.end });

  const { data: result, isLoading, error } = useQuery<TransactionResult>({
    queryKey: ["/api/account/transactions", queryKey],
    queryFn: async () => {
      const res = await fetch(`/api/account/transactions?startDate=${applied.start}&endDate=${applied.end}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.message ?? "조회 실패");
      }
      return res.json();
    },
    enabled: queryKey != null,
    retry: false,
  });

  function search() {
    if (!startDate || !endDate) return;
    setApplied({ start: startDate, end: endDate });
    setQueryKey(`${startDate}_${endDate}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 print:px-0 print:py-0">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <div className="eyebrow">Statement</div>
            <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">거래내역서</h1>
            <p className="text-sm text-muted-foreground break-keep">
              기간을 골라 조회하고 인쇄 또는 PDF로 저장할 수 있습니다. 잔액은 전월 이월을 포함한 전체 기준입니다.
            </p>
          </div>
          {result && (
            <Button variant="outline" onClick={() => printStatement(result)} data-testid="button-print-statement">
              <Printer className="mr-1.5 h-4 w-4" />
              인쇄 / PDF
            </Button>
          )}
        </div>

        <div className="mb-6 space-y-4 rounded-lg border border-border p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="input-start-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" data-testid="input-end-date" />
            </div>
            <div className="flex gap-2 pb-0.5">
              {Object.values(presets).map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button onClick={search} data-testid="button-search-statement">조회</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : result ? (
          <StatementDoc result={result} />
        ) : error ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{(error as Error).message}</div>
        ) : null}
      </main>
      <StatementPrintStyle />
    </div>
  );
}
