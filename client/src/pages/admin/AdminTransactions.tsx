import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatementDoc, StatementPrintStyle, printStatement, type TransactionResult } from "@/components/StatementDoc";
import type { PublicCustomer } from "@shared/schema";
import { FileText, Printer } from "lucide-react";

// 날짜 헬퍼
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // 이번달
  const thisMonthStart = new Date(y, m, 1);
  const thisMonthEnd = new Date(y, m + 1, 0);

  // 지난달
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);

  // 올해
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y, 11, 31);

  return {
    thisMonth: { start: toDateStr(thisMonthStart), end: toDateStr(thisMonthEnd), label: "이번달" },
    lastMonth: { start: toDateStr(lastMonthStart), end: toDateStr(lastMonthEnd), label: "지난달" },
    thisYear: { start: toDateStr(yearStart), end: toDateStr(yearEnd), label: "올해" },
  };
}

export default function AdminTransactions() {
  const presets = useMemo(() => getPresets(), []);

  const [customerId, setCustomerId] = useState<string>("");
  const [startDate, setStartDate] = useState(presets.thisMonth.start);
  const [endDate, setEndDate] = useState(presets.thisMonth.end);
  const [queryKey, setQueryKey] = useState<string | null>(null);

  const { data: customers, isLoading: customersLoading } = useQuery<PublicCustomer[]>({
    queryKey: ["/api/admin/customers"],
  });

  const { data: result, isLoading: resultLoading } = useQuery<TransactionResult>({
    queryKey: ["/api/admin/transactions", queryKey],
    queryFn: async () => {
      const res = await fetch(`/api/admin/transactions?customerId=${customerId}&startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.message ?? "조회 실패");
      }
      return res.json();
    },
    enabled: queryKey != null,
    retry: false,
  });

  function applyPreset(preset: { start: string; end: string }) {
    setStartDate(preset.start);
    setEndDate(preset.end);
  }

  function search() {
    if (!customerId) return;
    setQueryKey(`${customerId}_${startDate}_${endDate}`);
  }

  function handlePrint() {
    printStatement(result);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 print:px-0 print:py-0">
        {/* 헤더 */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <div className="eyebrow">Transactions</div>
            <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">거래내역서</h1>
            <p className="text-sm text-muted-foreground">거래처별 기간 거래 내역을 조회합니다.</p>
          </div>
          {result && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-1.5 h-4 w-4" />
              인쇄 / PDF
            </Button>
          )}
        </div>

        {/* 검색 폼 */}
        <div className="mb-6 space-y-4 rounded-lg border border-border p-4 print:hidden">
          {/* 거래처 선택 */}
          <div className="space-y-1.5">
            <Label className="text-xs">거래처</Label>
            {customersLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="select-customer"
              >
                <option value="">거래처를 선택하세요</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.businessName}</option>
                ))}
              </select>
            )}
          </div>

          {/* 날짜 범위 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
                data-testid="input-end-date"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              {Object.values(presets).map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={search} disabled={!customerId} data-testid="button-search-transactions">
            조회
          </Button>
        </div>

        {/* 결과 */}
        {resultLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : result ? (
          <StatementDoc result={result} />
        ) : queryKey != null ? (
          <div className="py-16 text-center text-sm text-muted-foreground">조회 중 오류가 발생했습니다.</div>
        ) : null}
      </div>

      <StatementPrintStyle />
    </AdminLayout>
  );
}

