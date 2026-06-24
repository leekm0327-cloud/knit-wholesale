import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { won, parsePrices, CATEGORY_LABEL, errMsg } from "@/lib/format";
import type { Product } from "@shared/schema";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type FormState = {
  name: string;
  category: string;
  origin: string;
  p200: string;
  p500: string;
  p1000: string;
  available: boolean;
  sortOrder: string;
};

const empty: FormState = {
  name: "",
  category: "blend",
  origin: "",
  p200: "",
  p500: "",
  p1000: "",
  available: true,
  sortOrder: "99",
};

export default function AdminProducts() {
  const { toast } = useToast();
  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(p: Product) {
    const prices = parsePrices(p.prices);
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category,
      origin: p.origin,
      p200: prices["200"] ? String(prices["200"]) : "",
      p500: prices["500"] ? String(prices["500"]) : "",
      p1000: prices["1000"] ? String(prices["1000"]) : "",
      available: p.available === 1,
      sortOrder: String(p.sortOrder),
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const prices: Record<string, number> = {};
      if (form.p200) prices["200"] = Number(form.p200);
      if (form.p500) prices["500"] = Number(form.p500);
      if (form.p1000) prices["1000"] = Number(form.p1000);
      const payload = {
        name: form.name,
        category: form.category,
        origin: form.origin,
        prices: JSON.stringify(prices),
        available: form.available ? 1 : 0,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        await apiRequest("PATCH", `/api/admin/products/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/products", payload);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setOpen(false);
      toast({ title: editing ? "상품 수정 완료" : "상품 추가 완료" });
    } catch (err: any) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(p: Product) {
    await apiRequest("PATCH", `/api/admin/products/${p.id}`, { available: p.available === 1 ? 0 : 1 });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await apiRequest("DELETE", `/api/admin/products/${deleteTarget.id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    setDeleteTarget(null);
    toast({ title: "상품 삭제됨" });
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">상품 관리</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">시즌별 싱글 오리진을 켜고 끌 수 있습니다.</p>
          </div>
          <Button onClick={openNew} data-testid="button-new-product">
            <Plus className="mr-1.5 h-4 w-4" /> 상품 추가
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {(products ?? []).map((p) => {
                const prices = parsePrices(p.prices);
                return (
                  <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-product-${p.id}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{p.name}</span>
                        <Badge variant="secondary" className="text-[11px]">{CATEGORY_LABEL[p.category]}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.origin}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {prices["200"] != null && <span>200g {won(prices["200"])}</span>}
                        {prices["500"] != null && <span>500g {won(prices["500"])}</span>}
                        {prices["1000"] != null && <span>1kg {won(prices["1000"])}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${p.available ? "text-accent" : "text-muted-foreground"}`}>
                          {p.available ? "판매중" : "품절"}
                        </span>
                        <Switch
                          checked={p.available === 1}
                          onCheckedChange={() => toggleAvailable(p)}
                          data-testid={`switch-available-${p.id}`}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="수정" data-testid={`button-edit-${p.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label="삭제" data-testid={`button-delete-${p.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "상품 수정" : "상품 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">상품명</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="input-product-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">카테고리</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger data-testid="select-product-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blend">블렌드</SelectItem>
                    <SelectItem value="decaf">디카페인</SelectItem>
                    <SelectItem value="single">싱글 오리진</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">정렬 순서</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} data-testid="input-product-sort" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">산지 / 설명</Label>
              <Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder="예: 에티오피아 예가체프 / 블루베리, 플로럴" data-testid="input-product-origin" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">200g (원)</Label>
                <Input type="number" value={form.p200} onChange={(e) => set("p200", e.target.value)} data-testid="input-price-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">500g (원)</Label>
                <Input type="number" value={form.p500} onChange={(e) => set("p500", e.target.value)} data-testid="input-price-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">1kg (원)</Label>
                <Input type="number" value={form.p1000} onChange={(e) => set("p1000", e.target.value)} data-testid="input-price-1000" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">판매중</Label>
              <Switch checked={form.available} onCheckedChange={(v) => set("available", v)} data-testid="switch-form-available" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={save} disabled={saving || !form.name} data-testid="button-save-product">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상품을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              '{deleteTarget?.name}'을(를) 삭제합니다. 이미 접수된 주문 내역에는 영향을 주지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} data-testid="button-confirm-delete">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
