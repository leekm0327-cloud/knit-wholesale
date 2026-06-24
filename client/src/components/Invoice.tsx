import { KnitMark } from "./Logo";
import { won, wonNum, weightLabel, fmtDate, CATEGORY_LABEL, PAYMENT_LABEL } from "@/lib/format";
import type { Order, OrderItem } from "@shared/schema";

const SUPPLIER = {
  name: "니트커피 (Knit Coffee)",
  note: "클라리멘토(Clarimento) OEM 로스팅",
  ceo: "이강민",
  address: "서울 중구 남산트라팰리스 1층",
  instagram: "@knitcoffee_official",
};

const BANK = {
  name: "우리은행",
  account: "1005-XXX-XXXXXX",
  holder: "니트커피 이강민",
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
    <div className="print-card mx-auto w-full max-w-3xl rounded-xl border bg-white p-7 text-[#2b211a] shadow-sm sm:p-10">
      {/* 헤더 */}
      <div className="flex items-start justify-between border-b border-[#e4d9cc] pb-6">
        <div className="flex items-center gap-3">
          <KnitMark size={42} className="text-[#c8693f]" />
          <div>
            <div className="font-display text-xl font-semibold tracking-tight text-[#2b211a]">
              Knit Coffee Wholesale
            </div>
            <div className="text-xs text-[#8a7a6a]">니트커피 도매 거래명세서</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-lg font-semibold uppercase tracking-wide text-[#c8693f]">
            Invoice
          </div>
          <div className="mt-1 text-xs text-[#6b5d4f]">거래명세서</div>
        </div>
      </div>

      {/* 발행 정보 */}
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <InfoRow label="발행일" value={fmtDate(order.createdAt)} />
        <InfoRow label="주문번호" value={order.orderNo} mono />
        <InfoRow label="결제방식" value={PAYMENT_LABEL[snap.paymentMethod] ?? snap.paymentMethod} />
        <InfoRow label="희망 납품일" value={order.desiredDate || "-"} />
        <InfoRow
          label="처리상태"
          value={order.status === "done" ? "처리완료" : "접수됨"}
        />
        {order.trackingNo ? <InfoRow label="송장번호" value={order.trackingNo} mono /> : <div />}
      </div>

      {/* 공급자 / 거래처 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Party title="공급자">
          <PartyLine label="상호" value={SUPPLIER.name} />
          <PartyLine label="대표" value={SUPPLIER.ceo} />
          <PartyLine label="주소" value={SUPPLIER.address} />
          <PartyLine label="비고" value={SUPPLIER.note} />
          <PartyLine label="인스타" value={SUPPLIER.instagram} />
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
      <div className="mt-6 overflow-hidden rounded-lg border border-[#e4d9cc]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#f4ece1] text-[#6b5d4f]">
              <th className="px-3 py-2.5 text-left font-semibold">품목</th>
              <th className="px-2 py-2.5 text-center font-semibold">중량</th>
              <th className="px-2 py-2.5 text-right font-semibold">수량</th>
              <th className="px-2 py-2.5 text-right font-semibold">단가</th>
              <th className="px-3 py-2.5 text-right font-semibold">금액</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-[#efe6da]" data-testid={`invoice-row-${idx}`}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-[#2b211a]">{it.name}</div>
                  <div className="text-[11px] text-[#8a7a6a]">{CATEGORY_LABEL[it.category]}</div>
                </td>
                <td className="px-2 py-2.5 text-center text-[#4a3d31]">{weightLabel(it.weight)}</td>
                <td className="px-2 py-2.5 text-right tabular text-[#4a3d31]">{it.qty}</td>
                <td className="px-2 py-2.5 text-right tabular text-[#4a3d31]">{wonNum(it.unitPrice)}</td>
                <td className="px-3 py-2.5 text-right tabular font-medium text-[#2b211a]">{wonNum(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 합계 */}
      <div className="mt-5 flex justify-end">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-[#6b5d4f]">
            <span>공급가액</span>
            <span className="tabular">{won(order.supplyAmount)}</span>
          </div>
          <div className="flex justify-between text-[#6b5d4f]">
            <span>부가세 (10%)</span>
            <span className="tabular">{won(order.vat)}</span>
          </div>
          <div className="flex justify-between border-t border-[#e4d9cc] pt-2 text-base font-semibold text-[#2b211a]">
            <span>합계 금액</span>
            <span className="tabular text-[#c8693f]" data-testid="invoice-total">{won(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* 입금 계좌 */}
      <div className="mt-6 rounded-lg border border-[#e4d9cc] bg-[#faf5ee] p-4">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#c8693f]">
          입금 계좌
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-[#2b211a]">
          <span className="font-semibold">{BANK.name}</span>
          <span className="font-display tabular text-base font-semibold tracking-wide">{BANK.account}</span>
          <span className="text-[#6b5d4f]">예금주 {BANK.holder}</span>
        </div>
        <p className="mt-2 text-[11px] text-[#8a7a6a]">
          입금 시 상호명을 함께 기재해 주시면 확인이 빠릅니다. 세금계산서는 {snap.taxEmail || "등록된 이메일"}로 발행됩니다.
        </p>
      </div>

      {/* 요청사항 */}
      {order.note && (
        <div className="mt-4 rounded-lg border border-[#e4d9cc] p-4">
          <div className="mb-1 text-xs font-semibold text-[#6b5d4f]">요청사항</div>
          <p className="whitespace-pre-wrap text-sm text-[#2b211a]">{order.note}</p>
        </div>
      )}

      {/* 푸터 */}
      <div className="mt-7 border-t border-[#e4d9cc] pt-4 text-center text-[11px] text-[#8a7a6a]">
        본 거래명세서는 니트커피 도매 주문 시스템에서 자동 발행되었습니다 · {SUPPLIER.instagram}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#8a7a6a]">{label}</div>
      <div className={`mt-0.5 font-medium text-[#2b211a] ${mono ? "tabular" : ""}`}>{value}</div>
    </div>
  );
}

function Party({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#e4d9cc] p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#c8693f]">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PartyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[13px] leading-relaxed">
      <span className="w-16 shrink-0 text-[#8a7a6a]">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[#2b211a]">{value}</span>
    </div>
  );
}
