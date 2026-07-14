import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { EspressoLogCharts } from "@/components/EspressoLogCharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { EspressoSetupItem } from "@shared/schema";
import { ESPRESSO_ICON_OPTIONS, resolveEspressoIcon } from "@/lib/espressoIcons";
import { Trash2, Plus, Loader2, ChevronUp, ChevronDown, Check } from "lucide-react";

type Draft = { icon: string; label: string; value: string };

function IconPicker({ value, onChange, testid }: { value: string; onChange: (v: string) => void; testid?: string }) {
  const Icon = resolveEspressoIcon(value);
  const known = ESPRESSO_ICON_OPTIONS.some((o) => o.key === value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <select
        value={known ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="">아이콘 선택</option>
        {ESPRESSO_ICON_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function AdminEspresso() {
  const { toast } = useToast();
  const { data: items, isLoading } = useQuery<EspressoSetupItem[]>({
    queryKey: ["/api/espresso-setup"],
  });

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [newItem, setNewItem] = useState<Draft>({ icon: "", label: "", value: "" });
  const [busy, setBusy] = useState(false);

  const sorted = (items ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const draftOf = (it: EspressoSetupItem): Draft => drafts[it.id] ?? { icon: it.icon, label: it.label, value: it.value };
  const setDraft = (id: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? sorted.find((s) => s.id === id)!), ...patch } }));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/espresso-setup"] });
  }

  async function saveRow(it: EspressoSetupItem) {
    const d = draftOf(it);
    if (!d.label.trim()) {
      toast({ variant: "destructive", title: "카테고리명을 입력해 주세요." });
      return;
    }
    try {
      await apiRequest("PATCH", `/api/admin/espresso-setup/${it.id}`, { icon: d.icon, label: d.label.trim(), value: d.value });
      toast({ title: "저장되었습니다." });
      setDrafts((prev) => { const n = { ...prev }; delete n[it.id]; return n; });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    }
  }

  async function addItem() {
    if (!newItem.label.trim()) {
      toast({ variant: "destructive", title: "카테고리명을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/espresso-setup", { icon: newItem.icon, label: newItem.label.trim(), value: newItem.value });
      toast({ title: "추가되었습니다." });
      setNewItem({ icon: "", label: "", value: "" });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(it: EspressoSetupItem) {
    if (!confirm(`'${it.label}' 항목을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/espresso-setup/${it.id}`);
      toast({ title: "삭제되었습니다." });
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
      await apiRequest("POST", "/api/admin/espresso-setup/reorder", { orderedIds: arr.map((c) => c.id) });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "순서 변경 실패", description: errMsg(e) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Espresso log</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">에스프레소 추출 로그</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          추출 환경(인포그래픽)을 수정하고, 구글폼 응답 기반 레시피 집계를 확인합니다. 공개 페이지·메인 화면에도 동일하게 노출됩니다.
        </p>

        {/* 추출 환경 편집 */}
        <Card className="mb-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">추출 환경 편집</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">이모지 · 카테고리 · 내용을 수정하고, 화살표로 순서를 바꿉니다.</p>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((it, idx) => {
                const d = draftOf(it);
                const dirty = !!drafts[it.id];
                return (
                  <div key={it.id} className="flex flex-wrap items-center gap-2 p-4" data-testid={`row-setup-${it.id}`}>
                    <div className="flex flex-col">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground disabled:opacity-30 hover:text-foreground" aria-label="위로">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx === sorted.length - 1} className="text-muted-foreground disabled:opacity-30 hover:text-foreground" aria-label="아래로">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <IconPicker value={d.icon} onChange={(v) => setDraft(it.id, { icon: v })} testid={`select-setup-icon-${it.id}`} />
                    <Input value={d.label} onChange={(e) => setDraft(it.id, { label: e.target.value })} placeholder="카테고리" className="w-40" data-testid={`input-setup-label-${it.id}`} />
                    <Input value={d.value} onChange={(e) => setDraft(it.id, { value: e.target.value })} placeholder="내용" className="min-w-[8rem] flex-1" data-testid={`input-setup-value-${it.id}`} />
                    <Button size="icon" variant={dirty ? "default" : "ghost"} onClick={() => saveRow(it)} aria-label="저장" data-testid={`button-setup-save-${it.id}`}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(it)} aria-label="삭제" data-testid={`button-setup-delete-${it.id}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {/* 추가 */}
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-4">
            <IconPicker value={newItem.icon} onChange={(v) => setNewItem((s) => ({ ...s, icon: v }))} testid="select-newsetup-icon" />
            <Input value={newItem.label} onChange={(e) => setNewItem((s) => ({ ...s, label: e.target.value }))} placeholder="카테고리 (예: TAMPER)" className="w-40" data-testid="input-newsetup-label" />
            <Input value={newItem.value} onChange={(e) => setNewItem((s) => ({ ...s, value: e.target.value }))} placeholder="내용" className="min-w-[8rem] flex-1" data-testid="input-newsetup-value" />
            <Button onClick={addItem} disabled={busy} data-testid="button-add-setup">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              추가
            </Button>
          </div>
        </Card>

        {/* 미리보기 (공개 화면과 동일) */}
        <h2 className="mb-3 text-sm font-semibold text-foreground">미리보기</h2>
        <EspressoLogCharts />
      </div>
    </AdminLayout>
  );
}
