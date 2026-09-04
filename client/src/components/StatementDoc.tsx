// 거래명세서 문서 — 관리자 거래내역서 화면과 거래처 '내 거래내역서' 화면이 같은 것을 그린다.
// 인쇄 CSS(A4 한 장)까지 함께 들고 있으므로, 요소를 추가하면 인쇄 미리보기를 다시 확인할 것.
import { won, fmtDate } from "@/lib/format";

export interface TransactionOrder {
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

export interface TransactionPayment {
  id: number;
  paidAt: string; // YYYY-MM-DD
  amount: number;
  method: string; // transfer | cash | card | other
  memo: string;
}

export interface TransactionResult {
  customer: { id: number; businessName: string; managerName: string; phone: string; bizRegNo: string; address: string };
  startDate: string;
  endDate: string;
  orders: TransactionOrder[];
  payments: TransactionPayment[];
  openingBalance?: number; // 서버가 예전 버전이면 아예 안 올 수 있다
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

export const PAY_METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

// 공급자(니트커피) 고정 정보 — 거래명세서 상단 공급자란
export const SELLER = {
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


export function printStatement(result: TransactionResult | undefined) {

    // 인쇄/PDF 저장 시 기본 파일명 = 문서 제목. 인쇄 직전에 바꿨다가 끝나면 원복.
    const prevTitle = document.title;
    if (result) {
      const s = result.startDate.replace(/-/g, "");
      const e = result.endDate.replace(/-/g, "");
      // 파일명에 쓸 수 없는 문자 제거
      const name = (result.customer.businessName || "거래처").replace(/[\\/:*?"<>|]/g, "").trim();
      document.title = `거래명세서_${name}_${s}-${e}`;
    }
    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    // afterprint 미발생 브라우저 대비 안전장치
    setTimeout(restore, 3000);
    window.print();
  
}

export function StatementDoc({ result }: { result: TransactionResult }) {

            const supplyTotal = result.orders.reduce((s, o) => s + o.supplyAmount, 0);
            const vatTotal = result.orders.reduce((s, o) => s + o.vat, 0);
            // 서버가 전월 이월을 안 보내는 경우(구버전 배포)에도 화면이 NaN으로 깨지지 않게 한다.
            // 다만 그 상태의 잔액은 '조회 기간분'일 뿐이므로 관리자에게만 따로 알려준다.
            const hasOpening = Number.isFinite(result.openingBalance as number);
            const opening = hasOpening ? (result.openingBalance as number) : 0;
            const balance = hasOpening ? result.unpaidAmount : result.totalAmount - result.paidAmount;
            return (
          <>
          {!hasOpening && (
            <div className="no-print mx-auto mb-3 max-w-3xl border border-amber-400/60 bg-amber-50/60 px-4 py-3 text-xs leading-relaxed text-amber-900 break-keep dark:bg-amber-950/20 dark:text-amber-200" data-testid="notice-opening-missing">
              서버가 아직 <strong>전월 이월</strong>을 보내지 않고 있습니다. 지금 보이는 미수 잔액은 조회 기간 안의 거래만 계산한 값이라,
              지난달 채무를 이번 달에 입금한 경우 실제보다 적게 나옵니다. <strong>server/storage.ts</strong>를 배포하면 정상 표시됩니다.
            </div>
          )}
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
            <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
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
            {/* 결제 요약 — 왼쪽에 계산 과정, 오른쪽에 결론.
                받는 사람이 가장 먼저 알고 싶은 건 '그래서 얼마를 보내야 하나'다. */}
            <div className="txn-summary mt-5 grid grid-cols-1 border border-border sm:grid-cols-[1fr_auto]">
              <div className="divide-y divide-border">
                <SumRow label="전월 이월" value={hasOpening ? won(opening) : "—"} />
                <SumRow label="당월 거래" value={`+ ${won(result.totalAmount)}`} />
                <SumRow label="입금액" value={`− ${won(result.paidAmount)}`} />
              </div>
              {/* 결론이지만 소리치지는 않게 — 색을 반전하는 대신 크기와 여백으로만 구분한다 */}
              <div className="flex flex-col items-end justify-center gap-1.5 border-t border-border bg-muted/30 px-6 py-4 sm:min-w-[230px] sm:border-l sm:border-t-0">
                <div className="text-[11px] text-muted-foreground">
                  {balance < 0 ? "과입금액" : "미수 잔액"}
                </div>
                <div className="font-display text-xl font-semibold tabular text-foreground" data-testid="text-txn-balance">
                  {won(Math.abs(balance))}
                </div>
              </div>
            </div>

            {/* 거래 명세 테이블 */}
            <h2 className="mb-2 mt-7 text-xs font-bold text-muted-foreground">거래 명세</h2>
            <div className="table-scroll">
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
                    {result.orders.map((order, orderIdx) => {
                      // 주문 한 건이 여러 줄로 펼쳐지므로, 건이 바뀌는 지점에만 진한 선을 둔다.
                      // (예전에는 첫 줄만 날짜가 있고 구분이 없어 어디까지가 한 건인지 읽기 어려웠다)
                      const ymd = (order.ecountDate && order.ecountDate.trim())
                        ? order.ecountDate.replace(/-/g, ".")
                        : fmtDate(order.createdAt).split(" ")[0];
                      return order.parsedItems.map((item, itemIdx) => {
                        const lineVat = Math.round(item.amount * 0.1);
                        const isFirst = itemIdx === 0;
                        return (
                          <tr
                            key={`${order.id}-${itemIdx}`}
                            className={isFirst && orderIdx > 0 ? "border-t border-foreground/25" : ""}
                          >
                            <td className="whitespace-nowrap px-2 py-2 align-top text-xs text-muted-foreground">
                              {isFirst && (
                                <>
                                  <span className="tabular text-foreground">{ymd.slice(5)}</span>
                                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">{order.orderNo.slice(-4)}</span>
                                </>
                              )}
                            </td>
                            <td className="px-2 py-2 text-xs text-foreground">{item.name}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-foreground">{item.qty}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{won(item.unitPrice)}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-foreground">{won(item.amount)}</td>
                            <td className="px-2 py-2 text-right text-xs tabular text-muted-foreground">{won(lineVat)}</td>
                            <td className="px-2 py-2 text-right text-xs font-medium tabular text-foreground">{won(item.amount + lineVat)}</td>
                          </tr>
                        );
                      });
                    })}
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
            <div className="mt-7">
              <h2 className="mb-2 text-xs font-bold text-muted-foreground">입금 내역</h2>
              {(!result.payments || result.payments.length === 0) ? (
                <div className="border border-border py-6 text-center text-xs text-muted-foreground">
                  해당 기간에 입금 내역이 없습니다.
                </div>
              ) : (
                <div className="table-scroll">
                <table className="w-full min-w-[520px] border-collapse text-sm">
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
                </div>
              )}
            </div>

            {/* 입금계좌 안내 */}
            <div className="txn-account mt-5 border border-border bg-muted/20 px-3 py-2.5 text-[11px] text-foreground">
              <span className="font-semibold">입금계좌</span> · {SELLER.bankName} {SELLER.bankAccount} (예금주 : {SELLER.bankHolder})
            </div>

            {/* 확인 문구 + 발행 */}
            <div className="txn-foot mt-6 flex flex-col items-center gap-1 text-center">
              <p className="text-xs text-muted-foreground">위와 같이 거래하였음을 확인합니다.</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{todayStr()}</p>
              <p className="text-sm font-bold text-foreground">{SELLER.name}</p>
            </div>
          </div>
          </>
            );
          
}

export function StatementPrintStyle() {
  return (
    <>
      {/* 인쇄 전용 레이아웃 보정 — 거래명세서(A4) */}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .txn-doc {
            max-width: none !important; border: 1px solid #333 !important;
            padding: 7mm !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          /* A4 한 장에 담기게 세로 간격을 조인다 — 마지막 확인 문구만 2페이지로 넘어가면 보기 흉하다 */
          .txn-doc h2 { margin-top: 10px !important; margin-bottom: 4px !important; }
          .txn-doc .txn-summary { margin-top: 10px !important; }
          .txn-doc .txn-summary > div > div { padding-top: 5px !important; padding-bottom: 5px !important; }
          .txn-doc .txn-account { margin-top: 10px !important; padding-top: 5px !important; padding-bottom: 5px !important; }
          .txn-doc .txn-foot { margin-top: 12px !important; break-inside: avoid; page-break-inside: avoid; }
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
          /* 결제 요약: 계산과정 + 잔액 2단 유지 */
          .txn-doc .txn-summary {
            display: grid !important;
            grid-template-columns: 1fr auto !important;
          }
          .txn-doc .txn-summary > :last-child {
            border-left: 1px solid #ddd !important; border-top: 0 !important;
            /* 화면용 min-width(230px)를 그대로 두면 인쇄 폭을 넘겨 문서 테두리 밖으로 삐져나간다 */
            min-width: 180px !important; padding-left: 14px !important; padding-right: 14px !important;
          }
        }
      `}</style>
    </>
  );
}

// 공급자/공급받는자 정보 박스
function PartyBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex h-full flex-col border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-bold text-foreground">{title}</div>
      <div className="flex flex-1 flex-col divide-y divide-border/60">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-1 items-stretch text-[11px]">
            {/* 라벨은 줄바꿈 금지 — '대표 / 담당'이 '대표 / 담 / 당'으로 깨지던 문제 */}
            <div className="w-[88px] shrink-0 whitespace-nowrap bg-muted/20 px-2.5 py-1.5 font-medium text-muted-foreground">{k}</div>
            <div className="flex-1 break-keep px-2.5 py-1.5 text-foreground">{v || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 결제 요약 한 줄 (전월 이월 / 당월 거래 / 입금)
function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-sm font-medium tabular text-foreground">{value}</span>
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
