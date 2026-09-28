import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { won } from '@/lib/format';
import type { CustomerBalance, Order, Payment } from '@shared/schema';
import type { OrderInvoiceSummary } from '@shared/order-summary';

const invoiceLabels: Record<string, string> = {
  unissued: '미발행', draft: '발행 준비', issued: '발행 완료', sending: '발행 중 · 확인 필요',
  unknown: '확인 필요', rejected: '발행 실패', changed: '주문 변경 · 확인 필요',
  external: '기존 발행 기록', cancelled: '발행 취소', discarded: '작성 취소',
};
const ineligibleLabels = {
  cancelled: '취소된 주문', sample: '샘플 주문', internal: '매장 내부 주문',
  nonpositive: '발행 대상 아님', pending: '주문 처리 후 발행 가능',
};
const actionStyle = 'inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';

export function OrderProgressSummary({ order }: { order: Order }) {
  const { user } = useAuth();
  const owner = user?.adminRole === 'owner';
  const ledger = useQuery<{ balance: CustomerBalance; payments: Payment[] }>({
    queryKey: ['/api/admin/customers', order.customerId, 'ledger'],
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
  });
  const invoice = useQuery<OrderInvoiceSummary>({
    queryKey: ['/api/admin/tax-invoices/production/orders', String(order.id), 'summary'],
    enabled: owner, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
  });
  const previousOrder = useRef(order);
  const { refetch: refreshLedger } = ledger;
  const { refetch: refreshInvoice } = invoice;
  useEffect(() => {
    if (previousOrder.current !== order) {
      previousOrder.current = order;
      void refreshLedger();
      if (owner) void refreshInvoice();
    }
  }, [order, owner, refreshLedger, refreshInvoice]);

  const balance = ledger.data?.balance;
  const payment = ledger.data?.payments[0];
  const tax = invoice.data;
  const taxLabel = tax?.state === 'not_applicable'
    ? ineligibleLabels[tax.reason ?? 'pending']
    : invoiceLabels[tax?.state ?? ''] ?? '확인 필요';
  const invoiceUrl = `?environment=production&order=${order.id}${tax?.draftId ? `&document=${encodeURIComponent(tax.draftId)}` : ''}#/admin/tax-invoices`;

  return <section aria-label="주문 요약" className="no-print mb-5 border bg-card">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <h2 className="text-sm font-semibold">주문 한눈에 보기</h2>
      <span className="text-xs text-muted-foreground">{order.orderNo}</span>
    </div>
    <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <div className="flex min-w-0 flex-col items-start gap-2 p-4">
        <h3 className="text-xs text-muted-foreground">주문 처리</h3>
        <p className="text-base font-semibold">{order.status === 'cancelled' ? '취소됨' : order.status === 'done' ? '처리 완료' : '처리 대기'}</p>
        <p className="text-xs text-muted-foreground">주문 금액 {won(order.totalAmount)}</p>
        <button className={`${actionStyle} mt-auto pt-2`} onClick={() => {
          const panel = document.getElementById('order-management');
          panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          panel?.focus({ preventScroll: true });
        }}>주문 관리 <ArrowUpRight className="h-3 w-3" /></button>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2 p-4">
        <h3 className="text-xs text-muted-foreground">거래처 전체 잔액</h3>
        {ledger.isError ? <p role="alert" className="text-sm">잔액을 불러오지 못했어요. <button className="underline" onClick={() => refreshLedger()}>다시 시도</button></p>
          : !balance ? <p className="text-sm text-muted-foreground">불러오는 중…</p>
          : <>
            <p className="text-base font-semibold">{balance.balance > 0 ? `미수금 ${won(balance.balance)}` : balance.balance < 0 ? `선수금 ${won(-balance.balance)}` : '잔액 없음'}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{payment ? `최근 입금 ${payment.paidAt} · ${won(payment.amount)}` : '등록된 입금 내역 없음'}</p>
          </>}
        <a className={`${actionStyle} mt-auto pt-2`} href={`#/admin/customers/${order.customerId}/ledger`}>입금·거래 원장 <ArrowUpRight className="h-3 w-3" /></a>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2 p-4">
        <h3 className="text-xs text-muted-foreground">이 주문 세금계산서</h3>
        {!owner ? <p className="text-sm text-muted-foreground">대표 계정에서 확인할 수 있어요.</p>
          : invoice.isError ? <p role="alert" className="text-sm">발행 상태를 불러오지 못했어요. <button className="underline" onClick={() => refreshInvoice()}>다시 시도</button></p>
          : !tax ? <p className="text-sm text-muted-foreground">불러오는 중…</p>
          : <>
            <p className="text-base font-semibold">{taxLabel}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{tax.draftId ? '이 주문에 연결된 운영 발행 기록' : tax.eligible ? '기존 발행 여부 확인 후 진행하세요.' : tax.reason === 'nonpositive' ? '합계가 0원 이하인 주문이에요.' : '처리 완료된 유상 외부 주문 기준'}</p>
            {(tax.draftId || tax.eligible) && <a className={`${actionStyle} mt-auto pt-2`} href={invoiceUrl}>{tax.draftId ? '연결된 문서 보기' : '세금계산서 준비'} <ArrowUpRight className="h-3 w-3" /></a>}
          </>}
      </div>
    </div>
    <p className="border-t px-4 py-2 text-xs leading-relaxed text-muted-foreground">잔액은 거래처의 모든 주문과 입금을 합산한 금액이에요.</p>
  </section>;
}
