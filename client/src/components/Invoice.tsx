import { Wordmark } from "./Logo";
import { won, wonNum, fmtDate, CATEGORY_LABEL } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";

const SUPPLIER = {
  name: "니트커피 (Knit Coffee)",
  ceo: "이강민",
  address: "서울 중구 남산트라팰리스 1층",
};

const BANK = {
  name: "국민은행",
  account: "098937-04-011092",
  holder: "이강민 (니트커피)",
};

interface Snapshot {
  businessName: string;
  managerName: string;
  phone: string;
  bizRegNo: string;
  taxEmail: string;
  defaultAddress: string;
  paymentMethod: string;
}

// 화면 + 인쇄 공용 거래명세서 뷰. 부모가 .print-area 로 감싸서 인쇄.
export function Invoice({ order }: { order: Order }) {
  const items: OrderItem[] = JSON.parse(order.items);
  const snap: Snapshot = JSON.parse(order.customerSnapshot);

  return (
    <div className="print-card mx-auto w-full max-w-3xl rounded-none border bg-white p-7 text-[#222] sm:p-10">
      {/* 헤더 */}
      <div className="flex items-start justify-between border-b border-[#e5e5e5] pb-6">
        <Wordmark size={32} />
        <div className="text-right">
          <div className="font-display text-lg font-semibold uppercase tracking-wide text-[#222]">
            Invoice
          </div>
          <div className="mt-1 text-xs text-[#777]">거래명세서</div>
        </div>
      </div>

      {/* 발행 정보 — 관리자가 지정한 주문 일자(ecountDate)가 있으면 그 날짜, 없으면 생성일 */}
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <InfoRow
          label="발행일"
          value={order.ecountDate && order.ecountDate.trim() ? order.ecountDate.replace(/-/g, ".") : fmtDate(order.createdAt)}
        />
        {order.trackingNo ? <InfoRow label="송장번호" value={order.trackingNo} mono /> : null}
      </div>

      {/* 공급자 / 거래처 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Party title="공급자">
          <PartyLine label="상호" value={SUPPLIER.name} />
          <PartyLine label="대표" value={SUPPLIER.ceo} />
          <PartyLine label="주소" value={SUPPLIER.address} />
        </Party>
        <Party title="거래처 (공급받는 자)">
          <PartyLine label="상호" value={snap.businessName} />
          <PartyLine label="담당자" value={snap.managerName} />
          <PartyLine label="연락처" value={snap.phone} />
          <PartyLine label="사업자번호" value={snap.bizRegNo || "-"} />
          <PartyLine label="배송지" value={snap.defaultAddress || "-"} />
        </Party>
      </div>

      {/* 품목표 */}
      <div className="mt-6 overflow-hidden rounded-none border border-[#e5e5e5]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#f5f5f5] text-[#777]">
              <th className="px-3 py-2.5 text-left font-semibold">품목</th>
              <th className="px-2 py-2.5 text-right font-semibold">수량</th>
              <th className="px-2 py-2.5 text-right font-semibold">단가</th>
              <th className="px-3 py-2.5 text-right font-semibold">금액</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-[#ebebeb]" data-testid={`invoice-row-${idx}`}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-[#222]">{it.name}</div>
                  <div className="text-[11px] text-[#777]">{CATEGORY_LABEL[it.category]}</div>
                </td>
                <td className="px-2 py-2.5 text-right tabular text-[#444]">{it.qty}</td>
                <td className="px-2 py-2.5 text-right tabular text-[#444]">{wonNum(it.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right tabular font-medium text-[#222]">{wonNum(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 합계 */}
      <div className="mt-5 flex justify-end">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-[#777]">
            <span>공급가액</span>
            <span className="tabular">{won(order.supplyAmount)}</span>
          </div>
          <div className="flex justify-between text-[#777]">
            <span>부가세 (10%)</span>
            <span className="tabular">{won(order.vat)}</span>
          </div>
          <div className="flex justify-between border-t border-[#e5e5e5] pt-2 text-base font-semibold text-[#222]">
            <span>합계 금액</span>
            <span className="tabular text-[#000]" data-testid="invoice-total">{won(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* 입금 계좌 */}
      <div className="mt-6 rounded-none border border-[#e5e5e5] bg-[#f5f5f5] p-4">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#222]">
          입금 계좌
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-[#222]">
          <span className="font-semibold">{BANK.name}</span>
          <span className="font-display tabular text-base font-semibold tracking-wide">{BANK.account}</span>
          <span className="text-[#777]">예금주 {BANK.holder}</span>
        </div>
      </div>

      {/* 퀵 요청 */}
      {(order as any).quickRequest === 1 && (
        <div className="mt-4 rounded-none border border-amber-300 bg-amber-50 p-4">
          <div className="mb-1 text-xs font-semibold text-amber-700">⚡ 퀵 요청</div>
          <p className="text-sm text-amber-800">퀵 서비스 요청 주문입니다. 퀵 비용은 착불로 보내드립니다.</p>
        </div>
      )}

      {/* 요청사항 */}
      {order.note && (
        <div className="mt-4 rounded-none border border-[#e5e5e5] p-4">
          <div className="mb-1 text-xs font-semibold text-[#777]">요청사항</div>
          <p className="whitespace-pre-wrap text-sm text-[#222]">{order.note}</p>
        </div>
      )}

      {/* 푸터 */}
      <div className="mt-7 border-t border-[#e5e5e5] pt-4 text-center text-[11px] text-[#777]">
        본 거래명세서는 니트커피 도매 주문 시스템에서 자동 발행되었습니다.
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#777]">{label}</div>
      <div className={`mt-0.5 font-medium text-[#222] ${mono ? "tabular" : ""}`}>{value}</div>
    </div>
  );
}

function Party({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-none border border-[#e5e5e5] p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#222]">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PartyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[13px] leading-relaxed">
      <span className="w-16 shrink-0 text-[#777]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[#222]">{value}</span>
    </div>
  );
}
