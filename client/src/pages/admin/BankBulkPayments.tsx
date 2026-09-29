import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { BankBulkRow, BankBulkResult } from '@shared/bank-bulk-payments';

type Props = { ids: number[]; live: boolean; onChange: () => Promise<unknown>; onClose: () => void; onReview: (id: number) => void };
const money = (amount: number) => amount.toLocaleString('ko-KR');
function messageOf(error: any) {
  const message = error?.message || '연결 상태를 확인해 주세요.';
  try { return JSON.parse(message.replace(/^\d{3}:\s*/, '')).message || message; } catch { return message; }
}

export default function BankBulkPayments({ ids, live, onChange, onClose, onReview }: Props) {
  const base = live ? '/api/admin/bank-live' : '/api/admin/bank-review';
  const [rows, setRows] = useState<BankBulkRow[]>([]), [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const [results, setResults] = useState<BankBulkResult[]>([]);
  const locked = useRef(false);
  const load = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setLoaded(false); setSelected([]); setError(''); setResults([]);
    try {
      const response = await apiRequest('POST', base + '/payments/preview', { ids });
      setRows((await response.json()).rows); setLoaded(true);
    } catch (e) { setError(messageOf(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  useEffect(() => { void load(); }, [base, ids]);
  const ready = rows.filter(r => r.status === 'ready');
  const picked = ready.filter(r => selected.includes(r.id));
  const total = picked.reduce((sum, row) => sum + row.amount, 0);
  const post = async () => {
    if (locked.current || !picked.length) return;
    locked.current = true; setBusy(true); setError('');
    let received = false;
    try {
      const response = await apiRequest('POST', base + '/payments/bulk', {
        items: picked.map(({ id, customerId, snapshot }) => ({ id, customerId, snapshot })), confirmProduction: live,
      });
      const { results: outcome } = await response.json() as { results: BankBulkResult[] };
      received = true; setResults(outcome); setSelected([]);
      setRows(previous => previous.map(row => {
        const result = outcome.find(r => r.id === row.id);
        return result ? { ...row, status: result.status === 'review' ? 'review' : 'done', reason: result.message } : row;
      }));
      await onChange();
    } catch (e) {
      // The server may have committed before a connection was lost. Reload before another submission.
      if (!received) { setLoaded(false); setSelected([]); }
      setError(received ? '처리 결과는 아래와 같습니다. 통장 목록 새로고침에 실패했으니 다시 확인해 주세요.'
        : `결과를 확인하지 못했습니다. 목록 새로 확인으로 반영 여부를 확인해 주세요. ${messageOf(e)}`);
    } finally { locked.current = false; setBusy(false); }
  };
  return <section className="bank-bulk" aria-labelledby="bank-bulk-title" aria-busy={busy}>
    <div className="bank-bulk-heading"><div><h2 id="bank-bulk-title">추천 입금 모아 반영</h2>
      <p>거래처와 금액을 확인하고 반영할 입금만 선택해 주세요.</p></div>
      <button type="button" disabled={busy} onClick={onClose}>개별 처리로 돌아가기</button></div>
    <div className="bank-bulk-toolbar">
      <label><input type="checkbox" aria-label="반영 가능한 입금 모두 선택" disabled={busy || !loaded || !ready.length}
        checked={ready.length > 0 && picked.length === ready.length} onChange={e => setSelected(e.target.checked ? ready.map(r => r.id) : [])} /> 반영 가능 {ready.length}건 선택</label>
      <button type="button" disabled={busy} onClick={load}>목록 새로 확인</button>
    </div>
    {error && <p role="alert" className="bank-action-error">{error}</p>}
    {results.length > 0 && <p role="status" className="bank-bulk-result">처리 결과 · 완료 {results.filter(r => r.status === 'posted').length}건
      {' · '}이미 반영 {results.filter(r => r.status === 'already').length}건 · 확인 필요 {results.filter(r => r.status === 'review').length}건</p>}
    {!loaded && <p role="status">{busy ? '최신 내역과 중복 여부를 확인하고 있습니다…' : '목록을 새로 확인한 뒤 선택해 주세요.'}</p>}
    {loaded && <>
      <ul className="bank-bulk-list">{rows.map(row => <li key={row.id} data-bank-bulk-id={row.id} className={`bank-bulk-item is-${row.status}`}>
        <label className="bank-bulk-check"><input type="checkbox" aria-label={`${row.remark} ${money(row.amount)}원 선택`}
          disabled={busy || row.status !== 'ready'} checked={selected.includes(row.id)} onChange={e => setSelected(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />
          <span><small>{row.at ? `${row.at.slice(0, 4)}-${row.at.slice(4, 6)}-${row.at.slice(6, 8)} ${row.at.slice(8, 10)}:${row.at.slice(10, 12)}` : '일시 확인 필요'} · {row.account}</small>
            <strong>{row.remark || '적요 없음'}</strong></span></label>
        <div className="bank-bulk-customer"><span>{row.customerName ? `→ ${row.customerName}` : '거래처 확인 필요'}</span>
          <small>{row.status === 'ready' ? '추천 거래처' : row.status === 'done' ? '반영 완료' : '확인 필요'}</small></div>
        <strong className="bank-bulk-amount">{money(row.amount)}원</strong>
        {row.reason && <p className="bank-bulk-reason">{row.reason}</p>}
        {row.status === 'review' && <button className="bank-bulk-review" disabled={busy} onClick={() => onReview(row.id)}>개별 확인</button>}
      </li>)}</ul>
      <div className="bank-bulk-footer"><div><strong>선택 {picked.length}건 · {money(total)}원</strong>
        <p>{live ? '선택한 금액을 각 거래처의 수금으로 기록합니다.' : '예시 반영은 테스트 장부에만 기록합니다.'}</p></div>
        <button className="bank-quick-primary" disabled={busy || !picked.length} onClick={post}>
          {busy ? '처리 중…' : `${live ? '' : '테스트 '}선택한 ${picked.length}건 수금 반영`}</button></div>
    </>}
  </section>;
}
