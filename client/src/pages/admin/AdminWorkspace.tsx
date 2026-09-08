import { Link, useRoute } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { adminModules, adminNavigation } from '@/lib/admin-navigation';
import { useAuth } from '@/lib/auth';
export default function AdminWorkspace() {
 const [,params]=useRoute('/admin/workspace/:group');
 const {user}=useAuth();
 const group=adminModules.find(g=>g.id===params?.group);
 const items=adminNavigation.filter(i=>i.group===group?.id&&(!i.owner||(user as any)?.adminRole==='owner'));
 return <AdminLayout><div className="erp-page"><div className="erp-page-heading"><div><small>WORKSPACE</small><h1>{group?.label||'메뉴를 찾을 수 없습니다'}</h1></div></div><div className="erp-module-grid">{items.map(i=><Link className="erp-module" key={i.path} href={i.path}><small>{i.owner?'대표 전용':'운영'}</small><strong>{i.label}</strong><span>열기 <ArrowUpRight size={16}/></span></Link>)}</div>{group?.id==='finance'&&<p className="erp-integration">통장 내역에서 입출금을 조회하고 장부에 반영할 수 있습니다.</p>}<Link className="erp-text-link" href="/admin">오늘로 돌아가기</Link></div></AdminLayout>;
}
