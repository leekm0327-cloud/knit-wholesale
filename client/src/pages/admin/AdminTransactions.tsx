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

interface TransactionPayment {
  id: number;
  paidAt: string; // YYYY-MM-DD
  amount: number;
  method: string; // transfer | cash | card | other
  memo: string;
}

interface TransactionResult {
  customer: { id: number; businessName: string; managerName: string; phone: string; bizRegNo: string; address: string };
  startDate: string;
  endDate: string;
  orders: TransactionOrder[];
  payments: TransactionPayment[];
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

const PAY_METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

// 공급자(니트커피) 고정 정보 — 거래명세서 상단 공급자란
const SELLER = {
  name: "니트커피 (knit coffee)",
  bizRegNo: "714-21-01743",
  ceo: "이강민",
  address: "서울특별시 중구 소월로2길 30 남산트라팰리스 1층 107호",
  bizType: "도소매",
  bizItem: "가공식품",
  phone: "070-7717-0613",
  bankName: "국민은행",
  bankAccount: "098937-04-011092",
  bankHolder: "이강민(니트커피)",
};

// 사업자등록번호 표시 형식 (XXX-XX-XXXXX)
function fmtBizNo(raw: string): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return raw;
}

// YYYY.MM.DD (KST 오늘)
function todayStr(): string {
  const now = new Date();
  const k = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${k.getFullYear()}.${String(k.getMonth() + 1).padStart(2, "0")}.${String(k.getDate()).padStart(2, "0")}`;
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
          (() => {
            const supplyTotal = result.orders.reduce((s, o) => s + o.supplyAmount, 0);
            const vatTotal = result.orders.reduce((s, o) => s + o.vat, 0);
            return (
          <div className="print-area txn-doc mx-auto max-w-3xl border border-foreground/70 bg-white p-6 text-foreground sm:p-8">
            {/* 제목 + 발행 정보 */}
            <div className="flex items-start justify-between border-b-2 border-foreground pb-3">
              <h1 className="font-display text-2xl font-bold tracking-[0.35em]">거래명세서</h1>
              <div className="text-right text-[11px] leading-relaxed text-muted-foreground">
                <div>발행일자 : {todayStr()}</div>
                <div>거래기간 : {result.startDate.replace(/-/g, ".")} ~ {result.endDate.replace(/-/g, ".")}</div>
                <div className="mt-0.5 font-semibold text-foreground">(공급받는자 보관용)</div>
              </div>
            </div>

            {/* 공급자 / 공급받는자 */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PartyBox
                title="공급자"
                rows={[
                  ["등록번호", SELLER.bizRegNo],
                  ["상호", SELLER.name],
                  ["대표자", SELLER.ceo],
                  ["사업장", SELLER.address],
                  ["업태 / 종목", `${SELLER.bizType} / ${SELLER.bizItem}`],
                  ["전화", SELLER.phone],
                ]}
              />
              <PartyBox
                title="공급받는자"
                rows={[
                  ["등록번호", fmtBizNo(result.customer.bizRegNo)],
                  ["상호", result.customer.businessName],
                  ["대표 / 담당", result.customer.managerName],
                  ["사업장", result.customer.address],
                  ["전화", result.customer.phone],
                ]}
              />
            </div>

            {/* 금액 요약 */}
            <div className="mt-4 grid grid-cols-2 border border-border sm:grid-cols-5">
              <AmtCell label="공급가액" value={won(supplyTotal)} />
              <AmtCell label="세액(부가세)" value={won(vatTotal)} />
              <AmtCell label="합계금액" value={won(result.totalAmount)} strong />
              <AmtCell label="입금액" value={won(result.paidAmount)} tone="pos" />
              <AmtCell label="미수 잔액" value={won(result.unpaidAmount)} tone={result.unpaidAmount > 0 ? "neg" : undefined} />
            </div>

            {/* 거래 명세 테이블 */}
            <div className="mt-5 overflow-x-auto">
              {result.orders.length === 0 ? (
                <div className="border border-border py-16 text-center text-sm text-muted-foreground">
                  해당 기간에 거래 내역이 없습니다.
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y-2 border-foreground bg-muted/30">
                      <th className="px-2 py-2 text-left text-[11px] font-semibold text-foreground">일자</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold text-foreground">품목</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">수량</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">단가</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">공급가액</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">세액</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">합계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.orders.map((order) =>
                      order.parsedItems.map((item, itemIdx) => {
                        const lineVat = Math.round(item.amount * 0.1);
                        return (
                          <tr key={`${order.id}-${itemIdx}`}>
                            <td className="px-2 py-2 text-xs text-muted-foreground">
                              {itemIdx === 0
                                ? (order.ecountDate && order.ecountDate.trim()
                                    ? order.ecountDate.replace(/-/g, ".")
                                    : fmtDate(order.createdAt).split(" ")[0])
                                : ""}
                            </td>
                            <td className="px-2 py-2 text-xs text-foreground">{item.name}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-foreground">{item.qty}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{won(item.unitPrice)}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-foreground">{won(item.amount)}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{won(lineVat)}</td>
                            <td className="px-2 py-2 text-right text-xs font-medium tabular text-foreground">{won(item.amount + lineVat)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground bg-muted/20">
                      <td colSpan={4} className="px-2 py-2.5 text-right text-xs font-bold">합계</td>
                      <td className="px-2 py-2.5 text-right text-xs font-bold tabular">{won(supplyTotal)}</td>
                      <td className="px-2 py-2.5 text-right text-xs font-bold tabular">{won(vatTotal)}</td>
                      <td className="px-2 py-2.5 text-right text-sm font-bold tabular">{won(result.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* 입금 내역 */}
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-bold text-foreground">입금 내역</h2>
              {(!result.payments || result.payments.length === 0) ? (
                <div className="border border-border py-6 text-center text-xs text-muted-foreground">
                  해당 기간에 입금 내역이 없습니다.
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-foreground bg-muted/30">
                      <th className="px-2 py-2 text-left text-[11px] font-semibold text-foreground">입금일</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold text-foreground">방법</th>
                      <th className="px-2 py-2 text-left text-[11px] font-semibold text-foreground">메모</th>
                      <th className="px-2 py-2 text-right text-[11px] font-semibold text-foreground">입금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{p.paidAt.replace(/-/g, ".")}</td>
                        <td className="px-2 py-2 text-xs text-foreground">{PAY_METHOD_LABEL[p.method] ?? p.method}</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{p.memo || "—"}</td>
                        <td className="px-2 py-2 text-right text-xs font-medium tabular text-foreground">{won(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground">
                      <td colSpan={3} className="px-2 py-2.5 text-right text-xs font-bold">입금 합계</td>
                      <td className="px-2 py-2.5 text-right text-xs font-bold tabular">{won(result.paidAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* 입금계좌 안내 */}
            <div className="mt-5 border border-border bg-muted/20 px-3 py-2.5 text-[11px] text-foreground">
              <span className="font-semibold">입금계좌</span> · {SELLER.bankName} {SELLER.bankAccount} (예금주 : {SELLER.bankHolder})
            </div>

            {/* 확인 문구 + 발행 */}
            <div className="mt-6 flex flex-col items-center gap-1 text-center">
              <p className="text-xs text-muted-foreground">위와 같이 거래하였음을 확인합니다.</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{todayStr()}</p>
              <p className="text-sm font-bold text-foreground">{SELLER.name}</p>
            </div>
          </div>
            );
          })()
        ) : queryKey != null ? (
          <div className="py-16 text-center text-sm text-muted-foreground">조회 중 오류가 발생했습니다.</div>
        ) : null}
      </div>

      {/* 인쇄 전용 레이아웃 보정 — 거래명세서(A4) */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .txn-doc {
            max-width: none !important; border: 1px solid #333 !important;
            padding: 10mm !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .txn-doc table { width: 100%; border-collapse: collapse; font-size: 10px; }
          .txn-doc th, .txn-doc td {
            padding: 3px 5px !important;
            white-space: nowrap;              /* 기본: 줄바꿈 금지 (숫자·날짜) */
            vertical-align: top;
          }
          /* 명세 테이블의 품목(2번째)·입금 메모(3번째) 칸만 줄바꿈 허용 */
          .txn-doc td:nth-child(2), .txn-doc td:nth-child(3) { white-space: normal; }
          .txn-doc h1 { font-size: 20px; }
          .txn-doc h2 { font-size: 12px; }
          /* 공급자/공급받는자 2단 유지 */
          .txn-doc .sm\\:grid-cols-2 { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; }
          /* 금액 요약 5칸 유지 */
          .txn-doc .sm\\:grid-cols-5 { display: grid !important; grid-template-columns: repeat(5, 1fr) !important; }
        }
      `}</style>
    </AdminLayout>
  );
}

// 공급자/공급받는자 정보 박스
function PartyBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-bold text-foreground">{title}</div>
      <div className="divide-y divide-border/60">
        {rows.map(([k, v]) => (
          <div key={k} className="flex text-[11px]">
            <div className="w-[74px] shrink-0 bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground">{k}</div>
            <div className="flex-1 break-words px-2.5 py-1.5 text-foreground">{v || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 금액 요약 셀
function AmtCell({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="border-b border-r border-border px-2.5 py-2 last:border-r-0">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-display tabular ${strong ? "text-sm font-bold" : "text-xs font-semibold"} ${
        tone === "neg" ? "text-destructive" : tone === "pos" ? "text-emerald-600" : "text-foreground"
      }`}>
        {value}
      </div>
    </div>
  );
}
