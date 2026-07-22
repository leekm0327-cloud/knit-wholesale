import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
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

interface TransactionOrder {
  id: number;
  orderNo: string;
  createdAt: number;
  ecountDate?: string; // 관리자 지정 주문 일자 (YYYY-MM-DD). 있으면 이 값이 유효 주문일자.
  status: string;
  totalAmount: number;
  supplyAmount: number;
  vat: number;
  parsedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }>;
}

interface TransactionResult {
  customer: { id: number; businessName: string; managerName: string; phone: string };
  startDate: string;
  endDate: string;
  orders: TransactionOrder[];
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
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
    window.print();
  }

  const STATUS_LABEL: Record<string, string> = {
    pending: "대기",
    done: "완료",
    cancelled: "취소",
  };

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
          <div className="space-y-6">
            {/* 인쇄용 헤더 */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold">거래내역서</h1>
              <div className="mt-2 text-sm text-gray-600">
                <div>거래처: {result.customer.businessName}</div>
                <div>기간: {result.startDate} ~ {result.endDate}</div>
              </div>
            </div>

            {/* 합계 요약 박스 */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="총 주문금액" value={won(result.totalAmount)} />
              <SummaryCard label="입금완료" value={won(result.paidAmount)} highlight="positive" />
              <SummaryCard label="미수금" value={won(result.unpaidAmount)} highlight={result.unpaidAmount > 0 ? "negative" : undefined} />
            </div>

            {/* 거래처 정보 */}
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{result.customer.businessName}</span>
              {" · "}{result.customer.managerName}
              {" · "}{result.startDate} ~ {result.endDate}
            </div>

            {/* 거래 테이블 */}
            {result.orders.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                해당 기간에 주문 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/30">
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">날짜</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">주문번호</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">상품</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">수량</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">단가</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">합계</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.orders.map((order) =>
                      order.parsedItems.map((item, itemIdx) => (
                        <tr key={`${order.id}-${itemIdx}`} className="hover:bg-muted/10">
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {itemIdx === 0
                              ? (order.ecountDate && order.ecountDate.trim()
                                  ? order.ecountDate.replace(/-/g, ".")
                                  : fmtDate(order.createdAt).split(" ")[0])
                              : ""}
                          </td>
                          <td className="px-3 py-2.5">
                            {itemIdx === 0 ? (
                              <span className="font-ui text-xs font-semibold tabular text-foreground">{order.orderNo}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.name}</td>
                          <td className="px-3 py-2.5 text-right text-xs tabular text-foreground">{item.qty}</td>
                          <td className="px-3 py-2.5 text-right text-xs tabular text-muted-foreground">{won(item.unitPrice)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-medium tabular text-foreground">{won(item.amount)}</td>
                          <td className="px-3 py-2.5 text-center">
                            {itemIdx === 0 ? (
                              <span className={`text-[10px] font-medium ${order.status === "done" ? "text-green-600" : order.status === "cancelled" ? "text-muted-foreground" : "text-amber-600"}`}>
                                {STATUS_LABEL[order.status] ?? order.status}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground">
                      <td colSpan={5} className="px-3 py-3 text-right text-sm font-semibold">합계</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular text-foreground">{won(result.totalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ) : queryKey != null ? (
          <div className="py-16 text-center text-sm text-muted-foreground">조회 중 오류가 발생했습니다.</div>
        ) : null}
      </div>

      {/* 인쇄 스타일 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          table, table * { visibility: visible; }
          .overflow-x-auto { visibility: visible; }
          .space-y-6 { visibility: visible; }
          .space-y-6 * { visibility: visible; }
        }
      `}</style>
    </AdminLayout>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`mt-1.5 font-display text-lg font-bold tabular ${
        highlight === "negative" ? "text-destructive" : highlight === "positive" ? "text-emerald-600" : "text-foreground"
      }`}>
        {value}
      </div>
    </div>
  );
}
