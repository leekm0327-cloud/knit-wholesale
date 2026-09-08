import { AdminLayout } from '@/components/AdminLayout';
import { StaffLayout } from '@/components/StaffLayout';
import './features.css';
export function FeatureShell({staff=false,title,children}:{staff?:boolean;title:string;children:React.ReactNode}) {return staff?<StaffLayout title={title} subtitle="매장 운영"><div className="feature-page">{children}</div></StaffLayout>:<AdminLayout><div className="erp-page feature-page"><h1 className="mb-6">{title}</h1>{children}</div></AdminLayout>;}
export function LoadState({query}:{query:{isPending:boolean;isError:boolean;refetch:()=>unknown}}){return query.isError?<div className="f-card" role="alert">불러오지 못했어요. <button onClick={()=>query.refetch()}>다시 시도</button></div>:query.isPending?<p className="f-card">불러오는 중…</p>:null;}
export const monthNow=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,7);
export function monthRange(month:string){const [y,m]=month.split('-').map(Number);return {from:month+'-01',to:month+'-'+new Date(Date.UTC(y,m,0)).getUTCDate()};}
