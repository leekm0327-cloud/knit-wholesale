import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { won } from "@/lib/format";
import type { FinancialStatement, Sector } from "@shared/schema";
import { FileSpreadsheet } from "lucide-react";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 부문 → 업종 표시명 (매장=음식점업, 홀세일=원두도매업)
const BIZ_LABEL: Partial<Record<Sector, string>> = {
  store: "음식점업 (매장)",
  wholesale: "원두도매업 (도매)",
  online: "온라인",
  atelier: "아뜰리에",
  common: "공통",
};
function bizLabel(sector: Sector, fallback: string): string {
  return BIZ_LABEL[sector] ?? fallback;
}

export default function AdminFinancials() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";

  const init = useMemo(() => {
    const now = new Date();
    return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
  }, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isLoading } = useQuery<FinancialStatement>({
    queryKey: ["/api/admin/financial-statement", { from, to }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/financial-statement?from=${from}&to=${to}`);
      return res.json();
    },
    enabled: isOwner,
  });

  function thisYear() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-01-01`);
    setTo(ymd(now));
  }
  function thisMonth() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setTo(ymd(now));
  }
  function lastYear() {
    const y = new Date().getFullYear() - 1;
    setFrom(`${y}-01-01`);
    setTo(`${y}-12-31`);
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const lines = data?.lines ?? [];
  const t = data?.totals;
  const wc = data?.workingCapital;

  // 손익계산서 행 정의 (항목명, 값 추출기, 강조 여부)
  const rows: { key: string; label: string; get: (l: FinancialStatement["lines"][number]) => number; total: number; strong?: boolean; sign?: "minus" }[] = t
    ? [
        { key: "revenue", label: "매출액", get: (l) => l.revenue, total: t.revenue },
        { key: "cogs", label: "(−) 매출원가 (공장 매입)", get: (l) => l.cogs, total: t.cogs, sign: "minus" },
        { key: "gross", label: "매출총이익", get: (l) => l.grossProfit, total: t.grossProfit, strong: true },
        { key: "sga", label: "(−) 판매관리비", get: (l) => l.sga, total: t.sga, sign: "minus" },
        { key: "op", label: "영업이익", get: (l) => l.operatingProfit, total: t.operatingProfit, strong: true },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Financial statements</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">재무제표</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          업종별(음식점업·원두도매업) 손익계산서와 채권·채무 현황입니다. 앱 데이터 기반의 내부 경영용 자료이며, 공식 세무신고용 재무제표가 아닙니다.
        </p>

        {/* 기간 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-fs-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-fs-to" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={thisMonth} data-testid="button-fs-month">이번 달</Button>
              <Button variant="outline" size="sm" onClick={thisYear} data-testid="button-fs-year">올해</Button>
              <Button variant="outline" size="sm" onClick={lastYear} data-testid="button-fs-lastyear">작년</Button>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
          </div>
        ) : (
          <>
            {/* 손익계산서 */}
            <Card className="mb-6 overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">손익계산서 (업종별)</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{from} ~ {to}</p>
              </div>
              {lines.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">이 기간에 집계된 손익이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">항목</th>
                        {lines.map((l) => (
                          <th key={l.sector} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                            {bizLabel(l.sector, l.label)}
                          </th>
                        ))}
                        <th className="px-4 py-2 text-right font-semibold text-foreground">합계</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => (
                        <tr key={r.key} className={r.strong ? "bg-muted/20" : ""}>
                          <td className={`px-4 py-3 whitespace-nowrap ${r.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {r.label}
                          </td>
                          {lines.map((l) => {
                            const v = r.get(l);
                            return (
                              <td
                                key={l.sector}
                                className={`px-4 py-3 text-right tabular ${
                                  r.strong
                                    ? v < 0 ? "font-semibold text-destructive" : "font-semibold text-foreground"
                                    : "text-foreground"
                                }`}
                              >
                                {won(v)}
                              </td>
                            );
                          })}
                          <td
                            className={`px-4 py-3 text-right tabular font-semibold ${
                              r.total < 0 ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {won(r.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="border-t p-3 text-[11px] text-muted-foreground">
                매출원가 = 원두도매업의 공장 매입(발주) + 각 부문의 '원부자재' 지출. 그 외 지출은 판매관리비로 집계됩니다.
              </div>
            </Card>

            {/* 채권·채무 요약 */}
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">채권 · 채무 현황 (현재 시점)</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">거래처 미수금 (채권)</p>
                  <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-receivables">
                    {won(wc?.receivables ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">공장 미지급금 (채무)</p>
                  <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-payables">
                    {won(wc?.payables ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">순운전자본 (채권 − 채무)</p>
                  <p
                    className={`font-display mt-1 text-lg font-semibold tabular ${
                      (wc?.net ?? 0) < 0 ? "text-destructive" : "text-foreground"
                    }`}
                    data-testid="text-net-wc"
                  >
                    {won(wc?.net ?? 0)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                채권·채무는 기간과 무관하게 현재 미수·미지급 잔액 스냅샷입니다.
              </p>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
