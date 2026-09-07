import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/format';
import type { BeanStock } from '@shared/supply-workflow';
import StaffQueryError from './StaffQueryError';
const key = '/api/staff/bean-stock';
const stamp = (v: number) => new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export default function StaffBeanStock() {
    const q = useQuery<BeanStock[]>({ queryKey: [key] });
    const [adding, setAdding] = useState(false), [search, setSearch] = useState('');
    if (q.isError)
        return <StaffQueryError retry={q.refetch}/>;
    if (q.isLoading)
        return <p className="s-empty">원두 목록을 불러오는 중…</p>;
    const rows = q.data || [];
    return <><div className="s-card"><div className="flex items-center justify-between"><h2 className="text-base font-semibold">매장 원두 재고</h2><button className="s-pill line" onClick={() => setAdding(!adding)}>{adding ? '목록 닫기' : '원두 추가'}</button></div><p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--s-muted)' }}>개봉한 원두까지 합친 총량을 kg으로 입력해 주세요.<br />5.5kg = 1kg 5봉 + 개봉 잔량 약 500g</p></div>
 {adding && <div className="s-card"><label className="s-label" htmlFor="bean-search">등록된 원두 찾기</label><input id="bean-search" className="s-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="원두 이름 검색"/>{rows.filter(r => !r.tracked && r.name.toLowerCase().includes(search.toLowerCase())).map(r => <BeanRow key={r.productId} row={r} adding/>)}{!rows.length && <p className="s-empty">등록된 원두 상품이 없습니다.</p>}</div>}
 {!rows.some(r => r.tracked) && !adding && <p className="s-empty">원두 추가에서 매장에서 사용하는 원두를 선택해 주세요.</p>}
 {rows.filter(r => r.tracked).map(r => <BeanRow key={r.productId} row={r}/>)}
 <p className="px-2 text-xs leading-relaxed" style={{ color: 'var(--s-muted)' }}>입고 확인이나 판매로 자동 증감하지 않아요. 실물을 확인한 현재 총재고를 기록해 주세요.</p></>;
}
function BeanRow({ row: r, adding = false }: {
    row: BeanStock;
    adding?: boolean;
}) {
    const { toast } = useToast();
    const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [history, setHistory] = useState(false), [qty, setQty] = useState(''), [minimum, setMinimum] = useState('');
    const h = useQuery<{
        grams: number | null;
        minimumGrams: number | null;
        tracked: number;
        staffName: string;
        createdAt: number;
    }[]>({ queryKey: [`${key}/${r.productId}/history`], enabled: history });
    const [version, setVersion] = useState(r.version);
    const low = r.grams !== null && r.minimumGrams !== null && r.grams < r.minimumGrams;
    function open() { setQty(r.grams === null ? '' : String(r.grams / 1000)); setMinimum(r.minimumGrams === null ? '' : String(r.minimumGrams / 1000)); setVersion(r.version); setEditing(true); }
    async function save(tracked = true) {
        if (busy)
            return;
        const valid = (s: string) => s === '' || /^\d+(\.\d{1,3})?$/.test(s) && Number(s) <= 10000;
        if (!valid(qty) || !valid(minimum)) {
            toast({ variant: 'destructive', title: '0 이상의 kg 수량을 소수점 셋째 자리까지 입력해 주세요.' });
            return;
        }
        setBusy(true);
        try {
            await apiRequest('PUT', `${key}/${r.productId}`, { kg: qty === '' ? null : Number(qty), minimumKg: minimum === '' ? null : Number(minimum), tracked, version });
            setEditing(false);
            await queryClient.invalidateQueries({ queryKey: [key] });
            queryClient.invalidateQueries({ queryKey: [`${key}/${r.productId}/history`] });
            toast({ title: '원두 재고가 저장됐어요.' });
        }
        catch (e) {
            toast({ variant: 'destructive', title: '저장하지 못했어요.', description: errMsg(e) });
        }
        finally {
            setBusy(false);
        }
    }
    async function request() { setBusy(true); try {
        const res = await apiRequest('POST', `${key}/${r.productId}/request`, {});
        const data = await res.json();
        queryClient.invalidateQueries({ queryKey: ['supply-board'] });
        toast({ title: data.existing ? '이미 진행 중인 발주가 있어요.' : '발주 필요 목록에 추가했어요.' });
    }
    catch (e) {
        toast({ variant: 'destructive', title: errMsg(e) });
    }
    finally {
        setBusy(false);
    } }
    return <div className={adding ? 'border-t py-3 mt-3' : 's-card'} data-testid={`bean-stock-${r.productId}`}><div className="flex justify-between gap-3 items-center"><div className="min-w-0"><h3 className="text-sm font-semibold break-words">{r.name}</h3>{!r.available && <span className="text-xs" style={{ color: 'var(--s-muted)' }}>도매사이트 품절 상품</span>}{!adding && <p className="mt-1 text-xs" style={{ color: 'var(--s-muted)' }}>{r.updatedAt ? `${r.updatedBy} · ${stamp(r.updatedAt)}` : '아직 입력하지 않았어요'}</p>}</div><button className="s-pill line shrink-0" onClick={open} disabled={busy}>{adding ? '선택' : r.grams === null ? '입력' : `${r.grams / 1000} kg`}</button></div>
 {low && <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs" style={{ color: '#9a4b2c' }}>기준 {r.minimumGrams! / 1000}kg 미만</span><button className="s-pill line" onClick={request} disabled={busy}>발주 필요에 추가</button></div>}
 {editing && <fieldset disabled={busy} className="mt-4"><label className="s-label">현재 총재고 (kg)</label><input className="s-input" inputMode="decimal" placeholder="예: 5.5" value={qty} onChange={e => setQty(e.target.value)} aria-label={`${r.name} 재고 kg`}/><label className="s-label mt-4">부족 알림 기준 (kg · 선택)</label><input className="s-input" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} placeholder="비워두면 부족 표시 안 함"/><p className="mt-2 text-xs" style={{ color: 'var(--s-muted)' }}>빈칸은 미입력, 0은 재고 없음이에요.</p><div className="mt-3 flex gap-2"><button className="s-pill" onClick={() => save()}>{busy ? '저장 중…' : '저장'}</button><button className="s-pill line" onClick={() => { if (confirm('입력한 값을 닫고 최신 재고를 다시 확인할까요?')) {
        setEditing(false);
        queryClient.invalidateQueries({ queryKey: [key] });
    } }}>닫기</button>{!adding && <button className="s-pill line" onClick={() => { if (confirm('매장 원두 목록에서 숨길까요? 재고 기록은 보관됩니다.'))
        save(false); }}>숨기기</button>}</div></fieldset>}
 {!adding && <button className="mt-3 text-xs underline min-h-9" style={{ color: 'var(--s-muted)' }} onClick={() => setHistory(!history)}>변경 내역 {history ? '닫기' : '보기'}</button>}{history && (h.isError ? <StaffQueryError retry={h.refetch}/> : h.isLoading ? <p className="text-xs">불러오는 중…</p> : <div className="border-t pt-2">{h.data?.map((v, i) => <p key={i} className="py-1 text-xs leading-relaxed">{v.grams === null ? '미입력' : `${v.grams / 1000}kg`} · {v.staffName} · {stamp(v.createdAt)}{!v.tracked ? ' · 목록에서 숨김' : ''}</p>)}</div>)}
 </div>;
}
