import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import type { ProductCategory } from "@shared/schema";
import { Tags, Trash2, Plus, Loader2, ChevronUp, ChevronDown, Check, Pencil, X } from "lucide-react";

// 표시명 → 코드값(key) 자동 생성 (영문/숫자만 남기고 소문자화; 한글이면 빈 값)
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function AdminProductCategories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = (user as any)?.adminRole === "owner";

  const { data: cats, isLoading } = useQuery<ProductCategory[]>({
    queryKey: ["/api/product-categories"],
  });

  // 추가 폼
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newIsBean, setNewIsBean] = useState(true);
  const [newSample, setNewSample] = useState(false);
  const [busy, setBusy] = useState(false);

  // 라벨 인라인 수정
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const sorted = (cats ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/product-categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
  }

  async function addCategory() {
    const label = newLabel.trim();
    const key = (newKey.trim() || slugify(label));
    if (!label) {
      toast({ variant: "destructive", title: "표시명을 입력해 주세요." });
      return;
    }
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      toast({
        variant: "destructive",
        title: "코드값이 필요합니다.",
        description: "영문 소문자·숫자·밑줄(_)로 코드값을 입력해 주세요. (예: cold_brew)",
      });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/product-categories", {
        key,
        label,
        isBean: newIsBean,
        sampleEligible: newSample,
        active: true,
      });
      toast({ title: "카테고리가 추가되었습니다." });
      invalidate();
      setNewLabel("");
      setNewKey("");
      setNewIsBean(true);
      setNewSample(false);
    } catch (e) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function patchCategory(c: ProductCategory, patch: Record<string, any>) {
    try {
      await apiRequest("PATCH", `/api/admin/product-categories/${c.id}`, patch);
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "변경 실패", description: errMsg(e) });
    }
  }

  async function saveLabel(c: ProductCategory) {
    const label = editLabel.trim();
    if (!label) {
      toast({ variant: "destructive", title: "표시명을 입력해 주세요." });
      return;
    }
    await patchCategory(c, { label });
    setEditingId(null);
  }

  async function remove(c: ProductCategory) {
    if (!confirm(`'${c.label}' 카테고리를 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/product-categories/${c.id}`);
      toast({ title: "카테고리가 삭제되었습니다." });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const arr = sorted.slice();
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    try {
      await apiRequest("POST", "/api/admin/product-categories/reorder", {
        orderedIds: arr.map((c) => c.id),
      });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "순서 변경 실패", description: errMsg(e) });
    }
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Product categories</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">상품 카테고리</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          카탈로그에 노출되는 카테고리와 순서를 관리합니다. '원두'는 5kg 최소주문 수량에 포함되는 카테고리, '샘플'은 무료 샘플 신청이 가능한 카테고리입니다.
        </p>

        {/* 추가 폼 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">카테고리 추가</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">표시명 *</Label>
              <Input
                value={newLabel}
                onChange={(e) => {
                  setNewLabel(e.target.value);
                }}
                placeholder="예: 콜드브루"
                data-testid="input-newcat-label"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">코드값 (영문, 비우면 자동)</Label>
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={newLabel ? slugify(newLabel) || "cold_brew" : "예: cold_brew"}
                data-testid="input-newcat-key"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={newIsBean} onChange={(e) => setNewIsBean(e.target.checked)} data-testid="check-newcat-bean" />
              원두 (최소주문 5kg 포함)
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={newSample} onChange={(e) => setNewSample(e.target.checked)} data-testid="check-newcat-sample" />
              샘플 대상
            </label>
            <Button className="ml-auto" onClick={addCategory} disabled={busy} data-testid="button-add-category">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              추가
            </Button>
          </div>
        </Card>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">카테고리 목록 (위에서부터 카탈로그 노출 순서)</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Tags className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 카테고리가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-3 p-4" data-testid={`row-category-${c.id}`}>
                  {/* 순서 이동 */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="위로"
                      className="text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      data-testid={`button-up-${c.id}`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === sorted.length - 1}
                      aria-label="아래로"
                      className="text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      data-testid={`button-down-${c.id}`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 표시명 (인라인 수정) */}
                  <div className="min-w-0 flex-1">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) saveLabel(c); }}
                          className="h-8 max-w-xs"
                          data-testid={`input-edit-label-${c.id}`}
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveLabel(c)} aria-label="저장">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)} aria-label="취소">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm font-semibold ${c.active === 0 ? "text-muted-foreground line-through" : "text-foreground"}`}>
                          {c.label}
                        </span>
                        <button
                          onClick={() => { setEditingId(c.id); setEditLabel(c.label); }}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="이름 수정"
                          data-testid={`button-edit-label-${c.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{c.key}</div>
                  </div>

                  {/* 토글들 */}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={c.isBean === 1}
                      onChange={(e) => patchCategory(c, { isBean: e.target.checked })}
                      data-testid={`check-bean-${c.id}`}
                    />
                    원두
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={c.sampleEligible === 1}
                      onChange={(e) => patchCategory(c, { sampleEligible: e.target.checked })}
                      data-testid={`check-sample-${c.id}`}
                    />
                    샘플
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={c.active === 1}
                      onChange={(e) => patchCategory(c, { active: e.target.checked })}
                      data-testid={`check-active-${c.id}`}
                    />
                    표시
                  </label>

                  <Button variant="ghost" size="icon" onClick={() => remove(c)} aria-label="삭제" data-testid={`button-delete-category-${c.id}`}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
