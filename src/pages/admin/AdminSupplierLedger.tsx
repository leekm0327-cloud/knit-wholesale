import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { won, fmtDate } from "@/lib/format";
import type { SupplierBalance, SupplierLedgerRow, PurchaseQtyAgg, SupplierPayment, SupplierLedgerPeriod } from "@shared/schema";
import { ArrowLeft } from "lucide-react";

interface LedgerResponse {
  balance: SupplierBalance;
  rows: SupplierLedgerRow[];
  qtyAgg: PurchaseQtyAgg[];
  payments: SupplierPayment[];
  period: SupplierLedgerPeriod | null;
}

// KST 기준 날짜 유틸 (YYYY-MM-DD)
function kstToday(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
type Preset = "all" | "thisMonth" | "lastMonth" | "last3m" | "custom";
function presetRange(p: Preset): { from: string; to: string } {
  const t = kstToday();
  const y = t.getFullYear();
  const m = t.getMonth();
  if (p === "thisMonth") {
    return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  }
  if (p === "lastMonth") {
    return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
  }
  if (p === "last3m") {
    return { from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m + 1, 0)) };
  }
  return { from: "", to: "" };
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

  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["/api/admin/suppliers", supplierId, "ledger", from, to],
    enabled: supplierId > 0,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const res = await fetch(`/api/admin/suppliers/${supplierId}/ledger${suffix}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const b = data?.balance;
  const period = data?.period ?? null;

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return; // 사용자 직접 입력 유지
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/supplier-balances")} className="mb-3 -ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          공장 채무 현황으로
        </Button>

        {/* 기간 선택 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-medium text-muted-foreground">조회 기간</span>
              {([
                ["all", "전체"],
                ["thisMonth", "이번 달"],
                ["lastMonth", "지난 달"],
                ["last3m", "최근 3개월"],
              ] as [Preset, string][]).map(([p, label]) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  data-testid={`btn-preset-${p}`}
                  className={`rounded-none border px-3 py-1 text-xs transition-colors ${
                    preset === p
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover-elevate"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }}
                data-testid="input-from"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => { setPreset("custom"); setTo(e.target.value); }}
                data-testid="input-to"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
              {(from || to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset("all")}
                  data-testid="btn-clear-period"
                  className="text-xs text-muted-foreground"
                >
                  초기화
                </Button>
              )}
            </div>
          </div>
        </Card>

        {isLoading || !b ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="mb-6">
              <div className="eyebrow">Ledger</div>
              <h1 className="font-display mt-1 text-xl font-semibold text-foreground">{b.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">담당 {b.contact || "-"} · {b.phone || "-"}</p>
            </div>

            {/* 누적 요약 (전체 기간) */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              <Summary label="누적 발주" value={won(b.totalPurchased)} />
              <Summary label="누적 지급" value={won(b.totalPaid)} />
              <Summary label="현재 채무" value={won(b.balance)} accent={b.balance > 0} />
            </div>

            {/* 기간 요약 (기간 선택 시) */}
            {period && (
              <Card className="mb-6 overflow-hidden border-foreground/20">
                <div className="border-b bg-muted/30 px-5 py-3">
                  <div className="text-xs font-semibold text-foreground">선택 기간 요약</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {period.from ?? "처음"} ~ {period.to ?? "오늘"} · {period.count}건 · 부가세 포함
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <PeriodCell label="기초 잔액" value={won(period.openingBalance)} />
                  <PeriodCell label="기간 발주" value={won(period.purchased)} />
                  <PeriodCell label="기간 지급" value={period.paid > 0 ? `-${won(period.paid)}` : won(0)} />
                  <PeriodCell label="기말 잔액" value={won(period.closingBalance)} accent={period.closingBalance > 0} />
                </div>
                <div className="border-t px-5 py-2.5 text-right text-xs text-muted-foreground">
                  기간 순증감{" "}
                  <span className={`font-display font-semibold ${period.net > 0 ? "text-destructive" : period.net < 0 ? "text-foreground" : ""}`}>
                    {period.net > 0 ? "+" : ""}{won(period.net)}
                  </span>
                </div>
              </Card>
            )}

            {/* 원장 */}
            <Card className="mb-6 overflow-hidden">
              <div className="flex items-center justify-between border-b p-5">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    거래 원장{period ? " · 선택 기간" : ""}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">발주·채무 금액은 부가세 포함</p>
                </div>
                <span className="text-xs text-muted-foreground">{data!.rows.length}건</span>
              </div>
              {data!.rows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">{period ? "선택한 기간에 거래 내역이 없습니다." : "거래 내역이 없습니다."}</div>
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

function PeriodCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card p-4">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-base font-semibold tabular ${accent ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
