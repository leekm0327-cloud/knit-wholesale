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

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Catalog from "@/pages/Catalog";
import ProductDetail from "@/pages/ProductDetail";
import Board from "@/pages/Board";
import Cart from "@/pages/Cart";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Account from "@/pages/Account";
import InvoicePage from "@/pages/InvoicePage";
import AdminLogin from "@/pages/admin/AdminLogin";
import Dashboard from "@/pages/admin/Dashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminBalances from "@/pages/admin/AdminBalances";
import AdminCustomerLedger from "@/pages/admin/AdminCustomerLedger";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminEcount from "@/pages/admin/AdminEcount";
import AdminEcountLogs from "@/pages/admin/AdminEcountLogs";
import AdminBoard from "@/pages/admin/AdminBoard";
import AdminBackup from "@/pages/admin/AdminBackup";
import AdminManagers from "@/pages/admin/AdminManagers";
import AdminActivityLogs from "@/pages/admin/AdminActivityLogs";
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
      <Route path="/reset-password" component={ResetPassword} />

      <Route path="/catalog">
        <RequireCustomer><Catalog /></RequireCustomer>
      </Route>
      <Route path="/products/:id">
        <RequireCustomer><ProductDetail /></RequireCustomer>
      </Route>
      <Route path="/board">
        <RequireCustomer><Board /></RequireCustomer>
      </Route>
      <Route path="/cart">
        <RequireCustomer><Cart /></RequireCustomer>
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
      <Route path="/invoice/:id">
        <RequireCustomer><InvoicePage /></RequireCustomer>
      </Route>

      {/* 관리자 */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={Dashboard} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/customers" component={AdminCustomers} />
      <Route path="/admin/customers/:id/ledger" component={AdminCustomerLedger} />
      <Route path="/admin/balances" component={AdminBalances} />
      <Route path="/admin/orders/:id" component={AdminOrderDetail} />
      <Route path="/admin/ecount" component={AdminEcount} />
      <Route path="/admin/ecount-logs" component={AdminEcountLogs} />
      <Route path="/admin/board" component={AdminBoard} />
      <Route path="/admin/backup" component={AdminBackup} />
      <Route path="/admin/managers" component={AdminManagers} />
      <Route path="/admin/activity-logs" component={AdminActivityLogs} />

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
                <AppRouter />
              </Router>
            </TooltipProvider>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
