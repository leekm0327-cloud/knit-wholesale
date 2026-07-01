import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { won, fmtDate, errMsg } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PublicCustomer, Order, OrderItem, CustomerBalance, Product, CustomerPrice } from "@shared/schema";
import { Building2, FileText, Wallet, Tag, ChevronDown, ChevronUp, Plus, Loader2, Pencil, Mail, Trash2, ChevronUpDown, ArrowUpDown } from "lucide-react";

type SortKey = "businessName" | "balance" | "createdAt";
type SortDir = "asc" | "desc";

export default function AdminCustomers() {
  const [, navigate] = useLocation();
  const { data: customers, isLoading } = useQuery<PublicCustomer[]>({ queryKey: ["/api/admin/customers"] });
  const { data: balanceData } = useQuery<{ balances: CustomerBalance[] }>({ queryKey: ["/api/admin/balances"] });
  const balanceMap = new Map((balanceData?.balances ?? []).map((b) => [b.customerId, b.balance]));
  const [detailId, setDetailId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<PublicCustomer | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // 검색 + 정렬 상태
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const qc = useQueryClient();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "businessName" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(() => {
    const list = customers ?? [];
    const q = search.trim().toLowerCase();
    const searched = q ? list.filter((c) => c.businessName.toLowerCase().includes(q)) : list;
    return [...searched].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "businessName") {
        cmp = a.businessName.localeCompare(b.businessName, "ko");
      } else if (sortKey === "balance") {
        cmp = (balanceMap.get(a.id) ?? 0) - (balanceMap.get(b.id) ?? 0);
      } else {
        cmp = a.createdAt - b.createdAt;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [customers, search, sortKey, sortDir, balanceMap]);

  async function handleDelete(id: number) {
    try {
      await apiRequest("DELETE", `/api/admin/customers/${id}`, {});
      qc.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/balances"] });
    } catch (e: any) {
      alert("삭제 실패: " + (e?.message ?? ""));
    } finally {
      setDeleteId(null);
    }
  }

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : ""}`} />
    </button>
  );

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Customers</div>
            <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">거래처 관리</h1>
            <p className="text-sm text-muted-foreground">가입한 거래처 목록과 상세 정보입니다.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-customer">
            <Plus className="mr-1.5 h-4 w-4" /> 거래처 등록
          </Button>
        </div>

        {/* 검색창 */}
        <div className="mb-4">
          <Input
            placeholder="상호명 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            data-testid="input-customer-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-none" />)}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {search ? "검색 결과가 없습니다." : "등록된 거래처가 없습니다."}
            </p>
          </Card>
        ) : (
          <>
            {/* === 데스크탑 테이블 (lg 이상) === */}
            <div className="hidden lg:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/30">
                    <th className="px-4 py-3 text-left">
                      <SortBtn k="businessName">상호명</SortBtn>
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">대표자 / 연락처</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">기본배송지</th>
                    <th className="px-4 py-3 text-right">
                      <SortBtn k="balance">미수금</SortBtn>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortBtn k="createdAt">가입일</SortBtn>
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((c) => {
                    const balance = balanceMap.get(c.id) ?? 0;
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-muted/20 transition-colors"
                        data-testid={`row-customer-${c.id}`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDetailId(c.id)}
                            className="text-sm font-semibold text-foreground hover:underline underline-offset-2"
                            data-testid={`link-customer-${c.id}`}
                          >
                            {c.businessName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="text-xs">{c.managerName}</div>
                          <div className="text-xs">{c.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-[200px] truncate text-xs text-muted-foreground">{c.defaultAddress || "—"}</p>
                        </td>
                        <td className={`px-4 py-3 text-right font-ui text-sm font-semibold tabular ${balance > 0 ? "text-destructive" : "text-foreground"}`}>
                          {balanceMap.has(c.id) ? won(balance) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setEditCustomer(c)}
                              className="inline-flex items-center gap-0.5 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                              data-testid={`button-edit-customer-${c.id}`}
                            >
                              <Pencil className="h-3 w-3" /> 수정
                            </button>
                            <button
                              onClick={() => navigate(`/admin/customers/${c.id}/ledger`)}
                              className="inline-flex items-center gap-0.5 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                              data-testid={`button-ledger-${c.id}`}
                            >
                              <Wallet className="h-3 w-3" /> 원장
                            </button>
                            <button
                              onClick={() => setDeleteId(c.id)}
                              className="inline-flex items-center gap-0.5 rounded border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                              data-testid={`button-delete-customer-${c.id}`}
                            >
                              <Trash2 className="h-3 w-3" /> 삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-b border-border" />
            </div>

            {/* === 모바일 카드 (lg 미만) === */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              {filtered.map((c) => {
                const balance = balanceMap.get(c.id) ?? 0;
                return (
                  <Card
                    key={c.id}
                    className="cursor-pointer p-5 hover-elevate"
                    onClick={() => setDetailId(c.id)}
                    data-testid={`card-customer-${c.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{c.businessName}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>담당자 {c.managerName} · {c.phone}</div>
                      <div className="truncate">{c.email}</div>
                      <div className="truncate">{c.defaultAddress || "배송지 미등록"}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                      <span className="text-[11px] text-muted-foreground">미수금</span>
                      <span className={`font-display tabular text-sm font-semibold ${balance > 0 ? "text-destructive" : "text-foreground"}`}>
                        {balanceMap.has(c.id) ? won(balance) : "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">가입일 {fmtDate(c.createdAt)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditCustomer(c); }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                          data-testid={`button-edit-customer-mobile-${c.id}`}
                        >
                          <Pencil className="h-3 w-3" /> 수정
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/customers/${c.id}/ledger`); }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                          data-testid={`button-ledger-mobile-${c.id}`}
                        >
                          <Wallet className="h-3 w-3" /> 원장
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline"
                          data-testid={`button-delete-customer-mobile-${c.id}`}
                        >
                          <Trash2 className="h-3 w-3" /> 삭제
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <CustomerDetail id={detailId} onClose={() => setDetailId(null)} onOpenOrder={(oid) => { setDetailId(null); navigate(`/admin/orders/${oid}`); }} />
      <CreateCustomerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditCustomerDialog customer={editCustomer} onClose={() => setEditCustomer(null)} />

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>거래처 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {filtered.find((c) => c.id === deleteId)?.businessName} 거래처를 삭제하시겠습니까?<br />
            이 작업은 되돌릴 수 없습니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

const EMPTY_FORM = {
  businessName: "",
  managerName: "",
  phone: "",
  email: "",
  bizRegNo: "",
  defaultAddress: "",
  password: "",
};

function CreateCustomerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM });
  }, [open]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/customers", {
        businessName: form.businessName.trim(),
        managerName: form.managerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        bizRegNo: form.bizRegNo.trim(),
        defaultAddress: form.defaultAddress.trim(),
        password: form.password,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "거래처가 등록되었습니다." });
      qc.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "등록 실패", description: errMsg(e), variant: "destructive" });
    },
  });

  function submit() {
    if (!form.businessName.trim() || !form.managerName.trim() || !form.phone.trim() || !form.email.trim()) {
      toast({ title: "필수 항목을 입력해 주세요.", description: "상호 · 담당자명 · 연락처 · 이메일은 필수입니다.", variant: "destructive" });
      return;
    }
    createMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>거래처 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="사업자등록번호">
              <Input value={form.bizRegNo} onChange={set("bizRegNo")} placeholder="000-00-00000" data-testid="input-new-biz-reg-no" />
            </Field>
            <Field label="상호" required>
              <Input value={form.businessName} onChange={set("businessName")} placeholder="예: 니트커피" data-testid="input-new-business-name" />
            </Field>
            <Field label="담당자명" required>
              <Input value={form.managerName} onChange={set("managerName")} placeholder="예: 홍길동" data-testid="input-new-manager-name" />
            </Field>
            <Field label="연락처" required>
              <Input value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" data-testid="input-new-phone" />
            </Field>
            <Field label="이메일" required>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="login@example.com" data-testid="input-new-email" />
            </Field>
          </div>
          <Field label="기본 배송지">
            <Input value={form.defaultAddress} onChange={set("defaultAddress")} placeholder="배송지 주소" data-testid="input-new-default-address" />
          </Field>
          <Field label="초기 비밀번호 (비워두면 사업자등록번호로 자동 설정)">
            <Input type="password" value={form.password} onChange={set("password")} placeholder="비워두면 사업자등록번호" data-testid="input-new-password" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending} data-testid="button-create-customer-cancel">
            취소
          </Button>
          <Button onClick={submit} disabled={createMut.isPending} data-testid="button-create-customer-submit">
            {createMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCustomerDialog({ customer, onClose }: { customer: PublicCustomer | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    businessName: "",
    managerName: "",
    phone: "",
    email: "",
    bizRegNo: "",
    defaultAddress: "",
  });

  useEffect(() => {
    if (customer) {
      setForm({
        businessName: customer.businessName ?? "",
        managerName: customer.managerName ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        bizRegNo: customer.bizRegNo ?? "",
        defaultAddress: customer.defaultAddress ?? "",
      });
    }
  }, [customer]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const editMut = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error("no customer");
      const res = await apiRequest("PATCH", `/api/admin/customers/${customer.id}`, {
        businessName: form.businessName.trim(),
        managerName: form.managerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        bizRegNo: form.bizRegNo.trim(),
        defaultAddress: form.defaultAddress.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "거래처 정보가 수정되었습니다." });
      qc.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "수정 실패", description: errMsg(e), variant: "destructive" });
    },
  });

  function submit() {
    if (!form.businessName.trim() || !form.managerName.trim() || !form.phone.trim()) {
      toast({ title: "필수 항목을 입력해 주세요.", description: "상호 · 담당자명 · 연락처는 필수입니다.", variant: "destructive" });
      return;
    }
    editMut.mutate();
  }

  return (
    <Dialog open={customer != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>거래처 정보 수정</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="상호 (로그인 ID)" required>
              <Input value={form.businessName} onChange={set("businessName")} placeholder="예: 니트커피" data-testid="input-edit-business-name" />
            </Field>
            <Field label="담당자명" required>
              <Input value={form.managerName} onChange={set("managerName")} placeholder="예: 홍길동" data-testid="input-edit-manager-name" />
            </Field>
            <Field label="연락처" required>
              <Input value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" data-testid="input-edit-phone" />
            </Field>
            <Field label="사업자등록번호">
              <Input value={form.bizRegNo} onChange={set("bizRegNo")} placeholder="000-00-00000" data-testid="input-edit-biz-reg-no" />
            </Field>
            <Field label="이메일">
              <Input type="email" value={form.email} onChange={set("email")} placeholder="login@example.com" data-testid="input-edit-email" />
            </Field>
          </div>
          <Field label="기본 배송지">
            <Input value={form.defaultAddress} onChange={set("defaultAddress")} placeholder="배송지 주소" data-testid="input-edit-default-address" />
          </Field>
          <div className="space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">비밀번호는 이 화면에서 변경할 수 없습니다.</p>
            <ResetPasswordButton customer={customer} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={editMut.isPending} data-testid="button-edit-customer-cancel">
            취소
          </Button>
          <Button onClick={submit} disabled={editMut.isPending} data-testid="button-edit-customer-submit">
            {editMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// V8 #29: 비밀번호 재설정 버튼
function ResetPasswordButton({ customer }: { customer: PublicCustomer | null }) {
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  if (!customer) return null;

  async function handleReset() {
    if (!confirm(`${customer!.businessName}의 이메일(${customer!.email || "없음"})로 비밀번호 재설정 메일을 발송하시겠습니까?`)) return;
    if (!customer!.email) {
      toast({ title: "이메일 없음", description: "거래처에 등록된 이메일이 없습니다.", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/customers/${customer!.id}/reset-password`, {});
      if (res.ok) {
        toast({ title: "재설정 메일을 발송했습니다", description: `${customer!.email}으로 발송됨` });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "발송 실패", description: (data as any)?.message ?? "", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "발송 실패", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      data-testid="button-send-reset-email"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
      비밀번호 재설정 메일 보내기
    </button>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function CustomerDetail({ id, onClose, onOpenOrder }: { id: number | null; onClose: () => void; onOpenOrder: (oid: number) => void }) {
  const { data, isLoading } = useQuery<{ customer: PublicCustomer; orders: Order[] }>({
    queryKey: ["/api/admin/customers", id],
    enabled: id != null,
  });

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.customer.businessName ?? "거래처 상세"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Row label="담당자" value={data.customer.managerName} />
              <Row label="연락처" value={data.customer.phone} />
              <Row label="사업자번호" value={data.customer.bizRegNo || "-"} />
              <Row label="이메일" value={data.customer.email} />
            </div>
            <Row label="기본 배송지" value={data.customer.defaultAddress || "-"} />

            <CustomerPricesSection customerId={data.customer.id} />

            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">주문 내역 ({data.orders.length}건)</div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {data.orders.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">주문 없음</div>
                ) : (
                  data.orders.map((o) => {
                    const items: OrderItem[] = JSON.parse(o.items);
                    return (
                      <button
                        key={o.id}
                        onClick={() => onOpenOrder(o.id)}
                        className="flex w-full items-center justify-between rounded-md border p-3 text-left hover-elevate"
                        data-testid={`button-customer-order-${o.id}`}
                      >
                        <div className="min-w-0">
                          <div className="font-display text-xs font-semibold tabular text-foreground">{o.orderNo}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {items[0].name}{items.length > 1 ? ` 외 ${items.length - 1}건` : ""} · {fmtDate(o.createdAt)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-semibold tabular text-foreground">{won(o.totalAmount)}</span>
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function CustomerPricesSection({ customerId }: { customerId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: open,
  });
  const { data: prices } = useQuery<CustomerPrice[]>({
    queryKey: [`/api/admin/customers/${customerId}/prices`],
    enabled: open,
  });

  useEffect(() => {
    if (!products || !prices) return;
    const priceMap = new Map(prices.map((p) => [p.productId, p.price]));
    const next: Record<number, string> = {};
    products.forEach((p) => {
      const v = priceMap.get(p.id);
      next[p.id] = v != null ? String(v) : "";
    });
    setEdits(next);
  }, [products, prices]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const items = (products ?? []).map((p) => {
        const raw = (edits[p.id] ?? "").trim();
        if (raw === "") return { productId: p.id, price: null };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return { productId: p.id, price: null };
        return { productId: p.id, price: Math.round(n) };
      });
      const res = await apiRequest("PUT", `/api/admin/customers/${customerId}/prices`, { items });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "가격이 저장되었습니다." });
      qc.invalidateQueries({ queryKey: [`/api/admin/customers/${customerId}/prices`] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (e: any) => {
      toast({ title: "저장 실패", description: e?.message ?? "", variant: "destructive" });
    },
  });

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        data-testid="button-toggle-customer-prices"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Tag className="h-3.5 w-3.5" /> 거래처 전용 가격
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t p-3">
          <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <p className="text-[11px] text-muted-foreground">
              빈칸은 기본가격이 적용됩니다. 공급가액(부가세 제외) 기준입니다.
            </p>
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !products}
              data-testid="button-save-customer-prices"
              className="shrink-0"
            >
              {saveMut.isPending ? "저장 중…" : "저장"}
            </Button>
          </div>
          {!products ? (
            <Skeleton className="h-32 w-full" />
          ) : products.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">등록된 상품이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">기본가 {won(p.price)}</div>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="기본가 적용"
                    value={edits[p.id] ?? ""}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="h-8 w-28 text-xs tabular"
                    data-testid={`input-customer-price-${p.id}`}
                  />
                  <span className="text-[10px] text-muted-foreground">원</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
