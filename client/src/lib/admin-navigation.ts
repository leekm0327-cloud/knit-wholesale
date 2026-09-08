export const adminModules = [
  {
    "id": "today",
    "label": "오늘"
  },
  {
    "id": "sales",
    "label": "영업 · 거래처"
  },
  {
    "id": "purchase",
    "label": "구매 · 재고"
  },
  {
    "id": "store",
    "label": "매장 운영"
  },
  {
    "id": "people",
    "label": "직원 · 근무"
  },
  {
    "id": "finance",
    "label": "재무 · 정산"
  },
  {
    "id": "settings",
    "label": "설정 · 연동"
  }
];
export const adminNavigation = [
 {path:"/admin/operations-calendar",label:"운영 캘린더",owner:false,group:"store"},
 {path:"/admin/manuals",label:"레시피·매뉴얼",owner:false,group:"store"},
 {path:"/admin/store-performance",label:"매장 성과 요약",owner:true,group:"store"},
  {
    "path": "/admin/order-summary",
    "label": "도매 주문 요약",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/orders",
    "label": "주문 관리",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/products",
    "label": "상품 관리",
    "owner": false,
    "group": "settings"
  },
  {
    "path": "/admin/product-categories",
    "label": "상품 카테고리",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/customers",
    "label": "거래처 관리",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/customer-activity",
    "label": "미주문 거래처",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/chat",
    "label": "거래처 채팅",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/transactions",
    "label": "거래내역서",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/quotes",
    "label": "견적서",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/balances",
    "label": "채권 관리",
    "owner": false,
    "group": "finance"
  },
  {
    "path": "/admin/suppliers",
    "label": "공급처 관리",
    "owner": false,
    "group": "purchase"
  },
  {
    "path": "/admin/purchases",
    "label": "발주 관리",
    "owner": false,
    "group": "purchase"
  },
  {
    "path": "/admin/supplier-payments",
    "label": "공장 지급",
    "owner": false,
    "group": "finance"
  },
  {
    "path": "/admin/supplier-balances",
    "label": "공장 채무",
    "owner": false,
    "group": "finance"
  },
  {
    "path": "/admin/dashboard-pnl",
    "label": "경영 대시보드",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/financials",
    "label": "재무제표",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/store-sales",
    "label": "기타매출",
    "owner": true,
    "group": "store"
  },
  {
    "path": "/admin/pos-sales",
    "label": "POS 매출 분석",
    "owner": true,
    "group": "store"
  },
  {
    "path": "/admin/money",
    "label": "지출·가계부",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/expense-import",
    "label": "지출 불러오기",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/expense-cleanup",
    "label": "지출 재분류",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/expense-duplicates",
    "label": "지출 중복 정리",
    "owner": true,
    "group": "finance"
  },
  {
    "path": "/admin/fixed-cost-items",
    "label": "고정비 항목",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/espresso",
    "label": "에스프레소 로그",
    "owner": false,
    "group": "store"
  },
  {
    "path": "/admin/news",
    "label": "소식",
    "owner": false,
    "group": "store"
  },
  {
    "path": "/admin/popup-notices",
    "label": "팝업 공지",
    "owner": false,
    "group": "store"
  },
  {
    "path": "/admin/board",
    "label": "게시판",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/inquiries",
    "label": "문의",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/visit-setups",
    "label": "방문 세팅",
    "owner": false,
    "group": "sales"
  },
  {
    "path": "/admin/staff",
    "label": "직원 계정",
    "owner": false,
    "group": "people"
  },
  {
    "path": "/admin/staff/attendance",
    "label": "근태 현황",
    "owner": false,
    "group": "people"
  },
  {
    "path": "/admin/staff/schedule",
    "label": "근무 스케줄",
    "owner": false,
    "group": "people"
  },
  {
    "path": "/admin/staff/handover",
    "label": "인수인계·일정",
    "owner": false,
    "group": "store"
  },
  {
    "path": "/admin/staff/supply",
    "label": "발주 기록",
    "owner": false,
    "group": "purchase"
  },
  {
    "path": "/admin/staff/notices",
    "label": "직원 공지",
    "owner": false,
    "group": "people"
  },
  {
    "path": "/admin/staff/leave",
    "label": "연차 관리",
    "owner": false,
    "group": "people"
  },
  {
    "path": "/admin/staff/logs",
    "label": "직원 기록",
    "owner": false,
    "group": "store"
  },
  {
    "path": "/admin/ecount",
    "label": "ECOUNT 연동",
    "owner": false,
    "group": "settings"
  },
  {
    "path": "/admin/ecount-logs",
    "label": "ECOUNT 로그",
    "owner": false,
    "group": "settings"
  },
  {
    "path": "/admin/kakao",
    "label": "카카오 알림",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/alimtalk",
    "label": "알림톡",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/managers",
    "label": "매니저",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/activity-logs",
    "label": "활동 로그",
    "owner": false,
    "group": "settings"
  },
  {
    "path": "/admin/automation",
    "label": "자동화",
    "owner": true,
    "group": "settings"
  },
  {
    "path": "/admin/backup",
    "label": "백업",
    "owner": true,
    "group": "settings"
  }
];
export function activeAdminItem(location: string) {
  return [...adminNavigation].sort((a,b)=>b.path.length-a.path.length).find(i=>location===i.path || location.startsWith(i.path+'/'));
}
export const moduleHref = (id: string) => id === 'today' ? '/admin' : '/admin/workspace/'+id;
