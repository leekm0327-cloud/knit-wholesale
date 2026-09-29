import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import type { BankEnvironment } from './bank-connection';
import { bankCustomerSuggestions } from './bank-customer-suggestions';
import { BANK_BULK_LIMIT, type BankBulkRow, type BankBulkResult } from '../shared/bank-bulk-payments';

const id = z.number().int().positive().safe();
const idsSchema = z.array(id).min(1).max(BANK_BULK_LIMIT).refine(ids => new Set(ids).size === ids.length);
const batchSchema = z.object({
  items: z.array(z.object({ id, customerId: id, snapshot: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(BANK_BULK_LIMIT)
    .refine(items => new Set(items.map(i => i.id)).size === items.length),
  confirmProduction: z.boolean().optional(),
});
const dateOf = (at: string) => `${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)}`;

export function reviewBulkPayments(db: Database.Database, environment: BankEnvironment, ids: number[]): BankBulkRow[] {
  const table = environment === 'production' ? 'bank_live_postings' : 'bank_test_postings';
  const suggestions = bankCustomerSuggestions(db, environment);
  const get = db.prepare('SELECT * FROM bank_review WHERE id=? AND environment=?');
  const active = db.prepare(`SELECT p.*,c.business_name AS customerName FROM ${table} p
    LEFT JOIN customers c ON c.id=p.customer_id WHERE p.bank_id=? AND p.cancelled_at IS NULL`);
  const duplicate = environment === 'production'
    ? db.prepare('SELECT id FROM payments WHERE paid_at=? AND amount=? AND customer_id=?')
    : db.prepare(`SELECT id FROM ${table} WHERE kind='payment' AND posted_date=? AND amount=? AND customer_id=? AND cancelled_at IS NULL`);
  const rows = ids.map(id => {
    const row = get.get(id, environment) as any;
    const item: BankBulkRow = { id, at: row?.at ?? '', account: row ? '****' + row.account.slice(-4) : '',
      remark: row?.remark ?? '내역 없음', amount: row?.deposit ?? 0, customerId: null, customerName: '',
      memo: row?.memo ?? '', status: 'review', reason: '', snapshot: '' };
    if (!row) { item.reason = '이 환경에서 내역을 찾을 수 없습니다.'; return item; }
    const posting = active.get(id) as any;
    if (posting) {
      item.status = 'done'; item.reason = '이미 장부에 반영된 내역입니다.';
      item.customerId = posting.kind === 'payment' ? posting.customer_id : null;
      item.customerName = posting.customerName ?? '';
      return item;
    }
    const suggestion = suggestions.get(id);
    if (row.state !== 'pending' || row.withdraw !== 0 || !Number.isSafeInteger(row.deposit) || row.deposit <= 0 || row.currency !== 'KRW') {
      item.reason = '미확인 원화 입금만 모아서 반영할 수 있습니다.';
    } else if (suggestion?.kind !== 'customer') {
      item.reason = suggestion?.kind === 'ambiguous' ? '이전 연결이 서로 달라요. 거래처를 개별 확인해 주세요.' : '추천 근거가 없어 거래처를 개별 확인해야 합니다.';
    } else {
      item.customerId = suggestion.customerId; item.customerName = suggestion.name;
      // This detects stale previews; owner authorization is enforced separately on both routes.
      item.snapshot = createHash('sha256').update(JSON.stringify({ environment, row, customerId: item.customerId, name: item.customerName })).digest('hex');
      if (duplicate.get(dateOf(row.at), row.deposit, suggestion.customerId)) {
        item.reason = '같은 거래처·날짜·금액의 수금 기록이 있습니다. 기존 기록 연결을 확인해 주세요.';
      } else { item.status = 'ready'; }
    }
    return item;
  });
  const groups = new Map<string, BankBulkRow[]>();
  for (const row of rows.filter(r => r.status === 'ready')) {
    const key = JSON.stringify([row.customerId, dateOf(row.at), row.amount]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  groups.forEach(group => {
    if (group.length > 1) for (const row of group) {
      row.status = 'review'; row.reason = '목록에 같은 거래처·날짜·금액의 입금이 여러 건 있어 개별 확인이 필요합니다.';
    }
  });
  return rows;
}

type PostPayment = (id: number, payload: { kind: 'payment'; customerId: number; memo: string; confirmProduction: boolean }, actor: number) => number;
export function registerBankBulkPayments(app: Express, db: Database.Database, owner: RequestHandler,
  environment: BankEnvironment, prefix: string, postInsideTransaction: PostPayment) {
  const safe = (fn: (req: any, res: any) => void): RequestHandler => (req, res) => {
    try { fn(req, res); } catch (e) {
      res.status(e instanceof z.ZodError ? 400 : 409).json({ message: e instanceof z.ZodError ? `서로 다른 입금을 1~${BANK_BULK_LIMIT}건 선택해 주세요.` : e instanceof Error ? e.message : '처리하지 못했습니다.' });
    }
  };
  app.post(prefix + '/payments/preview', owner, safe((req, res) => {
    const ids = idsSchema.parse(req.body.ids);
    res.json({ environment, rows: reviewBulkPayments(db, environment, ids) });
  }));
  app.post(prefix + '/payments/bulk', owner, safe((req, res) => {
    const body = batchSchema.parse(req.body);
    if (environment === 'production' && !body.confirmProduction) throw new Error('운영 장부 반영 확인이 필요합니다.');
    const ids = body.items.map(i => i.id);
    const results: BankBulkResult[] = body.items.map(item => {
      try {
        // Each row commits or rolls back independently, while all financial checks run inside its transaction.
        return db.transaction((): BankBulkResult => {
          const current = reviewBulkPayments(db, environment, ids).find(r => r.id === item.id)!;
          if (current.status === 'done' && current.customerId === item.customerId)
            return { id: item.id, status: 'already', message: '이미 반영되어 추가 등록하지 않았습니다.' };
          if (current.status !== 'ready') return { id: item.id, status: 'review', message: current.reason };
          if (current.snapshot !== item.snapshot || current.customerId !== item.customerId)
            return { id: item.id, status: 'review', message: '내역이나 추천 거래처가 변경됐습니다. 목록을 새로 확인해 주세요.' };
          postInsideTransaction(item.id, { kind: 'payment', customerId: item.customerId, memo: current.memo, confirmProduction: environment === 'production' }, req.session.userId);
          return { id: item.id, status: 'posted', message: '수금 반영 완료' };
        })();
      } catch (e) {
        return { id: item.id, status: 'review', message: e instanceof Error ? e.message : '처리하지 못했습니다. 개별 확인해 주세요.' };
      }
    });
    res.json({ environment, results });
  }));
}
