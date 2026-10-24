import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { won } from "@/lib/format";
import type { confirmCustomerOrder } from "../../../server/order-confirmation";

export type OrderQuote = ReturnType<typeof confirmCustomerOrder>["quote"];

export function OrderConfirmation({ quote, loading, onBack, onConfirm, onRecheck, onAccount }: {
  quote: OrderQuote; loading: boolean; onBack: () => void; onConfirm: () => void;
  onRecheck: () => void; onAccount: () => void;
}) {
  return <div className="grid grid-cols-1 gap-6 break-keep lg:grid-cols-[1fr_320px]" data-testid="order-confirmation">
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-2 text-sm font-medium">이번 주문 상품</h2>
        {quote.items.map(i => <div key={i.productId} className="flex items-center justify-between gap-4 border-b border-border py-5 last:border-b-0">
          <div className="min-w-0">
            <h3 className="text-[18px] font-medium">{i.name}</h3>
            <p className="mt-2 text-xs text-muted-foreground">단가 {won(i.unitPrice)} · 공급가 {won(i.amount)}</p>
          </div>
          <span className="shrink-0 font-ui text-[21px] font-medium tabular-nums">{i.qty} EA</span>
        </div>)}
        <div className="flex justify-between pt-4 text-sm"><span>이번 주문 수량</span><span>{quote.items.reduce((s,i)=>s+i.qty,0)} EA</span></div>
      </Card>
      <Card className="space-y-5 p-5 text-sm sm:p-6">
        <div><h2 className="mb-2 font-medium">배송지</h2><p>{quote.delivery.businessName}</p><p className="mt-1 text-muted-foreground">{quote.delivery.defaultAddress || "등록된 배송지가 없습니다."}</p>
          <button className="mt-2 underline underline-offset-4" onClick={onAccount}>내 정보에서 수정</button></div>
        <div><h2 className="mb-2 font-medium">연락처</h2><p className="text-muted-foreground">{quote.delivery.managerName} · {quote.delivery.phone || "연락처 미등록"}</p></div>
        <div><h2 className="mb-2 font-medium">요청사항</h2><p className="whitespace-pre-wrap text-muted-foreground">{quote.note || "없음"}</p></div>
        {quote.quickRequest === 1 && <p>퀵 요청 · 비용 착불</p>}
      </Card>
      <button className="text-sm underline underline-offset-4" onClick={onBack} disabled={loading}>장바구니 수정</button>
    </div>
    <div><Card className="space-y-5 p-5 lg:sticky lg:top-24">
      <h2 className="font-display text-lg font-semibold">주문 요약</h2>
      {quote.mergeOrderNo && <div className="space-y-3 border-b border-border pb-4 text-xs text-muted-foreground">
        <p>오늘 접수 중인 {quote.mergeOrderNo}에 합쳐집니다. 아래 금액은 기존 주문을 포함한 최종 금액입니다.</p>
        {quote.existingItems.map((i, n) => <div className="flex justify-between gap-2" key={n}><span>기존 · {i.productName ?? i.name}</span><span className="shrink-0">{i.qty} EA · {won(i.amount)}</span></div>)}
      </div>}
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between"><dt>총수량{quote.mergeOrderNo ? " (기존 포함)" : ""}</dt><dd>{quote.totalQty} EA</dd></div>
        {quote.discountAmount > 0 && <div className="flex justify-between"><dt>기존 할인</dt><dd>−{won(quote.discountAmount)}</dd></div>}
        <div className="flex justify-between"><dt>공급가액</dt><dd>{won(quote.supplyAmount)}</dd></div>
        <div className="flex justify-between"><dt>부가세 (10%)</dt><dd>{won(quote.vat)}</dd></div>
        <div className="flex justify-between border-t border-border pt-4 text-base font-semibold"><dt>최종 금액</dt><dd data-testid="confirmation-total">{won(quote.totalAmount)}</dd></div>
      </dl>
      {quote.missingAddress && <p role="alert" className="text-sm text-destructive">배송지를 등록한 후 주문할 수 있습니다. 내 정보에서 수정해 주세요.</p>}
      {quote.priceChanges.length > 0 && <div role="alert" className="space-y-3 text-sm">
        <p>{quote.priceChanges.join(", ")}의 가격이 변경되었습니다. 표시된 최신 단가와 최종 금액을 다시 확인해 주세요.</p>
        <Button variant="outline" className="w-full" onClick={onRecheck} disabled={loading}>변경된 주문 다시 확인</Button>
      </div>}
      <div className="flex justify-center"><Button className="flex min-h-12 w-full items-center justify-center rounded-none text-center font-ui" size="lg" onClick={onConfirm}
        disabled={loading || quote.missingAddress || quote.priceChanges.length > 0} aria-busy={loading} data-testid="button-confirm-order">CONFIRM ORDER</Button></div>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">주문 확정 후 거래명세서와 입금 계좌가 안내됩니다.</p>
    </Card></div>
  </div>;
}
