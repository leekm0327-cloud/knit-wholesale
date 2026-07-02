// #3 멀티 계정 빠른 전환
// 한 사장님이 여러 지점(상호명 계정)을 운영할 때, 로그아웃/로그인 없이
// 저장된 계정 사이를 바로 전환할 수 있는 드롭다운.
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { getSavedAccounts, removeAccount } from "@/lib/savedAccounts";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Check, Plus, Trash2, Loader2 } from "lucide-react";

export function AccountSwitcher() {
  const { user } = useAuth();
  const { clear: clearCart } = useCart();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [switching, setSwitching] = useState(false);
  // 드롭다운을 열 때마다 최신 저장 계정 목록을 읽기 위한 상태
  const [accounts, setAccounts] = useState(getSavedAccounts());

  function refresh() {
    setAccounts(getSavedAccounts());
  }

  // 로그인 상태가 아니면 노출하지 않음.
  // 계정이 1개여도 '다른 계정 추가 로그인' 진입점을 제공하기 위해 항상 표시함.
  if (!user) {
    return null;
  }

  const multiple = accounts.length > 1;

  async function switchTo(businessName: string, password: string) {
    if (businessName === user?.businessName) return;
    setSwitching(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        businessName,
        password,
        rememberMe: true,
      });
      const nextUser = await res.json();
      // 이전 계정의 장바구니가 섞이지 않도록 비우기
      clearCart();
      // 계정 관련 캐시 초기화 후 새 사용자 반영
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/me"], nextUser);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "계정을 전환했습니다",
        description: `${nextUser.businessName} 계정으로 전환되었습니다.`,
      });
      navigate("/catalog");
    } catch (err: any) {
      // 비밀번호 변경 등으로 저장된 정보가 더 이상 유효하지 않을 수 있음
      toast({
        title: "계정 전환 실패",
        description: `${errMsg(err)} 저장된 로그인 정보가 만료되었을 수 있습니다.`,
        variant: "destructive",
      });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="button-account-switcher"
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 font-ui text-[11px] tracking-wide text-foreground transition-colors hover:bg-muted/60"
          aria-label="계정 전환"
        >
          {switching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="max-w-[140px] truncate">{multiple ? "계정 전환" : "계정 추가"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {multiple
            ? `저장된 계정 (${accounts.length})`
            : "여러 지점을 운영하시나요?"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((acc) => {
          const isCurrent = acc.businessName === user.businessName;
          return (
            <DropdownMenuItem
              key={acc.businessName}
              disabled={switching}
              onSelect={(e) => {
                e.preventDefault();
                if (!isCurrent) switchTo(acc.businessName, acc.password);
              }}
              data-testid={`account-item-${acc.businessName}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isCurrent ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 truncate">
                  <span className="font-medium text-foreground">{acc.businessName}</span>
                  {acc.managerName && (
                    <span className="text-muted-foreground"> · {acc.managerName}</span>
                  )}
                </span>
              </span>
              {!isCurrent && (
                <button
                  type="button"
                  aria-label="계정 삭제"
                  data-testid={`account-remove-${acc.businessName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeAccount(acc.businessName);
                    refresh();
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            navigate("/login");
          }}
          data-testid="account-add-new"
          className="text-muted-foreground"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> 다른 계정 추가 로그인
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
