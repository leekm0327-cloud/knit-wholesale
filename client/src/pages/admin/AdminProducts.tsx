import { productDetailKind, storedDetailObject } from "@shared/product-detail-kind";
import { AdminFold } from "@/components/AdminFold";
import { useState } from "react";
import { Link } from "wouter";
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
import type { ProductCategory, Product } from "@shared/schema";
import { Plus, Pencil, Trash2, Loader2, FileText } from "lucide-react";

type FormState = {
  name: string;
  category: string;
  origin: string;
  price: string;
  costPrice: string;
  available: boolean;
  minOrderQty: string;
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
  costPrice: "",
  available: true,
  minOrderQty: "",
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
  const { data: products, isLoading, isError, refetch } = useQuery<Product[]>({ queryKey: ["/api/products?includeHidden=true"] });
  const { data: categoryRows } = useQuery<ProductCategory[]>({ queryKey: ["/api/product-categories"] });
  const categoryOptions = (categoryRows ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const [showHidden, setShowHidden] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState("all");
  const [sort, setSort] = useState("order");
  const categoryLabel = (key: string) => {
    const c = categoryOptions.find(c => c.key === key);
    return c ? [c.groupLabel, c.label].filter(Boolean).join(" › ") : CATEGORY_LABEL[key] ?? key;
  };
  const resetFilters = () => { setSearch(""); setGroupFilter("all"); setCategoryFilter("all"); setSaleFilter("all"); setSort("order"); };
  const visibleProducts = (products ?? []).filter(p => {
    const c = categoryOptions.find(c => c.key === p.category);
    return (p.hidden === 1) === showHidden
      && (groupFilter === "all" || c?.groupLabel === groupFilter)
      && (categoryFilter === "all" || p.category === categoryFilter)
      && (saleFilter === "all" || p.available === Number(saleFilter))
      && [p.name, p.origin, p.ecountCode, categoryLabel(p.category)].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "ko") : sort === "price" ? a.price - b.price || a.id - b.id : a.sortOrder - b.sortOrder || a.id - b.id);
  const invalidateProducts = () => queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/products") || q.queryKey[0] === "/api/admin/offer-list" });
  async function toggleHidden(p: Product) {
    setVisibilityBusy(p.id);
    try {
      await apiRequest("PATCH", `/api/admin/products/${p.id}`, { hidden: p.hidden === 1 ? 0 : 1 });
      await invalidateProducts();
      toast({ title: p.hidden === 1 ? "상품을 다시 표시합니다" : "상품을 숨겼습니다", description: "과거 주문·정산 기록과 판매 상태는 유지됩니다." });
    } catch (error) {
      toast({ title: "변경하지 못했습니다", description: errMsg(error), variant: "destructive" });
    } finally { setVisibilityBusy(null); }
  }

  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm({ ...empty, category: categoryFilter !== "all" ? categoryFilter : empty.category });
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
      costPrice: String((p as any).costPrice ?? 0),
      available: p.available === 1,
      minOrderQty: String((p as any).minOrderQty ?? 0),
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
      // B-1: 강화 필드(맛노트/산미/바디/추천추출/원산지·가공)는 양식 공통으로 포함
      const enriched = {
        tastingNotes: d.tastingNotes,
        originProcess: d.originProcess,
        // 권장 레시피 — 에스프레소/필터 중 택1 (양식 공통)
        recipeType: d.recipeType,
        espBasket: d.espBasket,
        espTemp: d.espTemp,
        espDose: d.espDose,
        espYield: d.espYield,
        espTime: d.espTime,
        filDripper: d.filDripper,
        filPaper: d.filPaper,
        filDose: d.filDose,
        filGrind: d.filGrind,
        filWater: d.filWater,
        filTemp: d.filTemp,
        filTime: d.filTime,
      };
      const detailObj =
        tpl === "blend"
          ? {
              template: "blend" as const,
              tagline: d.tagline,
              blendRatio: d.blendRatio,
              blendComponents: d.blendComponents,
              flavorNotes: d.flavorNotes,
              roastLevel: d.roastLevel,
              ...enriched,
            }
          : {
              template: "single" as const,
              tagline: d.tagline,
              country: d.country,
              region: d.region,
              farm: d.farm,
              farmer: d.farmer,
              variety: d.variety,
              process: d.process,
              altitude: d.altitude,
              flavorNotes: d.flavorNotes,
              roastLevel: d.roastLevel,
              ...enriched,
            };
      const payload = {
        name: form.name,
        category: form.category,
        origin: form.origin,
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        available: form.available ? 1 : 0,
        minOrderQty: Number(form.minOrderQty) || 0,
        sortOrder: Number(form.sortOrder) || 0,
        ecountCode: form.ecountCode.trim(),
        detailTemplate: tpl,
        detailJson: JSON.stringify({ ...storedDetailObject(editing?.detailJson), ...detailObj,
          description: form.detail.description, recommendedUse: form.detail.recommendedUse,
          specifications: form.detail.specifications, compatibility: form.detail.compatibility,
        }),
        detailImages: JSON.stringify(form.detailImages),
      };
      if (editing) {
        await apiRequest("PATCH", `/api/admin/products/${editing.id}`, payload);
      } else {
        await apiRequest("POST", "/api/admin/products", payload);
      }
      invalidateProducts();
      setOpen(false);
      toast({ title: editing ? "상품 수정 완료" : "상품 추가 완료" });
    } catch (err: any) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(p: Product) {
    setVisibilityBusy(p.id);
    try {
      await apiRequest("PATCH", `/api/admin/products/${p.id}`, { available: p.available === 1 ? 0 : 1 });
      await invalidateProducts();
    } catch (error) {
      toast({ title: "판매 상태 변경 실패", description: errMsg(error), variant: "destructive" });
    } finally { setVisibilityBusy(null); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/admin/products/${deleteTarget.id}`);
      invalidateProducts();
      setDeleteTarget(null);
      toast({ title: "상품 삭제됨" });
    } catch (error) { toast({ title: "삭제 실패", description: errMsg(error), variant: "destructive" }); }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Products</div>
            <h1 className="font-display mt-1 text-xl font-semibold text-foreground">상품 관리</h1>
            <p className="mt-2 text-sm text-muted-foreground">상품을 검색하고 가격·판매 상태·분류를 한곳에서 관리하세요.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" asChild><Link href="/admin/product-categories">분류 관리</Link></Button>
          <Button variant="outline" asChild><Link href="/admin/offer-list"><FileText className="mr-1.5 h-4 w-4"/>오퍼리스트</Link></Button>
          <Button onClick={openNew} data-testid="button-new-product">
            <Plus className="mr-1.5 h-4 w-4" /> 상품 추가
          </Button>
          </div>
        </div>

        <Card className="mb-5 space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2"><Label htmlFor="product-search">상품 검색</Label><Input id="product-search" type="search" className="mt-1.5" placeholder="상품명, 원산지, 품목코드 검색" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div><Label htmlFor="product-group">대분류</Label><select id="product-group" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setCategoryFilter("all"); }}><option value="all">전체 대분류</option>{Array.from(new Set(categoryOptions.map(c => c.groupLabel).filter(Boolean))).map(g => <option key={g} value={g}>{g}</option>)}</select></div>
            <div><Label htmlFor="product-category-filter">상품 분류</Label><select id="product-category-filter" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">전체 분류</option>{categoryOptions.filter(c => groupFilter === "all" || c.groupLabel === groupFilter).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
            <div><Label htmlFor="product-sale-filter">판매 상태</Label><select id="product-sale-filter" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" value={saleFilter} onChange={e => setSaleFilter(e.target.value)}><option value="all">전체 상태</option><option value="1">판매중</option><option value="0">품절</option></select></div>
          </div>
          <div className="flex gap-2" aria-label="상품 표시 상태">
            <Button variant={!showHidden ? "default" : "outline"} aria-pressed={!showHidden} onClick={() => setShowHidden(false)}>표시 중 {(products ?? []).filter(p => p.hidden !== 1).length}</Button>
            <Button variant={showHidden ? "default" : "outline"} aria-pressed={showHidden} onClick={() => setShowHidden(true)}>숨긴 상품 {(products ?? []).filter(p => p.hidden === 1).length}</Button>
          </div>
          <p className="text-xs text-muted-foreground">숨긴 상품은 주문 목록과 오퍼리스트에서 제외됩니다. 과거 주문·정산 기록은 유지되며, 숨긴 상품에서 다시 표시할 수 있습니다.</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p role="status" className="text-sm font-medium">검색 결과 {visibleProducts.length}개</p>
            <div className="flex items-center gap-2"><Label htmlFor="product-sort">정렬</Label><select id="product-sort" className="h-9 rounded-md border bg-background px-2 text-sm" value={sort} onChange={e => setSort(e.target.value)}><option value="order">노출 순서</option><option value="name">상품명순</option><option value="price">낮은 가격순</option></select><Button variant="ghost" size="sm" onClick={resetFilters}>초기화</Button></div>
          </div>
        </Card>
        {isError ? <Card className="p-8 text-center"><p>상품을 불러오지 못했습니다.</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>다시 시도</Button></Card> : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-none" />)}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {!visibleProducts.length && <p className="p-6 text-center text-sm text-muted-foreground">검색 조건에 맞는 상품이 없습니다. 검색어나 분류를 변경해 주세요.</p>}
              {visibleProducts.map((p) => (
                <div key={p.id} className="grid gap-4 p-4 hover:bg-muted/30 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" data-testid={`row-product-${p.id}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="text-[11px]">{categoryLabel(p.category)}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.origin}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground">
                      <span className="font-semibold tabular">판매 {won(p.price)}</span>
                      {(p as any).costPrice > 0 && (
                        <span className="tabular text-muted-foreground">매입 {won((p as any).costPrice)}</span>
                      )}
                    </div>

                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${p.available ? "text-foreground" : "text-muted-foreground"}`}>
                        {p.available ? "판매중" : "품절"}
                      </span>
                      <Switch
                        aria-label={`${p.name} 판매중`}
                        disabled={visibilityBusy !== null}
                        checked={p.available === 1}
                        onCheckedChange={() => toggleAvailable(p)}
                        data-testid={`switch-available-${p.id}`}
                      />
                    </div>
                    <Button variant="outline" size="sm" disabled={visibilityBusy !== null} onClick={() => toggleHidden(p)} data-testid={`button-hide-${p.id}`}>
                      {visibilityBusy === p.id ? "변경 중…" : p.hidden === 1 ? "다시 표시" : "숨기기"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)} aria-label={`${p.name} 수정`} data-testid={`button-edit-${p.id}`}>
                      <Pencil className="mr-1.5 h-4 w-4" />수정
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
        <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "상품 수정" : "상품 추가"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-1">
            <div className="space-y-1.5">
              <Label className="text-xs">상품명 (중량·규격 포함)</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="예: 실크 블렌드 1kg"
                data-testid="input-product-name"
              />
              <p className="text-[11px] text-muted-foreground">
                중량 또는 규격을 상품명에 표시하세요 (예: 코튼 블렌드 1kg, 포터필터 바스켓 18g).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">카테고리</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger data-testid="select-product-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.length === 0 ? (
                      <>
                        <SelectItem value="blend">블렌드</SelectItem>
                        <SelectItem value="decaf">디카페인</SelectItem>
                        <SelectItem value="single">싱글 오리진</SelectItem>
                      </>
                    ) : (
                      categoryOptions.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{categoryLabel(c.key)}{c.active === 0 ? " (분류 숨김)" : ""}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">정렬 순서</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} data-testid="input-product-sort" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">최소 주문 수량 (0이면 제한 없음)</Label>
              <Input
                type="number"
                min="0"
                value={form.minOrderQty}
                onChange={(e) => set("minOrderQty", e.target.value)}
                placeholder="예: 드립백 6"
                data-testid="input-product-min-order"
              />
              <p className="text-[11px] text-muted-foreground">이 상품을 주문할 때 요구되는 최소 개수입니다. (원두 5kg 규칙과 별개)</p>
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
              <Label className="text-xs">매입금 (원) · 관리자 전용</Label>
              <Input
                type="number"
                value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)}
                placeholder="예: 18000 (클라리멘토 매입가)"
                data-testid="input-product-cost-price"
              />
              <p className="text-[11px] text-muted-foreground">발주 관리에서 이 상품의 기본 매입 단가로 적용됩니다. 거래처에는 표시되지 않습니다.</p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="text-sm">판매중</Label>
              <Switch checked={form.available} onCheckedChange={(v) => set("available", v)} data-testid="switch-form-available" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="product-origin">원산지·상품 설명</Label><Input id="product-origin" value={form.origin} onChange={e => set("origin", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="product-code">이카운트 품목코드</Label><Input id="product-code" value={form.ecountCode} onChange={e => set("ecountCode", e.target.value)} /></div>
            </div>
            <details className="rounded-md border p-4"><summary className="cursor-pointer text-sm font-semibold">상세 콘텐츠·이미지 편집</summary>
            <p className="my-3 text-xs text-muted-foreground">선택한 상품 분류에 맞는 정보를 입력하세요. 상세 정보와 이미지는 고객 상품 상세에 표시됩니다.</p>
            {/* 상세페이지 양식 + 이미지 */}
            <ProductDetailEditor
              productInfoTitle={productDetailKind(form.category, categoryOptions.find(c => c.key === form.category)).coffee ? undefined : productDetailKind(form.category, categoryOptions.find(c => c.key === form.category)).title}
              template={form.detailTemplate}
              setTemplate={(t) => setForm((f) => ({ ...f, detailTemplate: t }))}
              detail={form.detail}
              setDetail={setDetail}
              images={form.detailImages}
              setImages={(imgs) => setForm((f) => ({ ...f, detailImages: imgs }))}
            />
          </details>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
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
