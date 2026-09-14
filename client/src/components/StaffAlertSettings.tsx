import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { alertKinds, alertLabels, type AlertConfig, type AlertKind } from '@shared/staff-alerts';

const API='/api/admin/staff/alerts';
type Data={config:AlertConfig;version:number;scheduleFrom:string;templates:Partial<Record<AlertKind,{id:string;name:string;content:string;links:string[]}>>;issues:string[];staff:{id:number;name:string;phone:string;phoneReady:boolean}[];logs:{event_key:string;kind:AlertKind;staff_id:number;work_date:string;status:string;detail:string}[]};
export default function StaffAlertSettings() {
  const {user}=useAuth();
  const allowed=(user as any)?.adminRole==='owner';
  const q=useQuery<Data>({queryKey:[API],enabled:allowed});
  if(!allowed) return null;
  if(q.isError) return <p role="alert">직원 알림 설정을 불러오지 못했습니다. <button onClick={()=>q.refetch()}>다시 시도</button></p>;
  return q.data ? <SettingsForm key={q.data.version} data={q.data}/> : <p>직원 알림 설정 불러오는 중…</p>;
}
function SettingsForm({data}:{data:Data}) {
  const [draft,setDraft]=useState(data.config),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const qc=useQueryClient(),{toast}=useToast();
  const set=(patch:Partial<AlertConfig>)=>setDraft(v=>({...v,...patch}));
  async function run(path:string,method:string,body:unknown) {
    setBusy(true);setMessage('');
    try { const r=await apiRequest(method,path,body);const next=await r.json();qc.setQueryData([API],next);qc.invalidateQueries({queryKey:['/api/admin/staff/shift-hours']});toast({title:path.endsWith('/connect')?'승인 템플릿 7종을 연결했습니다.':'직원 알림 설정을 저장했습니다.'}); }
    catch(e){setMessage(errMsg(e));}finally{setBusy(false);}
  }
  async function save(enabled=draft.enabled) {
    if(enabled&&!data.config.enabled&&!confirm('발주·입고는 지금 이후의 새 처리부터, 근무 알림은 내일부터 자동으로 보냅니다. 솔라피 잔액에서 발송 비용이 차감됩니다. 시작할까요?'))return;
    await run(API,'PUT',{version:data.version,config:{...draft,enabled}});
  }
  const numberField=(key:'clockInAfter'|'clockOutAfter'|'recipeAfter'|'wasteBefore'|'productionBefore'|'snoozeMinutes'|'maxSnoozes',label:string)=><label className="grid gap-1 text-sm" key={key}>{label}<Input aria-label={label} type="number" min={0} max={key==='maxSnoozes'?4:240} value={draft[key]} onChange={e=>set({[key]:Number(e.target.value)})}/></label>;
  const connected=alertKinds.filter(k=>data.templates[k]).length;
  return <section className="rounded-lg border bg-card p-5 space-y-4" data-testid="staff-alert-settings">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">직원 · 발주 알림</h2><p className="mt-1 text-sm text-muted-foreground">템플릿 {connected}/7 연결 · 자동 발송 {data.config.enabled?'사용 중':'꺼짐'}</p></div><Button disabled={busy} variant="outline" onClick={()=>run(API+'/connect','POST',{version:data.version})} data-testid="connect-staff-templates">승인 템플릿 연결</Button></div>
    {message&&<p role="alert" className="text-sm text-red-600">{message}</p>}
    {data.issues.length>0&&<ul className="list-disc pl-5 text-sm text-amber-700">{data.issues.map((m,i)=><li key={i}>{m}</li>)}</ul>}
    <p className="text-sm text-muted-foreground">해당 근무일에 기록이 없을 때만 안내합니다. 문자 대체 발송은 사용하지 않습니다.</p>
    <div className="grid gap-2 sm:grid-cols-2">{alertKinds.map(k=><label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.events[k]} onChange={e=>set({events:{...draft.events,[k]:e.target.checked}})}/>{alertLabels[k]}<span className="text-xs text-muted-foreground">{data.templates[k]?'연결됨':'미연결'}</span></label>)}</div>
    <details className="border-t pt-3" open={!draft.recipients.length}><summary className="cursor-pointer text-sm font-medium">발주·입고 수신자</summary><p className="my-2 text-xs text-muted-foreground">이강민·박대건 계정을 연결하고, 직원 정보에 등록된 번호를 사용합니다.</p><div className="flex flex-wrap gap-3">{data.staff.map(p=><label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.recipients.includes(p.id)} onChange={e=>set({recipients:e.target.checked?[...draft.recipients,p.id]:draft.recipients.filter(id=>id!==p.id)})}/>{p.name} {!p.phoneReady&&<span className="text-red-600">번호 확인 필요</span>}</label>)}</div></details>
    <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">근무 시간 · 알림 시점 조절</summary><p className="my-3 text-sm text-muted-foreground">근무표에서 따로 지정한 시간이 우선입니다. 아래 기본 시간을 바꾸면 시간이 따로 지정되지 않은 근무와 알림에 함께 적용됩니다.</p>
      <div className="grid gap-5 md:grid-cols-2">{(['weekday','weekend'] as const).map(type=><div key={type}><h3 className="mb-2 text-sm font-semibold">{type==='weekday'?'주중':'주말·공휴일'}</h3>{(['Open','Baker','Close','Part'] as const).map(slot=><div key={slot} className="mb-2 grid grid-cols-[60px_1fr_1fr] items-center gap-2 text-sm"><span>{slot}</span>{(['start','end'] as const).map(side=><Input key={side} aria-label={`${type} ${slot} ${side}`} type="time" value={draft[type][slot][side]} onChange={e=>set({[type]:{...draft[type],[slot]:{...draft[type][slot],[side]:e.target.value}}})}/>)}</div>)}</div>)}</div>
      <p className="my-2 text-xs text-muted-foreground">Close 두 명은 같은 기본 시간을 씁니다. Part는 우선 12:00–15:00입니다.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{numberField('clockInAfter','출근 예정 후 (분)')}{numberField('clockOutAfter','퇴근 예정 후 (분)')}{numberField('recipeAfter','Open 시작 후 레시피 확인 (분)')}{numberField('wasteBefore','Close 종료 전 폐기 확인 (분)')}{numberField('productionBefore','Baker 종료 전 생산 확인 (분)')}{numberField('snoozeMinutes','아직 근무 중: 재알림 간격 (분)')}{numberField('maxSnoozes','하루 재알림 최대 횟수')}</div>
      <label className="mt-4 grid gap-1 text-sm">공휴일 목록 (한 줄에 YYYY-MM-DD)<textarea className="min-h-32 rounded-md border bg-background p-2" defaultValue={draft.holidays.join('\n')} onBlur={e=>set({holidays:e.target.value.split(/[\s,]+/).filter(Boolean)})}/></label><label className="mt-2 grid gap-1 text-sm">공휴일을 확인한 연도 (쉼표 구분)<Input defaultValue={draft.holidayYears.join(', ')} onBlur={e=>set({holidayYears:e.target.value.split(/[\s,]+/).filter(Boolean).map(Number)})}/></label><p className="mt-2 text-xs text-muted-foreground">2026년 9월 이후 공휴일이 입력돼 있습니다. 새해·임시공휴일은 목록을 확인해 추가해 주세요. 확인하지 않은 연도에는 근무 알림을 보내지 않습니다.</p>
    </details>
    <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">직원 연락처 · 연결 문구 확인</summary><a className="my-2 block text-sm underline" href="#/admin/staff">직원 정보에서 휴대전화번호 수정</a>{data.staff.map(p=><p className="text-sm" key={p.id}>{p.name} · {p.phoneReady?p.phone:'번호 미등록 또는 오류'}</p>)}{alertKinds.map(k=><details className="mt-3 text-sm" key={k}><summary className="cursor-pointer">{alertLabels[k]}</summary><p className="my-2 whitespace-pre-wrap">{data.templates[k]?.content||'연결 전'}</p>{data.templates[k]?.links.map((url,i)=><a className="block break-all underline" key={i} href={url} target="_blank" rel="noreferrer">버튼 주소: {url}</a>)}</details>)}</details>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>save()} disabled={busy} data-testid="save-staff-alerts">설정 저장</Button>{!data.config.enabled?<Button disabled={busy||connected!==7} onClick={()=>save(true)} data-testid="enable-staff-alerts">자동 발송 시작</Button>:<Button variant="outline" disabled={busy} onClick={()=>save(false)}>자동 발송 중지</Button>}</div>
    {data.config.enabled&&<p className="text-xs text-muted-foreground">근무 알림 시작일: {data.scheduleFrom}. 발송 시점의 최신 근무표와 기록을 확인합니다.</p>}
    <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">직원 알림 처리 기록 ({data.logs.length})</summary><p className="my-2 text-xs text-muted-foreground">접수는 솔라피에 전달된 상태입니다. 실제 도착 여부는 솔라피 발송 내역에서 확인합니다. 결과가 불명확한 건은 자동 재발송하지 않습니다.</p>{!data.logs.length?<p className="text-sm">아직 발송한 알림이 없습니다.</p>:data.logs.map(r=><p className="border-b py-2 text-sm" key={r.event_key}>{r.work_date} · {data.staff.find(p=>p.id===r.staff_id)?.name||'직원'} · {alertLabels[r.kind]} · {{pending:'대기',sending:'접수 중',accepted:'접수됨',unknown:'결과 확인 필요',skipped:'보내지 않음',cancelled:'중지'}[r.status]||r.status}<br/><span className="text-muted-foreground">{r.detail}</span></p>)}</details>
  </section>;
}
