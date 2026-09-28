import type { ReactNode } from 'react';
import type { BankCustomerSuggestion } from '@shared/bank-customer-suggestion';
import BankQuickActions from './BankQuickActions';
import './bank-transactions.css';

export const bankStateLabels: Record<string, string> = {
  pending: '미확인', customer: '거래처 입금', settlement: '매장 정산 입금',
  online: '온라인 정산 입금', delivery: '배달 정산 입금', expense: '기존 비용 연결',
  payment: '기존 수금 연결', transfer: '계좌 간 이동', card: '카드대금 출금',
  loan: '대출 관련', other: '기타',
};

export type BankRow = {
  id: number; at: string; deposit: number; withdraw: number; remark: string;
  state: string; targetId: number | null; memo: string; account: string; posted: number;
  customerSuggestion?: BankCustomerSuggestion | null;
};

type Props = {
  rows: BankRow[];
  live: boolean;
  customers: { id: number; name: string }[];
  categories: { name: string; sector: string }[];
  selectedId?: number;
  highlightedId?: number | null;
  onChange: () => Promise<unknown>;
  onDetails: (row: BankRow) => void;
  children: ReactNode;
};

const money = (value: number) => value.toLocaleString('ko-KR');
function dateTime(at: string) {
  return `${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)} ${at.slice(8, 10)}:${at.slice(10, 12)}`;
}

export default function BankTransactions({ rows, live, customers, categories, selectedId, highlightedId, onChange, onDetails, children }: Props) {
  return <div className="bank-transactions-wrap">
    <table className="bank-transactions w-full text-sm">
      <caption className="sr-only">통장 거래 내역과 장부 반영</caption>
      <thead><tr>{['일시 / 계좌', '적요', '입금', '출금', '처리 상태', '바로 처리'].map(label =>
        <th className="text-left border-b p-3" key={label}>{label}</th>
      )}</tr></thead>
      {rows.map(row => {
        const expanded = selectedId === row.id;
        const both = row.deposit > 0 && row.withdraw > 0;
        const status = row.posted ? (live ? '장부 반영 완료' : '테스트 반영 완료') : bankStateLabels[row.state] || '확인 필요';
        return <tbody key={row.id} id={`bank-task-${row.id}`} tabIndex={-1}
          className={`bank-transaction-group${highlightedId === row.id ? ' today-target' : ''}`}>
          <tr className={`bank-transaction-row${both ? ' bank-both-directions' : ''}`}>
            <td className="bank-row-date p-3 border-b whitespace-nowrap">
              <time dateTime={dateTime(row.at).replace(' ', 'T')}>{dateTime(row.at)}</time>
              <small className="bank-desktop-account block text-gray-500">{row.account}</small>
            </td>
            <td className="bank-row-remark p-3 border-b">{row.remark || '적요 없음'}</td>
            <td className={`bank-row-amount bank-deposit p-3 border-b tabular-nums${row.deposit ? '' : ' bank-zero-amount'}`}>
              <span className="bank-mobile-label">입금 </span>{row.deposit ? money(row.deposit) : '—'}<span className="bank-mobile-unit">원</span>
            </td>
            <td className={`bank-row-amount bank-withdraw p-3 border-b tabular-nums${row.withdraw ? '' : ' bank-zero-amount'}`}>
              <span className="bank-mobile-label">출금 </span>{row.withdraw ? money(row.withdraw) : '—'}<span className="bank-mobile-unit">원</span>
            </td>
            <td className="bank-row-status p-3 border-b whitespace-nowrap">
              <span className={`bank-state-badge${row.posted ? ' is-posted' : row.state === 'pending' ? ' is-pending' : ''}`}>{status}</span>
            </td>
            <td className="bank-row-actions p-3 border-b">
              <BankQuickActions key={`${row.id}-${row.state}-${row.targetId}-${row.posted}`} row={row} live={live}
                customers={customers} categories={categories} onChange={onChange} onDetails={() => onDetails(row)}
                detailsOpen={expanded} detailsId={`bank-detail-${row.id}`} />
              <details className="bank-row-metadata">
                <summary>계좌·메모</summary>
                <dl><dt>계좌</dt><dd>{row.account}</dd><dt>메모</dt><dd>{row.memo || '등록된 메모 없음'}</dd></dl>
              </details>
            </td>
          </tr>
          {expanded && <tr className="bank-detail-row"><td colSpan={6} className="bank-inline-detail" id={`bank-detail-${row.id}`}>
            {children}
          </td></tr>}
        </tbody>;
      })}
    </table>
  </div>;
}
