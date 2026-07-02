// #4 관리자 주문 → 카카오톡 발주 형식 텍스트 생성
// OEM 공장(클라리멘토)에 카카오톡으로 발주 내용을 전달할 때 쓰는 형식.
// 첨부된 카톡 화면 형식을 그대로 재현:
//
// 1. {상호명}
// - 주소: {주소}
// - 연락처: {담당자명} / {전화번호}
// - 품목:
// 1) {제품명} * {수량}
// 2) {제품명} * {수량}
//
// 제품명에는 이미 중량(예: "코튼 블렌드 1kg")이 포함되어 있으므로 별도 중량 표기는 하지 않는다.
import type { Order, OrderItem } from "@shared/schema";

interface CustomerSnapshot {
  businessName?: string;
  managerName?: string;
  phone?: string;
  bizRegNo?: string;
  taxEmail?: string;
  defaultAddress?: string;
  paymentMethod?: string;
}

// 주문 하나를 카카오톡 발주 형식 문자열로 변환
export function orderToKakaoText(order: Order): string {
  let snap: CustomerSnapshot = {};
  try {
    snap = JSON.parse(order.customerSnapshot) as CustomerSnapshot;
  } catch {
    snap = {};
  }

  let items: OrderItem[] = [];
  try {
    items = JSON.parse(order.items) as OrderItem[];
  } catch {
    items = [];
  }

  const businessName = snap.businessName || "(상호명 없음)";
  const address = snap.defaultAddress || "-";
  const managerName = snap.managerName || "-";
  const phone = snap.phone || "-";

  const lines: string[] = [];
  lines.push(`1. ${businessName}`);
  lines.push(`- 주소: ${address}`);
  lines.push(`- 연락처: ${managerName} / ${phone}`);

  if (items.length === 1) {
    // 품목이 하나면 카톡 예시처럼 한 줄로 표기
    const it = items[0];
    lines.push(`- 품목: ${it.name} * ${it.qty}`);
  } else {
    lines.push(`- 품목:`);
    items.forEach((it, idx) => {
      lines.push(`${idx + 1}) ${it.name} * ${it.qty}`);
    });
  }

  return lines.join("\n");
}
