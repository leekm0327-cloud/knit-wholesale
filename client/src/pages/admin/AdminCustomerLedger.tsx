import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { CustomerBalance, LedgerRow, Payment } from "@shared/schema";
import { ArrowLeft, Trash2, Wallet, FileText } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";

interface LedgerResponse {
  balance: CustomerBalance;
  rows: LedgerRow[];
  payments: Payment[];
}

const METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

export default function AdminCustomerLedger() {
  const [, params] = useRoute("/admin/customers/:id/ledger");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const customerId = params ? Number(params.id) : 0;
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["/api/admin/customers", customerId, "ledger"],
    enabled: customerId > 0,
  });

  async function deletePayment(p: Payment) {
    if (!confirm(`${p.paidAt} ${won(p.amount)} 입금 내역을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/payments/${p.id}`);
      toast({ title: "입금 내역이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balances"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  const b = data?.balance;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/balances")} className="mb-3 -ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          채권 관리로
        </Button>

        {isLoading || !b ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="eyebrow">Ledger</div>
                <h1 className="font-display mt-1 text-xl font-semibold text-foreground">{b.businessName}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">담당 {b.managerName} · {b.phone}</p>
              </div>
              <Button onClick={() => setPayOpen(true)} data-testid="button-open-payment">
                <Wallet className="mr-2 h-4 w-4" />
                입금 등록
              </Button>
            </div>

            {/* 요약 */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              <Summary label="누적 청구" value={won(b.totalOrdered)} />
              <Summary label="누적 입금" value={won(b.totalPaid)} />
              <Summary
                label="현재 잔액"
                value={won(b.balance)}
                accent={b.balance > 0}
              />
            </div>

            {/* 원장 */}
            <Card className="overflow-hidden">
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
                        <th className="px-4 py-2 text-right font-medium">청구</th>
                        <th className="px-4 py-2 text-right font-medium">입금</th>
                        <th className="px-4 py-2 text-right font-medium">잔액</th>
                        <th className="px-4 py-2 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data!.rows.map((r) => (
                        <tr key={`${r.kind}-${r.id}`} data-testid={`row-ledger-${r.kind}-${r.id}`}>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(r.date)}
                          </td>
                          <td className="px-4 py-3">
                            {r.kind === "order" ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">주문</Badge>
                                <button
                                  className="font-display tabular text-xs font-semibold text-foreground hover:underline"
                                  onClick={() => navigate(`/admin/orders/${r.id}`)}
                                >
                                  {r.orderNo}
                                </button>
                                {r.status === "pending" && (
                                  <Badge className="bg-destructive text-[10px] text-destructive-foreground hover:bg-destructive">
                                    미처리
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">입금</Badge>
                                <span className="text-xs text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method}</span>
                                {r.memo && <span className="text-xs text-muted-foreground truncate max-w-[160px]">· {r.memo}</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular text-foreground">
                            {r.debit > 0 ? won(r.debit) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right tabular text-muted-foreground">
                            {r.credit > 0 ? `-${won(r.credit)}` : "-"}
                          </td>
                          <td className={`px-4 py-3 text-right font-display tabular font-semibold ${r.balance > 0 ? "text-destructive" : "text-foreground"}`}>
                            {won(r.balance)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.kind === "order" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/admin/orders/${r.id}`)}
                                aria-label="주문 상세"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletePayment(data!.payments.find((p) => p.id === r.id)!)}
                                aria-label="입금 삭제"
                                data-testid={`button-delete-payment-${r.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </td>
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

      <PaymentDialog
        open={payOpen}
        customerId={customerId}
        businessName={b?.businessName ?? ""}
        defaultAmount={Math.max(0, b?.balance ?? 0)}
        onClose={() => setPayOpen(false)}
      />
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
