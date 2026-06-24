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
  // 색상 칩 (HSL 기반)
  blend: "25 35% 38%", // 우드브라운
  decaf: "150 25% 38%", // 차분한 그린
  single: "18 55% 50%", // 테라코타
};

export const PAYMENT_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  card: "카드",
  deferred: "후지급",
};

export const WEIGHT_OPTIONS = [200, 500, 1000];

export function weightLabel(w: number): string {
  return w >= 1000 ? `${w / 1000}kg` : `${w}g`;
}

export function parsePrices(s: string): Record<string, number> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export function errMsg(err: any): string {
  const raw = String(err?.message ?? err ?? "오류가 발생했습니다.");
  const stripped = raw.replace(/^\d+:\s*/, "");
  try {
    const obj = JSON.parse(stripped);
    if (obj && obj.message) return obj.message;
  } catch {}
  return stripped;
}
