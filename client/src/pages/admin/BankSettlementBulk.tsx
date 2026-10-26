import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
type Candidate = {
    bankId: number;
    account: string;
    remark: string;
    token: string;
};
type Preview = {
    previewId: string;
    from: string;
    to: string;
    total: number;
    excluded: Record<string, number>;
    rules: {
        bankId: number;
        account: string;
        remark: string;
        count: number;
    }[];
};
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export default function BankSettlementBulk({ base, candidates, onChange }: {
    base: string;
    candidates: Candidate[];
    onChange: () => Promise<unknown>;
}) {
    const [search, setSearch] = useState(''), [selected, setSelected] = useState<number[]>([]), [from, setFrom] = useState(() => today().slice(0, 8) + '01'), [to, setTo] = useState(today), [preview, setPreview] = useState<Preview | null>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(''), [pending, setPending] = useState<{
        previewId: string;
        requestKey: string;
    } | null>(null);
    const lock = useRef(false);
    const visible = candidates.filter(c => (c.remark + ' ' + c.account).toLowerCase().includes(search.toLowerCase()));
    const chosen = candidates.filter(c => selected.includes(c.bankId)), hidden = chosen.filter(c => !visible.includes(c)).length;
    const signature = JSON.stringify([from, to, chosen.map(c => [c.bankId, c.token]).sort((a, b) => Number(a[0]) - Number(b[0]))]);
    const signatureRef = useRef('');
    const validPreview = preview && signatureRef.current === signature;
    const button = 'border px-3 py-2 min-h-11 text-sm disabled:opacity-50';
    function invalidate() { setPreview(null); setChecked(false); setError(''); setResult(''); }
    async function task(fn: () => Promise<void>) { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); try {
        await fn();
    }
    catch (e: any) {
        setError(e.message || '처리하지 못했습니다.');
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    async function finish(r: {
        activated: number;
        classified: number;
        reused?: number;
    }) { setPending(null); setPreview(null); setChecked(false); setSelected([]); setResult(`새 규칙 ${r.activated}개 확인 · 기존 규칙 ${r.reused??0}개 적용 · 미처리 ${r.classified}건 분류 완료`); await onChange(); }
    async function apply() {
        const p = pending || { previewId: preview!.previewId, requestKey: crypto.randomUUID() };
        setPending(p);
        try {
            const r = await apiRequest('POST', base + '/settlement-bulk/apply', { ...p, confirmCardSettlement: true });
            await finish(await r.json());
        }
        catch (e: any) {
            // A lost response must not generate a second request key or discard the review.
            try {
                const response = await apiRequest('GET', base + '/settlement-bulk/result/' + p.requestKey);
                const status = await response.json();
                if (status.status === 'completed') {
                    await finish(status.result);
                    return;
                }
                if (/^4\d\d:/.test(e.message)) {
                    setPending(null);
                    invalidate();
                }
            }
            catch { /* Preserve the key until a result check succeeds. */ }
            throw e;
        }
    }
    return <section data-testid="settlement-bulk" className="border-t py-3">
 <h3 className="font-medium">규칙 일괄 확인 · 기존 내역 적용</h3>
 <p className="text-muted-foreground my-2">신규 후보와 기존 활성 규칙을 선택할 수 있습니다. 중지·충돌 규칙은 제외합니다.</p>
 <label className="block my-2">규칙 검색<input className="border p-2 w-full min-h-11" value={search} disabled={busy || !!pending} onChange={e => setSearch(e.target.value)} placeholder="적요 · 계좌 끝자리"/></label>
 <div className="flex flex-wrap items-center gap-3"><label className="flex gap-2 items-center min-h-11"><input type="checkbox" disabled={busy || !!pending || !visible.length} checked={!!visible.length && visible.every(c => selected.includes(c.bankId))} onChange={e => { invalidate(); setSelected(e.target.checked ? Array.from(new Set([...selected, ...visible.map(c => c.bankId)])) : selected.filter(id => !visible.some(c => c.bankId === id))); }}/>검색 결과 전체 선택 ({visible.length})</label><span>선택 {chosen.length}개{hidden > 0 && ` · 검색 밖 ${hidden}개`}</span><button className={button} disabled={busy || !!pending} onClick={() => { setSelected([]); invalidate(); }}>선택 해제</button></div>
 {visible.map(c => <label key={c.bankId} className="flex items-center gap-3 border-t py-2 min-h-11"><input aria-label={c.remark + ' ' + c.account} type="checkbox" disabled={busy || !!pending} checked={selected.includes(c.bankId)} onChange={e => { invalidate(); setSelected(e.target.checked ? [...selected, c.bankId] : selected.filter(id => id !== c.bankId)); }}/><span className="min-w-0 break-all">{c.remark} <span className="text-muted-foreground">{c.account} · 입금 · {c.bankId<0?'기존 활성':'신규 후보'}</span></span></label>)}
 {!visible.length && <p className="py-2">검색 결과가 없습니다.</p>}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">{([['시작일', from, setFrom], ['종료일', to, setTo]] as const).map(([label, value, set]) => <label className="min-w-0" key={label}>{label} (한국 시간)<input type="date" className="block border p-2 min-h-11 w-full min-w-0" value={value} disabled={busy || !!pending} onChange={e => { set(e.target.value); invalidate(); }}/></label>)}</div>
 <p className="text-muted-foreground my-2">지정 기간의 전체 미처리 중 선택 규칙과 일치하는 내역에 적용합니다. 현재 거래 목록의 페이지·필터와 무관합니다.</p>
 <button className={button} disabled={busy || !!pending || !chosen.length || chosen.length > 100 || !from || !to || from > to} onClick={() => task(async () => { setPreview(null); setChecked(false); const r = await apiRequest('POST', base + '/settlement-bulk/preview', { from, to, candidates: chosen.filter(c=>c.bankId>0).map(({ bankId, token }) => ({ bankId, token })), activeRules: chosen.filter(c=>c.bankId<0).map(c=>({id:-c.bankId,version:Number(c.token)})) }); signatureRef.current = signature; setPreview(await r.json()); })}>{busy ? '확인 중…' : '대상 미리보기'}</button>
 {validPreview && <div data-testid="bulk-preview" className="bg-muted p-3 mt-3 break-words"><p>{preview.from} ~ {preview.to} · 적용 대상 {preview.total}건</p>{preview.rules.map(r => <p className="break-all py-1" key={r.bankId}>{r.remark} · {r.account} · {r.count}건</p>)}{Object.entries(preview.excluded).map(([reason, count]) => <p className="text-muted-foreground" key={reason}>제외: {reason} {count}건</p>)}{preview.total === 0 && <p>기존 분류 대상은 없습니다. 확인한 규칙은 이후 신규 내역에 적용됩니다.</p>}<label className="flex items-start gap-2 py-3"><input type="checkbox" className="mt-1" checked={checked} disabled={busy || !!pending} onChange={e => setChecked(e.target.checked)}/>선택한 적요가 매장 카드 정산 입금임을 확인했습니다. 신규 후보 활성화와 위 내역 분류에 동의합니다. 기존 활성 규칙은 그대로 유지합니다.</label><button className={button + ' bg-black text-white'} disabled={busy || !checked || !!pending} onClick={() => task(apply)}>확인 및 적용</button><button className={button} disabled={busy||!!pending} onClick={invalidate}>미리보기 취소</button><p className="text-muted-foreground mt-2">매출·수금 금액은 바뀌지 않습니다. 검토 후 내역이 바뀌면 다시 확인합니다.</p></div>}
 {pending && <div className="mt-3" role="status"><p>처리 결과 확인이 필요합니다. 같은 요청 키로 결과를 확인하고 미완료인 경우에만 재시도합니다.</p><button className={button} disabled={busy} onClick={() => task(async () => { const r = await apiRequest('GET', base + '/settlement-bulk/result/' + pending.requestKey); const s = await r.json(); if (s.status === 'completed')
        await finish(s.result);
    else
        await apply(); })}>결과 확인 · 재시도</button></div>}
 {error && <p role="alert" className="my-2 break-all">{error}</p>}{result && <p role="status" className="my-2">{result}</p>}
 </section>;
}
