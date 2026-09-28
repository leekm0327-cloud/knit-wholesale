import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { BankCustomerSuggestion } from '@shared/bank-customer-suggestion';

type Row = { id: number; deposit: number; withdraw: number; state: string; targetId: number | null; memo: string; posted: number; customerSuggestion?: BankCustomerSuggestion | null };
type Props = {
  row: Row; live: boolean;
  customers: { id: number; name: string }[];
  categories: { name: string; sector: string }[];
  onChange: () => Promise<unknown>;
  onDetails: () => void;
  detailsOpen?: boolean;
  detailsId?: string;
};

export default function BankQuickActions({ row, live, customers, categories, onChange, onDetails, detailsOpen, detailsId }: Props) {
  // Derive untouched defaults from fresh history; never replace a user's manual choice.
  const [manualChoice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false), base = live ? '/api/admin/bank-live' : '/api/admin/bank-review';
  const expense = row.withdraw > 0;
  const singleDirection = (row.deposit > 0) !== (row.withdraw > 0);
  const allowed = !row.posted && ['pending', 'customer'].includes(row.state) && singleDirection;
  const suggestion = allowed && !expense && row.state === 'pending' ? row.customerSuggestion : null;
  const recommended = suggestion?.kind === 'customer' && customers.some(c => c.id === suggestion.customerId) ? suggestion : null;
  const choice = manualChoice ?? (row.state === 'customer' ? String(row.targetId || '') : recommended ? String(recommended.customerId) : '');
  const selected = expense ? categories.find(x => x.name === choice) : customers.find(x => String(x.id) === choice);
  const run = async (fn: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await fn(); await onChange(); }
    catch (e: any) {
      let message = e.message || '처리하지 못했습니다.';
      try {
        const body = JSON.parse(message.replace(/^\d{3}:\s*/, ''));
        if (typeof body.message === 'string') message = body.message;
      } catch { /* Network errors can already be plain text. */ }
      setError(message);
    }
    finally { locked.current = false; setBusy(false); }
  };
  const post = () => run(() => apiRequest('POST', `${base}/${row.id}/posting`, {
    kind: expense ? 'expense' : 'payment',
    ...(expense ? { category: choice, sector: categories.find(x => x.name === choice)?.sector } : { customerId: Number(choice) }),
    memo: row.memo, confirmProduction: live,
  }));
  return <div className="bank-quick-actions">
    {allowed && <div className="bank-quick-line">
      <select aria-label={expense ? '바로 반영할 비용 항목' : '바로 반영할 거래처'} disabled={busy} value={choice} onChange={e => setChoice(e.target.value)}>
        <option value="">{expense ? '비용 항목 선택' : '거래처 선택'}</option>
        {expense ? categories.map(x => <option key={x.name} value={x.name}>{x.name}</option>) : customers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button className="bank-quick-primary" disabled={busy || !selected} onClick={post}>
        {busy ? '처리 중…' : `${live ? '' : '테스트 '}${expense ? '비용' : '수금'} 반영`}
      </button>
    </div>}
    {recommended && <p className="bank-customer-hint">추천 · {recommended.name} <span>(이전 수금 {recommended.count}건)</span></p>}
    {suggestion?.kind === 'ambiguous' && <p className="bank-customer-hint is-ambiguous">이전 연결이 서로 달라요. 거래처를 직접 선택해 주세요.</p>}
    <div className="bank-quick-tools">
      {!row.posted && singleDirection && (!expense || allowed) && <details className="bank-quick-options">
        <summary>{expense ? '카드대금 분류' : '정산 입금 분류'}</summary>
        {expense ? <button className="bank-quick-secondary" disabled={busy} onClick={() => run(() => apiRequest('PATCH', `${base}/${row.id}`, { state: 'card', targetId: null, memo: row.memo }))}>
          카드대금 출금으로 분류
        </button> : <select aria-label="정산 입금 분류" disabled={busy} value={['settlement', 'online', 'delivery'].includes(row.state) ? row.state : ''} onChange={e => {
          const state = e.target.value;
          if (state) run(() => apiRequest('PATCH', `${base}/${row.id}`, { state, targetId: null, memo: row.memo }));
        }}>
          <option value="">정산 종류 선택</option><option value="settlement">매장 정산</option><option value="online">온라인 정산</option><option value="delivery">배달 정산</option>
        </select>}
      </details>}
      <button className="bank-quick-detail" disabled={busy} aria-expanded={detailsOpen} aria-controls={detailsOpen ? detailsId : undefined} onClick={onDetails}>
        {detailsOpen ? '상세 닫기' : row.posted ? '반영 내역 · 취소' : row.state === 'online' ? '매출 연결' : '상세 처리'}
      </button>
    </div>
    {error && <p role="alert" className="bank-action-error">{error}</p>}
  </div>;
}
