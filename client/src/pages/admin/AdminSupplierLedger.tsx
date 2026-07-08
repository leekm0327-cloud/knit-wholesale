import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { SupplierBalance, SupplierLedgerRow, PurchaseQtyAgg, SupplierPayment } from "@shared/schema";
import { ArrowLeft } from "lucide-react";

interface LedgerResponse {
  balance: SupplierBalance;
  rows: SupplierLedgerRow[];
  qtyAgg: PurchaseQtyAgg[];
  payments: SupplierPayment[];
}

const METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

export default function AdminSupplierLedger() {
  const [, params] = useRoute("/admin/suppliers/:id/ledger");
  const [, navigate] = useLocation();
  const supplierId = params ? Number(params.id) : 0;

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["/api/admin/suppliers", supplierId, "ledger"],
    enabled: supplierId > 0,
  });

  const b = data?.balance;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/supplier-balances")} className="mb-3 -ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          공장 채무 현황으로
        </Button>

        {isLoading || !b ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="mb-6">
              <div className="eyebrow">Ledger</div>
              <h1 className="font-display mt-1 text-xl font-semibold text-foreground">{b.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">담당 {b.contact || "-"} · {b.phone || "-"}</p>
            </div>

            {/* 요약 */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              <Summary label="누적 발주" value={won(b.totalPurchased)} />
              <Summary label="누적 지급" value={won(b.totalPaid)} />
              <Summary label="현재 채무" value={won(b.balance)} accent={b.balance > 0} />
            </div>

            {/* 원장 */}
            <Card className="mb-6 overflow-hidden">
              <div className="flex items-center justify-between border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">거래 원장</h2>
                <span className="text-xs text-muted-foreground">{data!.rows.length}건</span>
              </div>
              {data!.rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">거래 내역이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">일자</th>
                        <th className="px-4 py-2 text-left font-medium">구분</th>
                        <th className="px-4 py-2 text-right font-medium">발주</th>
                        <th className="px-4 py-2 text-right font-medium">지급</th>
                        <th className="px-4 py-2 text-right font-medium">채무</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data!.rows.map((r) => (
                        <tr key={`${r.kind}-${r.id}`} data-testid={`row-supplier-ledger-${r.kind}-${r.id}`}>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-4 py-3">
                            {r.kind === "purchase" ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">발주</Badge>
                                <span className="font-display tabular text-xs font-semibold text-foreground">{r.purchaseNo}</span>
                                {r.memo && <span className="truncate max-w-[160px] text-xs text-muted-foreground">· {r.memo}</span>}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">지급</Badge>
                                <span className="text-xs text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method}</span>
                                {r.memo && <span className="truncate max-w-[160px] text-xs text-muted-foreground">· {r.memo}</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular text-foreground">{r.debit > 0 ? won(r.debit) : "-"}</td>
                          <td className="px-4 py-3 text-right tabular text-muted-foreground">{r.credit > 0 ? `-${won(r.credit)}` : "-"}</td>
                          <td className={`px-4 py-3 text-right font-display tabular font-semibold ${r.balance > 0 ? "text-destructive" : "text-foreground"}`}>
                            {won(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* 품목별 발주량 집계 */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">품목별 발주량</h2>
                <span className="text-xs text-muted-foreground">{data!.qtyAgg.length}개 품목</span>
              </div>
              {data!.qtyAgg.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">발주 품목이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">품목</th>
                        <th className="px-4 py-2 text-right font-medium">누적 수량</th>
                        <th className="px-4 py-2 text-right font-medium">누적 금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data!.qtyAgg.map((q) => (
                        <tr key={q.key} data-testid={`row-qty-agg-${q.key}`}>
                          <td className="px-4 py-3 text-foreground">{q.name}</td>
                          <td className="px-4 py-3 text-right tabular text-foreground">{q.totalQty}</td>
                          <td className="px-4 py-3 text-right font-display tabular font-semibold text-foreground">{won(q.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-semibold tabular ${accent ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </Card>
  );
}
