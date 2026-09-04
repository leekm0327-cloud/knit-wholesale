// 주문의 "유효 주문일자".
// 관리자가 주문 일자(ecountDate, YYYY-MM-DD)를 지정했으면 그것을, 아니면 생성 시각을 KST 날짜로 바꾼 것을 쓴다.
// 거래명세서·대시보드·재무제표·품목 집계가 모두 이 함수를 써야 세금계산서 기준 매출과 손익 매출이 어긋나지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstYmdFromTs(ts: number): string {
  return new Date(ts + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function effectiveOrderYmd(o: { createdAt: number; ecountDate?: string | null }): string {
  const d = o.ecountDate == null ? "" : String(o.ecountDate).trim();
  return d || kstYmdFromTs(o.createdAt);
}

/** YYYY-MM (월별 집계 키) */
export function effectiveOrderYm(o: { createdAt: number; ecountDate?: string | null }): string {
  return effectiveOrderYmd(o).slice(0, 7);
}
