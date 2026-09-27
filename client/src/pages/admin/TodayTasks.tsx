import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/queryClient';
import { won } from '@/lib/format';
import type { TodayCategory, TodayTasksResponse } from '@shared/today-tasks';

export default function TodayTasks({ userId, owner }: { userId: number; owner: boolean }) {
  const [filter, setFilter] = useState<TodayCategory | '전체'>('전체');
  const query = useQuery<TodayTasksResponse>({
    queryKey: ['/api/admin/operations/tasks', userId, owner],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/admin/operations/tasks`, { credentials: 'include' });
      if (!response.ok) throw new Error('할 일을 불러오지 못했습니다.');
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30000,
  });
  const groups = query.data?.groups || [];
  const categories: (TodayCategory | '전체')[] = ['전체', '주문', ...(owner ? ['정산', '직원'] as const : []), '구매'];
  const visible = groups.filter(group => filter === '전체' || group.category === filter);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return <section className="erp-panel today-tasks" aria-labelledby="today-tasks-heading">
    <div className="erp-panel-head">
      <div><h2 id="today-tasks-heading">오늘 할 일{!query.isPending && !query.isError && <span className="today-total">{total}건</span>}</h2><p>지난 날짜의 미처리 내역도 함께 보여요.</p></div>
      <button type="button" className="today-refresh" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? '확인 중…' : '새로고침'}</button>
    </div>
    <div className="today-filters" aria-label="할 일 분류">
      {categories.map(category => <button type="button" key={category} aria-pressed={filter === category} onClick={() => setFilter(category)}>
        {category}{!query.isPending && !query.isError && <span>{groups.filter(group => category === '전체' || group.category === category).reduce((sum, group) => sum + group.count, 0)}</span>}
      </button>)}
    </div>
    {query.isError ? <div className="erp-error" role="alert">최신 할 일을 확인하지 못했습니다. <button onClick={() => query.refetch()}>다시 시도</button></div>
      : query.isPending ? <p className="erp-empty" role="status">처리할 일을 확인하고 있어요…</p>
      : <>
        {visible.every(group => group.count === 0) && <p className="today-complete" role="status">{filter === '전체' ? '현재 확인할 일이 없습니다.' : `${filter} 항목은 모두 처리했어요.`}</p>}
        <div className="today-groups">{visible.map(group => <section className="today-group" key={group.key} aria-labelledby={`today-${group.key}`}>
          <div className="today-group-heading"><h3 id={`today-${group.key}`}>{group.title} <span>{group.count}건</span></h3><a href={group.href} aria-label={`${group.title} 전체 보기`}>전체 보기 →</a></div>
          <p className="today-description">{group.description}</p>
          {group.count === 0 ? <p className="today-none">대기 없음</p> : <ul>{group.items.map(item => <li key={item.id}>
            <a className="today-item" href={item.href}><div><strong>{item.title}</strong><small>{item.detail}</small>{item.amount !== undefined && <span className="today-amount">{won(item.amount)}</span>}</div><span className="today-item-action">확인 <span aria-hidden="true">→</span></span></a>
          </li>)}</ul>}
          {group.count > group.items.length && <a className="today-more" href={group.href}>외 {group.count - group.items.length}건 더 보기 →</a>}
        </section>)}</div>
        <p className="today-updated">{new Date(query.data.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })} 확인 · 처리 후 돌아오면 자동으로 갱신돼요.</p>
      </>}
  </section>;
}
