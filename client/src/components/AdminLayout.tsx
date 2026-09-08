import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Wordmark } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useChatAlert } from "@/hooks/use-chat-alert";
import { adminModules, adminNavigation, activeAdminItem, moduleHref } from "@/lib/admin-navigation";
import type { Order } from "@shared/schema";
import { LayoutDashboard, ShoppingCart, Package, Store, Users, Wallet, Settings, Search, Menu, LogOut, Loader2, ExternalLink } from "lucide-react";
import "./admin-erp.css";
const icons = [LayoutDashboard, ShoppingCart, Package, Store, Users, Wallet, Settings];
export function AdminLayout({ children }: { children: React.ReactNode }) {
 const { user, isLoading, authUnknown, logout } = useAuth();
 const [location, navigate] = useLocation();
 const [mobileOpen, setMobileOpen] = useState(false);
 const [searchOpen,setSearchOpen] = useState(false);
 const [search,setSearch] = useState('');
 const isOwner = (user as any)?.adminRole === 'owner';
 const items = adminNavigation.filter(i=>!i.owner || isOwner);
 const active = activeAdminItem(location);
 const groupId = location === '/admin' ? 'today' : location.startsWith('/admin/workspace/') ? location.split('/').pop() : active?.group;
 const group = adminModules.find(g=>g.id===groupId);
 useEffect(()=>{setMobileOpen(false);setSearchOpen(false);},[location]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(v=>!v);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  // 관리자 가드
  // 서버에 물어보지 못한 상태(authUnknown)에서는 튕겨내지 않는다.
  // 일시적인 통신 오류를 "로그아웃"으로 처리하면, 세션이 멀쩡한데도 매번 다시 로그인하게 된다.
  useEffect(() => {
    if (!isLoading && !authUnknown && (!user || user.role !== "admin")) {
      navigate("/admin/login");
    }
  }, [isLoading, authUnknown, user, navigate]);

  // 미처리 주문 수 (배지)
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    enabled: !!user && user.role === "admin",
    refetchInterval: 30000,
  });
  const pendingCount = (orders ?? []).filter((o) => o.status === "pending").length;

  // 거래처 채팅 미읽음 수 (배지)
  const { data: chatUnread } = useQuery<{ unread: number }>({
    queryKey: ["/api/admin/chat/unread-count"],
    enabled: !!user && user.role === "admin",
    refetchInterval: 30000,
  });
  const chatUnreadCount = chatUnread?.unread ?? 0;

  // 연차 승인 대기 건수 (배지)
  const { data: leavePending } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/staff/leave/pending-count"],
    enabled: !!user && user.role === "admin",
    refetchInterval: 60000,
  });
  const leavePendingCount = leavePending?.count ?? 0;

  // 거래처가 보낸 새 메시지 도착 시 관리자에게 알림
  useChatAlert(chatUnread?.unread, {
    title: "거래처 새 메시지",
    body: "거래처가 채팅 메시지를 보냈어요. 눌러서 확인하세요.",
    onClick: () => navigate("/admin/chat"),
  });

  if (authUnknown) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-foreground">서버에 연결하지 못했습니다.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          로그인이 풀린 것이 아니라 잠시 통신이 되지 않는 상태입니다. 잠시 뒤 다시 시도해 주세요.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()} data-testid="button-auth-retry">
          다시 시도
        </Button>
      </div>
    );
  }

  if (isLoading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }


 const navigation = <nav aria-label="업무 메뉴" className="erp-nav">{adminModules.map((g,index)=>{const Icon=icons[index];const badge=g.id==='sales'?pendingCount+chatUnreadCount:g.id==='people'?leavePendingCount:0;return <Link key={g.id} href={moduleHref(g.id)} aria-current={g.id===groupId?'page':undefined} className={g.id===groupId?'active':''}><Icon size={16}/><span>{g.label}</span>{badge>0&&<b>{badge}</b>}</Link>;})}</nav>;
 const footer = <div className="erp-rail-footer"><a href="/#/catalog" target="_blank" rel="noopener noreferrer">주문 사이트 <ExternalLink size={13}/></a><small>{user.managerName} · {isOwner?'Owner':'Manager'}</small><button onClick={async()=>{await logout();navigate('/admin/login');}}><LogOut size={14}/>로그아웃</button></div>;
 const brand = <div className="erp-brand"><Wordmark size={28}/><span>KNIT COFFEE · WORKSPACE</span><div className="erp-workspace">니트커피<small>운영 관리</small></div></div>;
 return <div className="erp-admin erp-shell">
  <aside className="erp-rail print:hidden">{brand}{navigation}{footer}</aside>
  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="erp-admin erp-mobile-menu"><SheetTitle className="sr-only">관리자 메뉴</SheetTitle>{brand}{navigation}{footer}</SheetContent></Sheet>
  <div className="erp-body"><header className="erp-topbar print:hidden"><button className="erp-mobile-toggle" aria-label="메뉴 열기" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="erp-breadcrumb"><Link href="/admin">Workspace</Link><span>/</span><Link href={moduleHref(groupId||'today')}>{group?.label||'관리자'}</Link>{active&&<><span>/</span><strong>{active.label}</strong></>}</div><button className="erp-search-trigger" onClick={()=>{setSearch('');setSearchOpen(true);}} aria-label="메뉴 검색"><Search size={15}/><span>메뉴 검색</span><kbd>⌘ K</kbd></button><NotificationBell/></header>
  {groupId&&groupId!=='today'&&<nav className="erp-subnav print:hidden" aria-label="세부 메뉴">{items.filter(i=>i.group===groupId).map(i=><Link key={i.path} href={i.path} aria-current={active?.path===i.path?'page':undefined}>{i.label}</Link>)}</nav>}
  <main className="min-w-0">{children}</main></div>
  <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="erp-admin erp-search-dialog" aria-describedby={undefined}><DialogTitle>메뉴 검색</DialogTitle><input autoFocus aria-label="메뉴 이름" placeholder="주문, 재고, 직원, 정산…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="erp-search-results">{items.filter(i=>i.label.replaceAll(' ','').includes(search.replaceAll(' ',''))).map(i=><Link key={i.path} href={i.path} onClick={()=>setSearchOpen(false)}>{i.label}<small>{adminModules.find(g=>g.id===i.group)?.label}</small></Link>)}{!items.some(i=>i.label.replaceAll(' ','').includes(search.replaceAll(' ','')))&&<p>일치하는 메뉴가 없습니다.</p>}</div></DialogContent></Dialog>
 </div>;
}
