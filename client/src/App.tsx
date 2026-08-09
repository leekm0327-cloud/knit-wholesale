import { useEffect } from "react";
import { Switch, Route, Router, useLocation, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Inquiry from "@/pages/Inquiry";
import Espresso from "@/pages/Espresso";
import VisitSetup from "@/pages/VisitSetup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Board from "@/pages/Board";
import News from "@/pages/News";
import NewsDetail from "@/pages/NewsDetail";
import Cart from "@/pages/Cart";
import SampleRequest from "@/pages/SampleRequest";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Account from "@/pages/Account";
import InvoicePage from "@/pages/InvoicePage";
import Chat from "@/pages/Chat";
import QuoteView from "@/pages/QuoteView";
import Help from "@/pages/Help";
import AdminLogin from "@/pages/admin/AdminLogin";
import Dashboard from "@/pages/admin/Dashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderNew from "@/pages/admin/AdminOrderNew";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminBalances from "@/pages/admin/AdminBalances";
import AdminCustomerLedger from "@/pages/admin/AdminCustomerLedger";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminEcount from "@/pages/admin/AdminEcount";
import AdminEcountLogs from "@/pages/admin/AdminEcountLogs";
import AdminBoard from "@/pages/admin/AdminBoard";
import AdminNews from "@/pages/admin/AdminNews";
import AdminBackup from "@/pages/admin/AdminBackup";
import AdminManagers from "@/pages/admin/AdminManagers";
import AdminActivityLogs from "@/pages/admin/AdminActivityLogs";
import AdminTransactions from "@/pages/admin/AdminTransactions";
import AdminChat from "@/pages/admin/AdminChat";
import AdminQuotes from "@/pages/admin/AdminQuotes";
import AdminSuppliers from "@/pages/admin/AdminSuppliers";
import AdminPurchases from "@/pages/admin/AdminPurchases";
import AdminSupplierPayments from "@/pages/admin/AdminSupplierPayments";
import AdminSupplierBalances from "@/pages/admin/AdminSupplierBalances";
import AdminSupplierLedger from "@/pages/admin/AdminSupplierLedger";
import AdminDashboardPnl from "@/pages/admin/AdminDashboardPnl";
import AdminStoreSales from "@/pages/admin/AdminStoreSales";
import AdminFixedCostItems from "@/pages/admin/AdminFixedCostItems";
import AdminProductCategories from "@/pages/admin/AdminProductCategories";
import AdminMoneyEntry from "@/pages/admin/AdminMoneyEntry";
import AdminFinancials from "@/pages/admin/AdminFinancials";
import AdminPosSales from "@/pages/admin/AdminPosSales";
import AdminExpenseCleanup from "@/pages/admin/AdminExpenseCleanup";
import AdminEspresso from "@/pages/admin/AdminEspresso";
import AdminKakao from "@/pages/admin/AdminKakao";
import AdminInquiries from "@/pages/admin/AdminInquiries";
import AdminVisitSetups from "@/pages/admin/AdminVisitSetups";
import AdminStaff from "@/pages/admin/AdminStaff";
import AdminStaffAttendance from "@/pages/admin/AdminStaffAttendance";
import AdminStaffSchedule from "@/pages/admin/AdminStaffSchedule";
import AdminStaffNotices from "@/pages/admin/AdminStaffNotices";
import AdminStaffLogs from "@/pages/admin/AdminStaffLogs";
import StaffLogin from "@/pages/staff/StaffLogin";
import StaffHome from "@/pages/staff/StaffHome";
import StaffEspresso from "@/pages/staff/StaffEspresso";
import StaffDessert from "@/pages/staff/StaffDessert";
import StaffSchedule from "@/pages/staff/StaffSchedule";
import StaffNotices from "@/pages/staff/StaffNotices";
import AdminWebAnalytics from "@/pages/admin/AdminWebAnalytics";
import NotFound from "@/pages/not-found";

// 로그인한 거래처만 접근 가능
function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function AppRouter() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  // 루트 진입 시 적절한 페이지로 분기
  useEffect(() => {
    if (isLoading) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "/" || hash === "") {
      navigate(user ? "/catalog" : "/login");
    }
  }, [isLoading, user, navigate]);

  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password/:token" component={ResetPassword} />
      <Route path="/inquiry" component={Inquiry} />
      <Route path="/espresso" component={Espresso} />
      <Route path="/quote/:token" component={QuoteView} />

      <Route path="/catalog">
        <RequireCustomer><Catalog /></RequireCustomer>
      </Route>
      <Route path="/products/:id">
        <RequireCustomer><ProductDetail /></RequireCustomer>
      </Route>
      <Route path="/board">
        <RequireCustomer><Board /></RequireCustomer>
      </Route>
      <Route path="/news">
        <RequireCustomer><News /></RequireCustomer>
      </Route>
      <Route path="/news/:id">
        <RequireCustomer><NewsDetail /></RequireCustomer>
      </Route>
      <Route path="/cart">
        <RequireCustomer><Cart /></RequireCustomer>
      </Route>
      <Route path="/sample">
        <RequireCustomer><SampleRequest /></RequireCustomer>
      </Route>
      <Route path="/visit-setup">
        <RequireCustomer><VisitSetup /></RequireCustomer>
      </Route>
      <Route path="/orders">
        <RequireCustomer><Orders /></RequireCustomer>
      </Route>
      <Route path="/orders/:id">
        <RequireCustomer><OrderDetail /></RequireCustomer>
      </Route>
      <Route path="/account">
        <RequireCustomer><Account /></RequireCustomer>
      </Route>
      <Route path="/chat">
        <RequireCustomer><Chat /></RequireCustomer>
      </Route>
      <Route path="/invoice/:id">
        <RequireCustomer><InvoicePage /></RequireCustomer>
      </Route>
      <Route path="/help">
        <RequireCustomer><Help /></RequireCustomer>
      </Route>

      {/* 관리자 */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={Dashboard} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/orders/new" component={AdminOrderNew} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/product-categories" component={AdminProductCategories} />
      <Route path="/admin/customers" component={AdminCustomers} />
      <Route path="/admin/customers/:id/ledger" component={AdminCustomerLedger} />
      <Route path="/admin/balances" component={AdminBalances} />
      <Route path="/admin/orders/:id" component={AdminOrderDetail} />
      <Route path="/admin/ecount" component={AdminEcount} />
      <Route path="/admin/ecount-logs" component={AdminEcountLogs} />
      <Route path="/admin/board" component={AdminBoard} />
      <Route path="/admin/news" component={AdminNews} />
      <Route path="/admin/backup" component={AdminBackup} />
      <Route path="/admin/managers" component={AdminManagers} />
      <Route path="/admin/activity-logs" component={AdminActivityLogs} />
      <Route path="/admin/transactions" component={AdminTransactions} />
      <Route path="/admin/chat" component={AdminChat} />
      <Route path="/admin/chat/:customerId" component={AdminChat} />
      <Route path="/admin/quotes" component={AdminQuotes} />
      <Route path="/admin/suppliers/:id/ledger" component={AdminSupplierLedger} />
      <Route path="/admin/suppliers" component={AdminSuppliers} />
      <Route path="/admin/purchases" component={AdminPurchases} />
      <Route path="/admin/supplier-payments" component={AdminSupplierPayments} />
      <Route path="/admin/supplier-balances" component={AdminSupplierBalances} />
      <Route path="/admin/dashboard-pnl" component={AdminDashboardPnl} />
      <Route path="/admin/financials" component={AdminFinancials} />
      <Route path="/admin/pos-sales" component={AdminPosSales} />
      <Route path="/admin/expense-cleanup" component={AdminExpenseCleanup} />
      <Route path="/admin/espresso" component={AdminEspresso} />
      <Route path="/admin/store-sales" component={AdminStoreSales} />
      <Route path="/admin/money" component={AdminMoneyEntry} />
      {/* 통합 이전 경로 — 북마크 호환을 위해 통합 페이지로 연결 */}
      <Route path="/admin/expenses" component={AdminMoneyEntry} />
      <Route path="/admin/personal-ledger" component={AdminMoneyEntry} />
      <Route path="/admin/fixed-cost-items" component={AdminFixedCostItems} />
      <Route path="/admin/kakao" component={AdminKakao} />
      <Route path="/admin/inquiries" component={AdminInquiries} />
      <Route path="/admin/visit-setups" component={AdminVisitSetups} />

      {/* 직원 내부 관리 — 관리자 화면 */}
      <Route path="/admin/staff" component={AdminStaff} />
      <Route path="/admin/staff/attendance" component={AdminStaffAttendance} />
      <Route path="/admin/staff/schedule" component={AdminStaffSchedule} />
      <Route path="/admin/staff/notices" component={AdminStaffNotices} />
      <Route path="/admin/staff/logs" component={AdminStaffLogs} />

      {/* 직원 내부 관리 — 직원 화면 (자체 인증) */}
      <Route path="/staff/login" component={StaffLogin} />
      <Route path="/staff" component={StaffHome} />
      <Route path="/staff/espresso" component={StaffEspresso} />
      <Route path="/staff/dessert" component={StaffDessert} />
      <Route path="/staff/schedule" component={StaffSchedule} />
      <Route path="/staff/notices" component={StaffNotices} />
      <Route path="/admin/web-analytics" component={AdminWebAnalytics} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <TooltipProvider>
              <Toaster />
              <Router hook={useHashLocation}>
                <ErrorBoundary>
                  <AppRouter />
                </ErrorBoundary>
              </Router>
            </TooltipProvider>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
