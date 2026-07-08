import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { SupplierBalance } from "@shared/schema";
import { AlertCircle, PackagePlus, ArrowDownToLine, Factory } from "lucide-react";

interface BalanceResponse {
  totalOutstanding: number;
  totalPurchased: number;
  totalPaid: number;
  monthPurchased: number;
  monthPaid: number;
  balances: SupplierBalance[];
}

export default function AdminSupplierBalances() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<BalanceResponse>({
    queryKey: ["/api/admin/supplier-balances"],
    refetchInterval: 30000,
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Factory Debt</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">공장 채무 현황</h1>
        <p className="mb-6 text-sm text-muted-foreground">OEM 공급처별 채무(미지급) 현황</p>

        {/* KPI */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi icon={AlertCircle} label="총 채무" value={isLoading ? "" : won(data?.totalOutstanding ?? 0)} accent loading={isLoading} />
          <Kpi icon={PackagePlus} label="이번 달 발주" value={isLoading ? "" : won(data?.monthPurchased ?? 0)} loading={isLoading} />
          <Kpi icon={ArrowDownToLine} label="이번 달 지급" value={isLoading ? "" : won(data?.monthPaid ?? 0)} loading={isLoading} />
        </div>

        {/* 공급처별 채무 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">공급처별 채무</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !data || data.balances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Factory className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">공급처가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data.balances.map((b) => (
                <button
                  key={b.supplierId}
                  onClick={() => navigate(`/admin/suppliers/${b.supplierId}/ledger`)}
                  className="flex w-full flex-col gap-3 p-4 text-left hover-elevate sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`row-supplier-balance-${b.supplierId}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {b.balance > 0 ? (
                      <Badge className="shrink-0 bg-destructive text-[11px] text-destructive-foreground hover:bg-destructive">미지급</Badge>
                    ) : b.balance < 0 ? (
                      <Badge variant="secondary" className="shrink-0 text-[11px]">선지급</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[11px]">정산</Badge>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{b.name}</div>
                      <div className="truncate text-xs text-muted-foreground">담당 {b.contact || "-"} · {b.phone || "-"}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        발주 {won(b.totalPurchased)} · 지급 {won(b.totalPaid)}
                        {b.lastPurchaseAt ? ` · 최근 발주 ${fmtDate(b.lastPurchaseAt)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-muted-foreground">채무</div>
                    <div
                      className={`font-display tabular text-base font-semibold ${
                        b.balance > 0 ? "text-destructive" : b.balance < 0 ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {won(b.balance)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
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
        <div className={`mt-1.5 font-display text-xl font-semibold tabular ${accent ? "text-destructive" : "text-foreground"}`}>
          {value}
        </div>
      )}
    </Card>
  );
}
