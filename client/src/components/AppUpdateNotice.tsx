import {useEffect,useState} from 'react';
// Only notify; never discard an open form by automatically reloading.
export function AppUpdateNotice(){
 const [available,setAvailable]=useState(false);
 useEffect(()=>{
  const current=Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map(s=>s.src).find(s=>s.includes('/assets/index-'));
  if(!current)return;
  let stopped=false,pending=false,last=0;
  const check=async()=>{if(stopped||pending||document.visibilityState!=='visible'||Date.now()-last<60000)return;pending=true;last=Date.now();try{
   const response=await fetch(window.location.pathname,{cache:'no-store',headers:{Accept:'text/html'}});
   if(!response.ok)return;
   const doc=new DOMParser().parseFromString(await response.text(),'text/html');
   const src=Array.from(doc.querySelectorAll('script[src]')).map(s=>s.getAttribute('src')).find(s=>s?.includes('/assets/index-'));
   if(!stopped&&src&&new URL(src,window.location.href).href!==current)setAvailable(true);
  }catch{/* offline: retain current screen */}finally{pending=false;}};
  void check(); const timer=window.setInterval(check,60000);
  window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
 },[]);
 if(!available)return null;
 return <div role="status" className="no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,520px)] rounded border bg-background p-4 shadow-lg text-sm">새 기능이 업데이트되었습니다. 작성 중인 내용을 저장한 뒤 새로고침해 주세요.<button className="ml-3 underline font-semibold" onClick={()=>window.location.reload()}>새로고침</button></div>;
}
