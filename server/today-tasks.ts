import type Database from 'better-sqlite3';
import { todayTaskHref, type TodayTaskGroup, type TodayTaskItem, type TodayTasksResponse } from '../shared/today-tasks';

const previewLimit = 3;
const dateOf = (at: number) => new Date(at + 9 * 3600000).toISOString().slice(0, 10);
function snapshotName(value: string) {
  try { return JSON.parse(value)?.businessName || '거래처 정보 없음'; } catch { return '거래처 정보 없음'; }
}

// This overview only reads local records. It never syncs a bank, issues an invoice,
// or approves a request. Owner-only sources are not even queried for managers.
export function readTodayTasks(db: Database.Database, owner: boolean, now = Date.now()): TodayTasksResponse {
  const groups: TodayTaskGroup[] = [];
  function group(meta: Omit<TodayTaskGroup, 'count' | 'items'>, source: string, fields: string, order: string, item: (row: any) => TodayTaskItem) {
    const count = (db.prepare(`SELECT COUNT(*) AS count ${source}`).get() as { count: number }).count;
    const rows = db.prepare(`SELECT ${fields} ${source} ORDER BY ${order} LIMIT ?`).all(previewLimit);
    groups.push({ ...meta, count, items: rows.map(item) });
  }

  group({ key: 'orders', category: '주문', title: '처리할 주문', description: '접수 후 아직 처리 완료하지 않은 주문', href: todayTaskHref('/admin/orders', 'orders') },
    "FROM orders o WHERE o.status='pending'", 'o.id,o.order_no,o.customer_snapshot,o.created_at,o.desired_date,o.total_amount', 'o.created_at,o.id',
    r => ({ id: r.id, title: snapshotName(r.customer_snapshot), detail: `${r.order_no} · ${r.desired_date ? `희망 납품 ${r.desired_date}` : `접수 ${dateOf(r.created_at)}`}`, amount: r.total_amount, href: `#/admin/orders/${r.id}` }));

  if (owner) {
    group({ key: 'deposits', category: '정산', title: '확인할 입금', description: '가져온 내역 중 미확인·거래처 지정 후 미반영', href: todayTaskHref('/admin/bank-review', 'deposits') },
      "FROM bank_review b WHERE b.environment='production' AND b.deposit>0 AND b.state IN ('pending','customer') AND NOT EXISTS (SELECT 1 FROM bank_live_postings p WHERE p.bank_id=b.id AND p.cancelled_at IS NULL)",
      'b.id,b.at,b.remark,b.deposit,b.state', 'b.at,b.id',
      r => ({ id: r.id, title: r.remark || '적요 없음', detail: `${r.at.slice(0,4)}-${r.at.slice(4,6)}-${r.at.slice(6,8)} · ${r.state === 'customer' ? '거래처 지정 · 장부 반영 대기' : '미확인'}`, amount: r.deposit, href: todayTaskHref('/admin/bank-review', 'deposits', r.id) }));

    // Same eligibility as the order invoice queue: completed, paid-value external
    // orders, excluding samples and current/legacy internal store orders.
    group({ key: 'invoices', category: '정산', title: '세금계산서 발행·확인', description: '처리 완료된 외부 유상 주문 · 운영 발행 기준', href: todayTaskHref('/admin/tax-invoices', 'invoices') },
      `FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
       LEFT JOIN tax_invoice_order_links l ON l.order_id=o.id AND l.environment='production' AND l.active=1
       LEFT JOIN tax_invoice_drafts d ON d.id=l.draft_id AND d.environment='production'
       WHERE o.status='done' AND o.total_amount>0 AND o.is_sample<>1 AND o.is_store_order<>1
       AND NOT (o.is_store_order=-1 AND COALESCE(c.is_store,0)=1)
       AND (l.id IS NULL OR COALESCE(d.state,'unknown') NOT IN ('issued','external'))`,
      'o.id,o.order_no,o.customer_snapshot,o.total_amount,l.id AS link_id,d.state', 'o.created_at,o.id',
      r => ({ id: r.id, title: snapshotName(r.customer_snapshot), detail: `${r.order_no} · ${!r.link_id ? '미발행' : ({draft:'발행 준비',rejected:'발행 실패',sending:'발행 중 · 상태 확인',cancelled:'발행 취소 · 확인 필요'} as Record<string,string>)[r.state] || '발행 상태 확인 필요'}`, amount: r.total_amount, href: todayTaskHref('/admin/tax-invoices', 'invoices', r.id) }));

    group({ key: 'leave', category: '직원', title: '연차 승인 대기', description: '승인 또는 반려를 기다리는 신청', href: todayTaskHref('/admin/staff/leave', 'leave') },
      "FROM leave_requests r WHERE r.status='pending'", 'r.id,r.staff_name,r.start_date,r.end_date,r.half_day', 'r.created_at,r.id',
      r => ({ id: r.id, title: `${r.staff_name || '직원'} · ${r.half_day ? '반차' : '연차'}`, detail: r.start_date === r.end_date ? r.start_date : `${r.start_date} ~ ${r.end_date}`, href: todayTaskHref('/admin/staff/leave', 'leave', r.id) }));
    group({ key: 'schedule', category: '직원', title: '근무 변경 승인 대기', description: '승인하면 근무표에 반영되는 신청', href: todayTaskHref('/admin/staff/schedule', 'schedule') },
      "FROM schedule_change_requests r WHERE r.status='pending'", 'r.id,r.staff_name,r.created_at', 'r.created_at,r.id',
      r => ({ id: r.id, title: `${r.staff_name || '직원'} · 근무 변경`, detail: `${dateOf(r.created_at)} 신청`, href: todayTaskHref('/admin/staff/schedule', 'schedule', r.id) }));
  }

  group({ key: 'supply', category: '구매', title: '진행 중인 직원 발주', description: '발주 필요·입고·환불 대기', href: todayTaskHref('/admin/staff/supply', 'supply') },
    "FROM supply_orders o JOIN supply_order_meta m ON m.order_id=o.id WHERE m.status IN ('needed','ordered','partial','refund_pending')", 'o.id,o.vendor,o.body,o.order_date,m.status', 'o.order_date,o.id',
    r => ({ id: r.id, title: r.vendor || '구매처 미입력', detail: `${({needed:'발주 필요',ordered:'입고 대기',partial:'일부 입고',refund_pending:'환불 대기'} as Record<string,string>)[r.status]} · ${r.body}`, href: todayTaskHref('/admin/staff/supply', 'supply', r.id, r.order_date) }));
  return { checkedAt: now, groups };
}
