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

export const CATEGORY_LABEL: Record<string, string> = {
  blend: "블렌드",
  decaf: "디카페인",
  single: "싱글 오리진",
};

export const CATEGORY_COLOR: Record<string, string> = {
  // 본 사이트는 흑백. 카테고리 칩도 회색 톤으로 통일.
  blend: "0 0% 13%",   // 검정에 가까운
  decaf: "0 0% 47%",   // 중간 회색
  single: "0 0% 33%",  // 진한 회색
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
