import StaffSupplyPicker from "@/components/StaffSupplyPicker";
import { appendSupplyText, type SupplySelection } from "@/lib/supply-catalog";
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StaffLayout, useStaff } from '@/components/StaffLayout';
import StaffQueryError from '@/components/StaffQueryError';
import StaffBeanStock from '@/components/StaffBeanStock';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/format';
import { canEditSupply, supplyLabels, type SupplyState, type SupplyRecord, type SupplyTemplate, type SupplyEvent } from '@shared/supply-workflow';
import type { SupplyVendor } from '@shared/schema';
const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const won = (n: number) => n.toLocaleString('ko-KR');
const when = (n: number) => new Date(n).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
type Form = {
    selection?: SupplySelection[];
    id?: number;
    version?: number;
    convert?: boolean;
    orderDate: string;
    vendor: string;
    body: string;
    amount: string;
    status: 'needed' | 'ordered' | 'received';
    destination: string;
    expectedDate: string;
    link: string;
    note: string;
};
const empty = (status: Form['status'] = 'ordered'): Form => ({ orderDate: today(), vendor: '', body: '', amount: '', status, destination: '', expectedDate: '', link: '', note: '' });
export default function StaffSupply() { const { data: me } = useStaff(); return <StaffLayout title="발주 · 재고" subtitle="매장 운영">{me && <SupplyBoard key={me.id} me={me}/>}</StaffLayout>; }
function SupplyBoard({ me }: {
    me: {
        id: number;
        name: string;
    };
}) {
    const { toast } = useToast();
    const [tab, setTab] = useState('ordered'), [month, setMonth] = useState(today().slice(0, 7)), [filter, setFilter] = useState(''), [search, setSearch] = useState(''), [busy, setBusy] = useState(false);
    const draftKey = `knit.supplyDraft:${me.id}`;
    const [form, setForm] = useState<Form | null>(() => { try {
        const v = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
        return v && typeof v.body === 'string' && typeof v.orderDate === 'string' && typeof v.amount === 'string' && ['needed', 'ordered', 'received'].includes(v.status) ? v : null;
    }
    catch {
        return null;
    } });
    useEffect(() => { try {
        if (form)
            sessionStorage.setItem(draftKey, JSON.stringify(form));
        else
            sessionStorage.removeItem(draftKey);
    }
    catch { } }, [form, draftKey]);
    useEffect(() => { if (!form)
        return; const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [!!form]);
    const q = useQuery<SupplyRecord[]>({ queryKey: ['supply-board', month], queryFn: async () => { const res = await apiRequest('GET', `/api/staff/supply-board?month=${month}`); return res.json(); } });
    const v = useQuery<SupplyVendor[]>({ queryKey: ['/api/staff/supply-vendors'] });
    const t = useQuery<SupplyTemplate[]>({ queryKey: ['/api/staff/supply-templates'] });
    const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['supply-board'] }); queryClient.invalidateQueries({ queryKey: ['/api/staff/supply-orders'] }); };
    function close() { if (!busy && confirm('작성 중인 내용을 닫을까요? 저장하지 않은 입력은 지워집니다.'))
        setForm(null); }
    function start(next: Form) { if (form && !confirm('작성 중인 내용을 새 입력으로 바꿀까요?'))
        return; setForm(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function from(r: SupplyRecord, mode: 'edit' | 'convert' | 'copy') { start({ ...empty(), ...r, id: mode === 'copy' ? undefined : r.id, version: r.updatedAt, convert: mode === 'convert', orderDate: mode === 'edit' ? r.orderDate : today(), expectedDate: mode === 'copy' ? '' : r.expectedDate, status: mode === 'edit' && r.status === 'needed' ? 'needed' : 'ordered', amount: mode === 'edit' && r.amount ? String(r.amount) : '', note: mode === 'edit' ? r.note : '' }); if (mode === 'copy' && r.amount)
        toast({ title: `지난 금액 ${won(r.amount)}원`, description: '이번 결제금액을 확인해 입력해 주세요.' }); }
    async function save() { if (!form || busy)
        return; let body: string; try { body = appendSupplyText(form.body, form.selection || []); } catch (e) { toast({ variant: 'destructive', title: errMsg(e) }); return; } if (!body.trim()) {
        toast({ variant: 'destructive', title: '품목과 수량을 적어주세요.' });
        return;
    } if (form.amount && !/^\d+$/.test(form.amount)) {
        toast({ variant: 'destructive', title: '금액은 0 이상의 정수로 입력해 주세요.' });
        return;
    } setBusy(true); const { selection: _selection, ...fields } = form; const payload = { ...fields, body, amount: form.status === 'needed' ? 0 : Number(form.amount) || 0 }; try {
        if (form.convert)
            await apiRequest('POST', `/api/staff/supply-board/${form.id}/status`, { version: form.version, status: form.status, note: form.note, order: payload });
        else
            await apiRequest(form.id ? 'PATCH' : 'POST', `/api/staff/supply-board${form.id ? '/' + form.id : ''}`, payload);
        setForm(null);
        invalidate();
        toast({ title: '기록을 저장했어요.' });
    }
    catch (e) {
        toast({ variant: 'destructive', title: '저장하지 못했어요.', description: errMsg(e) });
    }
    finally {
        setBusy(false);
    } }
    async function template(r: SupplyRecord) { const name = prompt('자주 사는 품목 이름', r.vendor || r.body.split('\n')[0].slice(0, 60)); if (!name?.trim())
        return; try {
        await apiRequest('POST', '/api/staff/supply-templates', { name, vendor: r.vendor, body: r.body, link: r.link, destination: r.destination });
        queryClient.invalidateQueries({ queryKey: ['/api/staff/supply-templates'] });
        toast({ title: '자주 사는 품목에 저장했어요.' });
    }
    catch (e) {
        toast({ variant: 'destructive', title: errMsg(e) });
    } }
    const all = q.data || [];
    const active = (r: SupplyRecord) => ['ordered', 'partial', 'refund_pending'].includes(r.status);
    const shown = all.filter(r => (tab === 'needed' ? r.status === 'needed' : tab === 'ordered' ? active(r) : r.orderDate.startsWith(month)) && (!filter || r.vendor === filter) && (!search || `${r.vendor} ${r.body} ${r.staffName}`.toLowerCase().includes(search.toLowerCase())));
    const paid = shown.filter(r => !['needed', 'cancelled', 'refunded'].includes(r.status));
    const update = (patch: Partial<Form>) => setForm(f => f ? { ...f, ...patch } : f);
    return <>
 <div className="s-seg mb-3">{[['ordered', '발주 관리'], ['stock', '원두 재고']].map(([id, label]) => <button key={id} className={(tab === 'stock') === (id === 'stock') ? 'on' : ''} disabled={busy} onClick={() => { if (form && id === 'stock') {
        toast({ title: '작성 중인 기록을 먼저 저장하거나 닫아주세요.' });
        return;
    } setTab(id); }}>{label}</button>)}</div>
 {tab === 'stock' ? <StaffBeanStock /> : <>
 {!form ? <div className="grid grid-cols-2 gap-2 mb-3"><button className="s-pill" onClick={() => start(empty())}>결제한 발주 기록</button><button className="s-pill line" onClick={() => start(empty('needed'))}>발주 필요 추가</button></div> : <div className="s-card" data-testid="supply-form"><div className="flex justify-between items-center mb-4"><h2 className="text-base font-semibold">{form.convert ? '발주 완료 기록' : form.id ? '기록 수정' : form.status === 'needed' ? '발주할 것 남기기' : '결제한 발주 기록'}</h2><button className="s-pill line" onClick={close} disabled={busy}>닫기</button></div>
 <fieldset disabled={busy} className="space-y-4">
 {!form.id && <details><summary className="text-sm cursor-pointer min-h-9">자주 사는 품목 불러오기</summary>{t.isError ? <StaffQueryError retry={t.refetch}/> : <div className="flex flex-wrap gap-2 mt-2">{t.data?.map(x => <button key={x.id} className="s-chip" onClick={() => { if ((form.body || form.selection?.length) && !confirm('작성한 품목을 바꿀까요?'))
                return; update({ vendor: x.vendor, body: x.body, selection: [], link: x.link, destination: x.destination, amount: '' }); }}>{x.name}</button>)}{!t.isLoading && !t.data?.length && <p className="text-xs" style={{ color: 'var(--s-muted)' }}>기록의 ‘자주 사는 품목으로 저장’으로 추가할 수 있어요.</p>}</div>}</details>}
 <div><label className="s-label" htmlFor="supply-date">{form.status === 'needed' ? '기록 날짜' : '발주 날짜'}</label><input id="supply-date" className="s-input" type="date" value={form.orderDate} onChange={e => update({ orderDate: e.target.value })}/></div>
 <div><label className="s-label" htmlFor="supply-vendor">구입처</label><input id="supply-vendor" className="s-input" list="supply-vendors" maxLength={40} value={form.vendor} onChange={e => update({ vendor: e.target.value })} placeholder="선택하거나 직접 입력"/><datalist id="supply-vendors">{v.data?.map(x => <option key={x.id} value={x.name}/>)}</datalist>{v.isError && <p className="text-xs mt-1">구입처 목록을 불러오지 못했어요. 직접 입력할 수 있어요.</p>}</div>
 <StaffSupplyPicker value={form.selection || []} onChange={selection => update({ selection })}/>
 <div><label className="s-label" htmlFor="supply-body">{form.selection?.length ? "직접 입력 · 추가 재료 / 규격 (선택)" : "직접 입력 · 품목 / 수량"}</label><textarea id="supply-body" className="s-input" rows={4} maxLength={2000} value={form.body} onChange={e => update({ body: e.target.value })} placeholder={form.selection?.length ? '추가 재료나 규격을 적어주세요. 예: 버터는 500g 제품' : '목록에 없는 재료도 적을 수 있어요.\n예: 생레몬 5개'}/></div>
 {form.status !== 'needed' && <><div><label className="s-label" htmlFor="supply-amount">이번 결제금액 (원 · 모르면 비워두기)</label><input id="supply-amount" className="s-input" inputMode="numeric" value={form.amount} onChange={e => update({ amount: e.target.value.replace(/,/g, '') })} placeholder="예: 43190"/></div>{(!form.id || form.convert) && <div><label className="s-label" htmlFor="supply-receipt">입고 상태</label><select id="supply-receipt" className="s-input" value={form.status} onChange={e => update({ status: e.target.value as Form['status'] })}><option value="ordered">아직 도착하지 않았어요</option><option value="received">이미 받았어요 · 직접 구매</option></select></div>}</>}
 <details open={!!form.destination || !!form.expectedDate || !!form.link || !!form.note}><summary className="text-sm cursor-pointer min-h-9">배송지 · 구매 링크 · 메모 (선택)</summary><div className="space-y-3 mt-2"><div><label className="s-label">배송지</label><input className="s-input" maxLength={100} value={form.destination} onChange={e => update({ destination: e.target.value })} placeholder="예: 매장 / 아뜰리에"/></div><div><label className="s-label">도착 예정일</label><input className="s-input" type="date" value={form.expectedDate} onChange={e => update({ expectedDate: e.target.value })}/></div><div><label className="s-label">구매 링크</label><input className="s-input" type="url" value={form.link} onChange={e => update({ link: e.target.value })} placeholder="https://"/></div><div><label className="s-label">규격 · 전달사항</label><textarea className="s-input" rows={2} maxLength={1000} value={form.note} onChange={e => update({ note: e.target.value })}/></div></div></details>
 <button className="s-pill wide" onClick={save}>{busy ? '저장 중…' : '저장'}</button><p className="text-xs" style={{ color: 'var(--s-muted)' }}>저장 전에는 다른 직원에게 보이지 않아요.</p>
 </fieldset></div>}
 <div className="s-seg mt-4">{[['needed', '발주 필요'], ['ordered', '입고 대기'], ['all', '전체 기록']].map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}{id !== 'all' && !q.isLoading && !q.isError ? ` ${all.filter(r => id === 'needed' ? r.status === 'needed' : active(r)).length}` : ''}</button>)}</div>
 <div className="s-card mt-3 space-y-2">{tab === 'all' && <div><label className="s-label" htmlFor="supply-month">조회 월</label><input id="supply-month" className="s-input" type="month" value={month} onChange={e => { if (e.target.value)
            setMonth(e.target.value); }}/></div>}<div className="grid grid-cols-2 gap-2"><input className="s-input" aria-label="발주 검색" placeholder="품목 · 작성자 검색" value={search} onChange={e => setSearch(e.target.value)}/><select className="s-input" aria-label="구입처 필터" value={filter} onChange={e => setFilter(e.target.value)}><option value="">모든 구입처</option>{Array.from(new Set(all.map(r => r.vendor).filter(Boolean))).sort().map(x => <option key={x}>{x}</option>)}</select></div></div>
 {q.isError ? <StaffQueryError retry={q.refetch}/> : q.isLoading ? <p className="s-empty">기록을 불러오는 중…</p> : <>
 {tab === 'all' && <div className="px-2 mb-3 text-xs leading-relaxed" style={{ color: 'var(--s-muted)' }}>조회 결과 {shown.length}건 · 입력된 금액 {won(paid.reduce((s, r) => s + r.amount, 0))}원<br />금액 미입력 {paid.filter(r => !r.amount).length}건 · 발주 필요/취소/환불 완료 제외{paid.some(r => r.status === 'refund_pending') ? ' · 환불 대기 금액 포함' : ''}</div>}
 {!shown.length ? <p className="s-empty">{tab === 'needed' ? '발주할 것이 생기면 위에서 추가해 주세요.' : tab === 'ordered' ? '입고를 기다리는 발주가 없어요.' : '조건에 맞는 기록이 없어요.'}</p> : shown.map(r => <Record key={r.id} r={r} me={me.id} onEdit={() => from(r, 'edit')} onConvert={() => from(r, 'convert')} onCopy={() => from(r, 'copy')} onTemplate={() => template(r)} invalidate={invalidate}/>)}</>}
 <p className="mt-4 px-2 text-xs leading-relaxed" style={{ color: 'var(--s-muted)' }}>주문과 결제는 이용하던 구매처에서 진행해 주세요. 이 화면은 발주와 입고 기록을 공유하는 곳이에요.</p>
 </>}
 </>;
}
function Record({ r, me, onEdit, onConvert, onCopy, onTemplate, invalidate }: {
    r: SupplyRecord;
    me: number;
    onEdit: () => void;
    onConvert: () => void;
    onCopy: () => void;
    onTemplate: () => void;
    invalidate: () => void;
}) {
    const { toast } = useToast();
    const [target, setTarget] = useState<SupplyState | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [history, setHistory] = useState(false);
    const h = useQuery<SupplyEvent[]>({ queryKey: [`/api/staff/supply-board/${r.id}/events`], enabled: history });
    async function status() { if (!target || busy)
        return; setBusy(true); try {
        await apiRequest('POST', `/api/staff/supply-board/${r.id}/status`, { status: target, version: r.updatedAt, note });
        setTarget(null);
        setNote('');
        invalidate();
        queryClient.invalidateQueries({ queryKey: [`/api/staff/supply-board/${r.id}/events`] });
        toast({ title: '상태를 기록했어요.' });
    }
    catch (e) {
        toast({ variant: 'destructive', title: errMsg(e) });
    }
    finally {
        setBusy(false);
    } }
    const actions: Partial<Record<SupplyState, SupplyState[]>> = { needed: ['cancelled'], ordered: ['received', 'partial', 'cancelled', 'refund_pending'], partial: ['received', 'refund_pending'], received: ['refund_pending'], refund_pending: ['refunded', 'ordered', 'received'], recorded: ['ordered', 'received', 'cancelled', 'refund_pending'] };
    return <article className="s-card" data-testid={`supply-record-${r.id}`}><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{r.vendor || '구입처 미입력'}</h3><p className="mt-1 text-xs" style={{ color: 'var(--s-muted)' }}>{r.orderDate.slice(5).replace('-', '.')} · {r.staffName}</p></div><span className="s-chip on text-xs">{supplyLabels[r.status]}</span></div><p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap break-words">{r.body}</p>
 <div className="mt-3 flex justify-between items-center text-xs gap-2"><span style={{ color: 'var(--s-muted)' }}>{r.destination ? `배송지 ${r.destination}` : ''}{r.expectedDate ? ` · 도착 예정 ${r.expectedDate.slice(5)}` : ''}</span>{r.status !== 'needed' && <strong className="text-sm shrink-0">{r.amount ? `${won(r.amount)}원` : '금액 미입력'}</strong>}</div>
 {r.link && /^https?:\/\//i.test(r.link) && <a className="inline-block mt-2 text-xs underline min-h-8" href={r.link} target="_blank" rel="noopener noreferrer">구매처 열기</a>}{r.note && <p className="mt-2 text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--s-muted)' }}>{r.note}</p>}{r.receivedAt && <p className="mt-2 text-xs" style={{ color: 'var(--s-muted)' }}>입고 확인 {r.receivedBy} · {when(r.receivedAt)}</p>}
 <div className="flex flex-wrap gap-2 mt-3">{r.staffId === me && canEditSupply(r) && <button className="s-pill line" onClick={onEdit}>수정</button>}{r.status === 'needed' && <button className="s-pill" onClick={onConvert}>발주했어요</button>}{(actions[r.status] || []).map(s => <button key={s} className="s-pill line" disabled={busy} onClick={() => { setTarget(s); setNote(''); }}>{supplyLabels[s]}</button>)}</div>
 {target && <fieldset disabled={busy} className="mt-3 border-t pt-3"><p className="text-sm mb-2">‘{supplyLabels[target]}’로 기록할까요?</p><textarea className="s-input" rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder={['partial', 'cancelled', 'refund_pending', 'refunded'].includes(target) ? '누락 품목 · 취소/환불 내용을 남겨주세요 (필수)' : '전달사항 (선택)'}/><div className="flex gap-2 mt-2"><button className="s-pill" onClick={status}>확인</button><button className="s-pill line" onClick={() => setTarget(null)}>닫기</button></div></fieldset>}
 <details className="mt-3"><summary className="text-xs cursor-pointer min-h-9" style={{ color: 'var(--s-muted)' }}>기록 메뉴</summary><div className="flex flex-wrap gap-2"><button className="s-pill line" onClick={onCopy}>같은 품목 발주</button><button className="s-pill line" onClick={onTemplate}>자주 사는 품목으로 저장</button><button className="s-pill line" onClick={() => setHistory(!history)}>변경 내역</button></div>{history && (h.isError ? <StaffQueryError retry={h.refetch}/> : <div className="mt-2 text-xs space-y-2">{h.isLoading ? '불러오는 중…' : h.data?.length ? h.data.map(e => <p key={e.id} className="whitespace-pre-wrap">{supplyLabels[e.status]} · {e.staffName} · {when(e.createdAt)}<br />{e.note}</p>) : '이전 기록에는 상태 변경 내역이 없습니다.'}</div>)}</details></article>;
}
