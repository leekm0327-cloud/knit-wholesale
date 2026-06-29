import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { CustomerBalance } from "@shared/schema";
import { Wallet, Coins, ArrowDownToLine, AlertCircle, Building2 } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";

interface BalanceResponse {
  totalOutstanding: number;
  totalOrdered: number;
  totalPaid: number;
  balances: CustomerBalance[];
  topOverdue: CustomerBalance[];
}

export default function AdminBalances() {
  const [, navigate] = useLocation();
  const [paymentTarget, setPaymentTarget] = useState<CustomerBalance | null>(null);
  const { data, isLoading } = useQuery<BalanceResponse>({
    queryKey: ["/api/admin/balances"],
    refetchInterval: 30000,
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Receivables</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">채권 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">거래처별 미수금 현황과 입금 처리</p>

        {/* KPI */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi
            icon={AlertCircle}
            label="총 미수금"
            value={isLoading ? "" : won(data?.totalOutstanding ?? 0)}
            accent
            loading={isLoading}
          />
          <Kpi
            icon={Coins}
            label="누적 청구"
            value={isLoading ? "" : won(data?.totalOrdered ?? 0)}
            loading={isLoading}
          />
          <Kpi
            icon={ArrowDownToLine}
            label="누적 입금"
            value={isLoading ? "" : won(data?.totalPaid ?? 0)}
            loading={isLoading}
          />
        </div>

        {/* 거래처별 잔액 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">거래처별 잔액</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data || data.balances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">거래처가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.balances.map((b) => (
                <div
                  key={b.customerId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`row-balance-${b.customerId}`}
                >
                  <button
                    onClick={() => navigate(`/admin/customers/${b.customerId}/ledger`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover-elevate rounded-md px-2 py-1 -mx-2"
                  >
                    {b.balance > 0 ? (
                      <Badge className="shrink-0 bg-destructive text-[11px] text-destructive-foreground hover:bg-destructive">
                        미수
                      </Badge>
                    ) : b.balance < 0 ? (
                      <Badge variant="secondary" className="shrink-0 text-[11px]">
                        선입금
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        정산
                      </Badge>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {b.businessName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        담당 {b.managerName} · {b.phone}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        청구 {won(b.totalOrdered)} · 입금 {won(b.totalPaid)}
                        {b.lastPaidAt ? ` · 최근 입금 ${b.lastPaidAt}` : ""}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div className="text-[11px] text-muted-foreground">잔액</div>
                      <div
                        className={`font-display tabular text-base font-semibold ${
                          b.balance > 0
                            ? "text-destructive"
                            : b.balance < 0
                              ? "text-muted-foreground"
                              : "text-foreground"
                        }`}
                      >
                        {won(b.balance)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setPaymentTarget(b)}
                      data-testid={`button-add-payment-${b.customerId}`}
                    >
                      <Wallet className="mr-1 h-3.5 w-3.5" />
                      입금
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <PaymentDialog
        open={paymentTarget != null}
        customerId={paymentTarget?.customerId ?? null}
        businessName={paymentTarget?.businessName ?? ""}
        defaultAmount={Math.max(0, paymentTarget?.balance ?? 0)}
        onClose={() => setPaymentTarget(null)}
      />
    </AdminLayout>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent ? "text-destructive" : ""}`} />
        <span className="text-xs">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <div
          className={`mt-1.5 font-display text-xl font-semibold tabular ${
            accent ? "text-destructive" : "text-foreground"
          }`}
        >
          {value}
        </div>
      )}
    </Card>
  );
}
