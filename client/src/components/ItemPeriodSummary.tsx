import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { won } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/format";
import type { ItemSummaryRow } from "@shared/schema";
import { ChevronDown, PackageSearch } from "lucide-react";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** 주문/발주의 품목별 기간 집계 패널 (접이식). endpoint 예: /api/admin/orders/item-summary */
export function ItemPeriodSummary({
  endpoint,
  qtyLabel = "수량",
  amountLabel = "금액",
}: {
  endpoint: string;
  qtyLabel?: string;
  amountLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const init = useMemo(() => ({ from: monthStart(), to: ymd(new Date()) }), []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isLoading } = useQuery<ItemSummaryRow[]>({
    queryKey: [endpoint, { from, to }],
    queryFn: async () => {
      const res = await apiRequest("GET", `${endpoint}?from=${from}&to=${to}`);
      return res.json();
    },
    enabled: open,
  });

  const rows = data ?? [];
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <Card className="mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left hover-elevate"
        data-testid="button-toggle-item-summary"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PackageSearch className="h-4 w-4" />
          품목별 기간 집계
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t p-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-itemsum-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-itemsum-to" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFrom(monthStart()); setTo(ymd(new Date())); }}
                data-testid="button-itemsum-month"
              >
                이번 달
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">이 기간에 집계된 품목이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">품목</th>
                    <th className="px-4 py-2 text-left font-medium">카테고리</th>
                    <th className="px-4 py-2 text-right font-medium">{qtyLabel}</th>
                    <th className="px-4 py-2 text-right font-medium">{amountLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.name} data-testid={`row-itemsum-${r.name}`}>
                      <td className="px-4 py-2.5 text-foreground">{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {r.category ? (CATEGORY_LABEL[r.category] ?? r.category) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular font-semibold text-foreground">{r.qty.toLocaleString()}개</td>
                      <td className="px-4 py-2.5 text-right tabular text-foreground">{won(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20 font-semibold">
                    <td className="px-4 py-2.5 text-foreground" colSpan={2}>합계 ({rows.length}개 품목)</td>
                    <td className="px-4 py-2.5 text-right tabular text-foreground">{totalQty.toLocaleString()}개</td>
                    <td className="px-4 py-2.5 text-right tabular text-foreground">{won(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
