import { useState } from "react";
import { ProductDetailEditor, emptyDetailFields, type DetailFields } from "./ProductDetailEditor";
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
import { won, CATEGORY_LABEL, errMsg } from "@/lib/format";
import type { Product } from "@shared/schema";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type FormState = {
  name: string;
  category: string;
  origin: string;
  price: string;
  available: boolean;
  sortOrder: string;
  ecountCode: string;
  detailTemplate: "blend" | "single";
  detail: DetailFields;
  detailImages: string[];
};

const empty: FormState = {
  name: "",
  category: "blend",
  origin: "",
  price: "",
  available: true,
  sortOrder: "99",
  ecountCode: "",
  detailTemplate: "blend",
  detail: { ...emptyDetailFields },
  detailImages: [],
};

function parseStoredDetail(p: Product): { template: "blend" | "single"; detail: DetailFields } {
  const base: DetailFields = { ...emptyDetailFields };
  let template: "blend" | "single" = p.category === "blend" ? "blend" : "single";
  if (p.detailTemplate === "blend" || p.detailTemplate === "single") template = p.detailTemplate;
  if (p.detailJson) {
    try {
      const parsed = JSON.parse(p.detailJson);
      if (parsed?.template === "blend" || parsed?.template === "single") template = parsed.template;
      for (const k of Object.keys(base) as Array<keyof DetailFields>) {
        if (typeof parsed?.[k] === "string") base[k] = parsed[k];
      }
    } catch {}
  }
  return { template, detail: base };
}

function parseStoredImages(p: Product): string[] {
  if (!p.detailImages) return [];
  try {
    const arr = JSON.parse(p.detailImages);
    if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
  } catch {}
  return [];
}

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
    setEditing(p);
    const { template, detail } = parseStoredDetail(p);
    setForm({
      name: p.name,
      category: p.category,
      origin: p.origin,
      price: String(p.price ?? 0),
      available: p.available === 1,
      sortOrder: String(p.sortOrder),
      ecountCode: p.ecountCode || "",
      detailTemplate: template,
      detail,
      detailImages: parseStoredImages(p),
    });
    setOpen(true);
  }

  const setDetail = (k: keyof DetailFields, v: string) =>
    setForm((f) => ({ ...f, detail: { ...f.detail, [k]: v } }));

  async function save() {
    setSaving(true);
    try {
      // detailJson 직렬화 (template에 따라 관련 필드만 포함)
      const tpl = form.detailTemplate;
      const d = form.detail;
      const detailObj =
        tpl === "blend"
          ? {
              template: "blend" as const,
              tagline: d.tagline,
              blendRatio: d.blendRatio,
              flavorNotes: d.flavorNotes,
              roastLevel: d.roastLevel,
              recommendedUse: d.recommendedUse,
              description: d.description,
            }
          : {
              template: "single" as const,
              tagline: d.tagline,
              country: d.country,
              region: d.region,
              farm: d.farm,
              variety: d.variety,
              process: d.process,
              altitude: d.altitude,
              flavorNotes: d.flavorNotes,
              roastLevel: d.roastLevel,
              description: d.description,
            };
      const payload = {
        name: form.name,
        category: form.category,
        origin: form.origin,
        price: Number(form.price) || 0,
        available: form.available ? 1 : 0,
        sortOrder: Number(form.sortOrder) || 0,
        ecountCode: form.ecountCode.trim(),
        detailTemplate: tpl,
        detailJson: JSON.stringify(detailObj),
        detailImages: JSON.stringify(form.detailImages),
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
            <div className="eyebrow">Products</div>
            <h1 className="font-display mt-1 text-xl font-semibold text-foreground">상품 관리</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">ECOUNT 1품목 1코드 원칙 — 중량별로 상품을 별도로 등록하세요.</p>
          </div>
          <Button onClick={openNew} data-testid="button-new-product">
            <Plus className="mr-1.5 h-4 w-4" /> 상품 추가
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-none" />)}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {(products ?? []).map((p) => (
                <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-product-${p.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="text-[11px]">{CATEGORY_LABEL[p.category]}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.origin}</div>
                    <div className="mt-1 text-xs text-foreground">
                      <span className="font-semibold tabular">{won(p.price)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      ECOUNT 품목코드: {p.ecountCode ? <span className="font-mono text-foreground">{p.ecountCode}</span> : <span className="text-destructive">미설정</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${p.available ? "text-foreground" : "text-muted-foreground"}`}>
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
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "상품 수정" : "상품 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">상품명 (중량 포함)</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="예: 실크 블렌드 1kg"
                data-testid="input-product-name"
              />
              <p className="text-[11px] text-muted-foreground">
                중량은 상품명에 표시하세요 (예: "코튼 블렌드 200g", "코튼 블렌드 1kg"). ECOUNT 품목코드도 중량별로 다르게 부여합니다.
              </p>
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
            <div className="space-y-1.5">
              <Label className="text-xs">단가 (원)</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="예: 32000"
                data-testid="input-product-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ECOUNT 품목코드</Label>
              <Input
                value={form.ecountCode}
                onChange={(e) => set("ecountCode", e.target.value)}
                placeholder="예: KCP-SILK-1000"
                data-testid="input-product-ecount-code"
              />
              <p className="text-[11px] text-muted-foreground">
                ECOUNT 품목 마스터의 품목코드와 일치해야 합니다. 비어두면 주문의 ECOUNT 전송이 실패합니다.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">판매중</Label>
              <Switch checked={form.available} onCheckedChange={(v) => set("available", v)} data-testid="switch-form-available" />
            </div>

            {/* 상세페이지 양식 + 이미지 */}
            <ProductDetailEditor
              template={form.detailTemplate}
              setTemplate={(t) => setForm((f) => ({ ...f, detailTemplate: t }))}
              detail={form.detail}
              setDetail={setDetail}
              images={form.detailImages}
              setImages={(imgs) => setForm((f) => ({ ...f, detailImages: imgs }))}
            />
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
