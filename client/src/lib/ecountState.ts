// ECOUNT 전표 전송 상태 — 주문(판매전표)·발주(구매전표) 공통.
//
// 세금계산서는 이카운트에 쌓인 판매전표를 근거로 월 단위 일괄 발행하므로,
// "이 건이 이카운트로 넘어갔는가"를 목록에서 바로 알 수 있어야 한다.
//
//   unsent    아직 안 보냄
//   sent      보냈고 그 뒤로 금액 변동 없음
//   changed   보낸 뒤 금액이 바뀜 (이카운트 전표는 예전 금액 그대로 남아 있음)
//   duplicate 두 번 이상 성공 전송됨 (이카운트에 전표가 여러 건 → 금액 이중 계상)

export type EcountSendKind = "unsent" | "sent" | "changed" | "duplicate";

export interface EcountSendState {
  kind: EcountSendKind;
  label: string;
  sentAtText: string; // 미전송이면 ""
}

interface SentFields {
  ecountSentAt?: number | null;
  ecountSentAmount?: number | null;
  ecountSentCount?: number | null;
  totalAmount: number;
}

export function ecountState(row: SentFields | null | undefined): EcountSendState {
  const at = row?.ecountSentAt;
  if (!row || !at) return { kind: "unsent", label: "미전송", sentAtText: "" };
  const d = new Date(at);
  const sentAtText = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const count = row.ecountSentCount ?? 1;
  if (count > 1) return { kind: "duplicate", label: `중복 ${count}회`, sentAtText };
  const sentAmount = row.ecountSentAmount;
  if (sentAmount != null && sentAmount !== row.totalAmount)
    return { kind: "changed", label: "수정됨", sentAtText };
  return { kind: "sent", label: "전송됨", sentAtText };
}

export const ECOUNT_BADGE_CLASS: Record<EcountSendKind, string> = {
  unsent: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sent: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  changed: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  duplicate: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};
