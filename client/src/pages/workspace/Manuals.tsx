import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { errMsg } from '@/lib/format';
import { FeatureShell, LoadState } from './FeatureUI';
import type { Manual } from '@shared/workspace-features';
const categories=['음료 레시피','디저트 레시피','오픈·마감','장비·청소','응대·기타'];
export default function Manuals({staff=false}:{staff?:boolean}){
 const q=useQuery<Manual[]>({queryKey:[staff?'/api/staff/manuals':'/api/admin/manuals'],staleTime:0,refetchInterval:60000});const {toast}=useToast();
 const [search,setSearch]=useState(''),[category,setCategory]=useState('전체'),[selected,setSelected]=useState<number|null>(null),[editor,setEditor]=useState<Partial<Manual>|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!editor)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[!!editor]);
 const current=q.data?.find(m=>m.id===selected);
 const change=(p:Partial<Manual>)=>setEditor(v=>({...v,...p}));
 async function save(){if(!editor||busy)return;setBusy(true);try{await apiRequest(editor.id?'PUT':'POST','/api/admin/manuals'+(editor.id?'/'+editor.id:''),{...editor,published:!!editor.published});setEditor(null);await q.refetch();toast({title:'매뉴얼을 저장했어요.'});}catch(e){toast({variant:'destructive',title:errMsg(e)});}finally{setBusy(false);}}
 return <FeatureShell staff={staff} title="레시피 · 업무 매뉴얼"><LoadState query={q}/>
 {!staff&&!editor&&<div className="f-actions"><button className="f-primary" onClick={()=>setEditor({title:'',body:'',category:categories[0],published:0})}>새 매뉴얼 작성</button></div>}
 {editor?<section className="f-card"><h2>{editor.id?'매뉴얼 수정':'새 매뉴얼'}</h2><fieldset disabled={busy}><label>제목<input maxLength={100} value={editor.title||''} onChange={e=>change({title:e.target.value})}/></label><label>분류<select value={editor.category} onChange={e=>change({category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>내용<textarea aria-label="내용" rows={14} maxLength={20000} value={editor.body||''} onChange={e=>change({body:e.target.value})} placeholder={'재료·용량\n제조 순서\n주의사항'}/></label><label><input type="checkbox" checked={!!editor.published} onChange={e=>change({published:+e.target.checked})}/>직원에게 공개</label><p className="f-muted">공개하지 않은 문서는 관리자만 볼 수 있습니다. 공개를 해제하면 직원 목록에서 숨겨집니다.</p><div className="f-actions"><button className="f-primary" onClick={save}>{busy?'저장 중…':'저장'}</button><button onClick={()=>{if(confirm('작성 중인 내용을 닫을까요?'))setEditor(null);}}>취소</button></div></fieldset></section>:<>
 <section className="f-card"><input aria-label="매뉴얼 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="제목 · 재료 · 작업명 검색"/><div className="f-actions">{['전체',...categories].map(c=><button aria-pressed={category===c} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div>{!q.isPending&&!q.isError&&!(q.data||[]).some(m=>(category==='전체'||m.category===category)&&(m.title+' '+m.body).toLowerCase().includes(search.toLowerCase()))&&<p className="f-muted">{staff?'공개된 매뉴얼이 없거나 검색 결과가 없습니다.':'등록된 매뉴얼이 없거나 검색 결과가 없습니다. 실제 레시피와 작업 방법을 작성해 주세요.'}</p>}{q.data?.filter(m=>(category==='전체'||m.category===category)&&(m.title+' '+m.body).toLowerCase().includes(search.toLowerCase())).map(m=><div className="f-row" key={m.id}><button onClick={()=>setSelected(m.id)}>{m.title}</button><p className="f-muted">{m.category} · {staff?'':m.published?'공개 · ':'비공개 · '}수정 {new Date(m.updatedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</p></div>)}</section>
 {current&&<article className="f-card"><h2>{current.title}</h2><div className="f-actions">{!staff&&<button onClick={()=>setEditor({...current})}>수정 · 공개 설정</button>}<button onClick={()=>setSelected(null)}>본문 닫기</button></div><div className="f-doc">{current.body}</div></article>}</>}
 </FeatureShell>;
}
export function StaffManuals(){return <Manuals staff/>;}
