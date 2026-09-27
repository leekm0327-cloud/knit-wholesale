export type TodayCategory = '주문' | '정산' | '직원' | '구매';
export type TodayTaskKind = 'orders' | 'deposits' | 'invoices' | 'leave' | 'schedule' | 'supply';
export type TodayTaskItem = {
  id: number;
  title: string;
  detail: string;
  href: string;
  amount?: number;
};
export type TodayTaskGroup = {
  key: TodayTaskKind;
  category: TodayCategory;
  title: string;
  description: string;
  count: number;
  href: string;
  items: TodayTaskItem[];
};
export type TodayTasksResponse = { checkedAt: number; groups: TodayTaskGroup[] };

// Keep query parameters before the hash, including for native new-tab navigation.
export function todayTaskHref(path: string, kind: TodayTaskKind, id?: number, date?: string) {
  const query = new URLSearchParams({ todayTask: kind });
  if (id !== undefined) query.set('todayId', String(id));
  if (date) query.set('todayDate', date);
  if (kind === 'invoices') {
    query.set('environment', 'production');
    if (id !== undefined) query.set('order', String(id));
  }
  return `?${query}#${path}`;
}

export function needsDepositReview(row: { deposit: number; state: string; posted: number | boolean }) {
  return row.deposit > 0 && !row.posted && ['pending', 'customer'].includes(row.state);
}
