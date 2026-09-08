import { useState, type ReactNode } from 'react';
export function AdminFold({id,title='안내 보기',children}:{id:string;title?:string;children:ReactNode}){
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem('knit-fold:'+id)==='open';}catch{return false;}});
 return <details className="admin-fold" open={open} onToggle={e=>{const value=e.currentTarget.open;setOpen(value);try{localStorage.setItem('knit-fold:'+id,value?'open':'closed');}catch{}}}><summary>{title}</summary><div className="admin-fold-content">{children}</div></details>;
}
