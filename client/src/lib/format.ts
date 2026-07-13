export function won(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

export function wonNum(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n);
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${fmtDate(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

// 기본(시드) 카테고리 라벨. 관리자가 카테고리를 추가/수정하면 서버(/api/product-categories)가
// 원본이며, 이 상수는 정적 폴백으로 사용된다. (인보이스·주문 스냅샷 등 정적 표시용)
export const CATEGORY_LABEL: Record<string, string> = {
  blend: "블렌드",
  decaf: "디카페인",
  single: "싱글 오리진",
  single_espresso: "싱글 오리진 에스프레소",
  single_filter: "싱글 오리진 필터",
  dripbag: "드립백",
};

export const CATEGORY_COLOR: Record<string, string> = {
  // 본 사이트는 흑백. 카테고리 칩도 회색 톤으로 통일.
  blend: "0 0% 13%",           // 검정에 가까운
  decaf: "0 0% 47%",           // 중간 회색
  single: "0 0% 33%",          // 진한 회색
  single_espresso: "0 0% 27%",
  single_filter: "0 0% 40%",
  dripbag: "0 0% 55%",
};

export const PAYMENT_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  card: "카드",
  deferred: "후지급",
};

export function errMsg(err: any): string {
  const raw = String(err?.message ?? err ?? "오류가 발생했습니다.");
  const stripped = raw.replace(/^\d+:\s*/, "");
  try {
    const obj = JSON.parse(stripped);
    if (obj && obj.message) return obj.message;
  } catch {}
  return stripped;
}
