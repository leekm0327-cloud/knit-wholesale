import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/lib/auth';
import {apiRequest} from '@/lib/queryClient';
import {errMsg} from '@/lib/format';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {defaultShiftTypes,visibleShiftTypes,type ShiftType} from '@shared/shift-types';
export function useShiftTypes(admin=true,shifts:{position:string}[]=[]){
 const q=useQuery<{types:ShiftType[];version:number}>({queryKey:[admin?'/api/admin/staff/shift-types':'/api/staff/shift-types']});
 const types=q.data?.types??defaultShiftTypes;return {...q,types,visible:visibleShiftTypes(types,shifts),label:(id:string)=>types.find(t=>t.id===id)?.label||id};
}
export default function ShiftTypesEditor(){
 const {user}=useAuth(),q=useShiftTypes(),qc=useQueryClient();
 const [draft,setDraft]=useState<ShiftType[]|null>(null),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(user?.adminRole!=='owner')return null;
 const edit=(id:string,patch:Partial<ShiftType>)=>setDraft(rows=>rows!.map(t=>t.id===id?{...t,...patch}:t));
 async function save(){setBusy(true);setMessage('');try{await apiRequest('PUT','/api/admin/staff/shift-types',{types:draft,version});await qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).includes('/staff/')});setDraft(null);setMessage('시프트와 주중·주말 시간을 저장했습니다.');}catch(e){setMessage(errMsg(e));}finally{setBusy(false);}}
 return <details className="my-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">시프트 관리 · 이름·개수·주중/주말 시간</summary><p className="my-3 text-sm">주말 시간은 토·일요일과 등록된 공휴일에 적용됩니다. 시간 변경은 오늘 이후 기본 시간에 적용되며, 날짜별로 지정한 시간은 유지합니다. 지난 근무 기록과 급여 계약은 변경하지 않습니다.</p>
 {q.isError&&<p role="alert">시프트 설정을 불러오지 못했습니다.</p>}
 {!draft?<><div className="space-y-2">{q.types.map(t=><p className="text-sm" key={t.id}>{t.label} · {t.enabled?'사용 중':'사용 중지'} · 주중 {t.weekday.start}–{t.weekday.end} / 주말 {t.weekend.start}–{t.weekend.end}</p>)}</div><Button className="mt-3" disabled={!q.data} onClick={()=>{setDraft(structuredClone(q.types));setVersion(q.data!.version);setMessage('');}}>시프트 설정 수정</Button></>:<fieldset disabled={busy} className="space-y-4">{draft.map(t=><div key={t.id} className="border-t pt-3 space-y-2"><div className="flex flex-wrap gap-3 items-center"><Input aria-label={`${t.id} 이름`} className="w-40" value={t.label} onChange={e=>edit(t.id,{label:e.target.value})}/><label className="text-sm"><input type="checkbox" checked={t.enabled} onChange={e=>edit(t.id,{enabled:e.target.checked})}/> 사용</label><select aria-label={`${t.id} 알림 역할`} className="border rounded p-2" value={t.role} onChange={e=>edit(t.id,{role:e.target.value as ShiftType['role']})}><option value="none">출퇴근 알림만</option><option value="recipe">레시피 기록 확인</option><option value="production">생산량 기록 확인</option><option value="waste">폐기량 기록 확인</option></select></div><div className="flex flex-wrap gap-4">{(['weekday','weekend'] as const).map(day=><div key={day} className="flex items-center gap-2 text-sm"><span>{day==='weekday'?'주중':'주말·공휴일'}</span>{(['start','end'] as const).map(side=><Input key={side} aria-label={`${t.id} ${day} ${side}`} className="w-32" type="time" value={t[day][side]} onInput={e=>edit(t.id,{[day]:{...t[day],[side]:e.currentTarget.value}})} onChange={e=>edit(t.id,{[day]:{...t[day],[side]:e.target.value}})}/>)}</div>)}</div></div>)}<p className="text-xs text-muted-foreground">‘사용’을 끄면 새 배정에서 제외됩니다. 이미 배정된 근무는 남으므로 필요하면 근무표에서 비워 주세요.</p><div className="flex gap-2 flex-wrap"><Button variant="outline" disabled={draft.length>=30} onClick={()=>setDraft([...draft,{...structuredClone(defaultShiftTypes[4]),id:'Shift_'+crypto.randomUUID().replaceAll('-',''),label:'새 시프트'}])}>시프트 추가</Button><Button onClick={save}>설정 저장</Button><Button variant="ghost" onClick={()=>setDraft(null)}>취소</Button></div></fieldset>}{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</details>;
}
