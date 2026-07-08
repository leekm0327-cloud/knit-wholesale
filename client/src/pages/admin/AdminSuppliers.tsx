import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { Supplier } from "@shared/schema";
import { Factory, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

export default function AdminSuppliers() {
  const { toast } = useToast();
  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/admin/suppliers"],
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dialogOpen) {
      setName(editTarget?.name ?? "");
      setContact(editTarget?.contact ?? "");
      setPhone(editTarget?.phone ?? "");
      setMemo(editTarget?.memo ?? "");
    }
  }, [dialogOpen, editTarget]);

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditTarget(s);
    setDialogOpen(true);
  }

  async function submit() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "공급처 상호를 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      const body = { name: name.trim(), contact, phone, memo };
      if (editTarget) {
        await apiRequest("PATCH", `/api/admin/suppliers/${editTarget.id}`, body);
        toast({ title: "공급처가 수정되었습니다." });
      } else {
        await apiRequest("POST", "/api/admin/suppliers", body);
        toast({ title: "공급처가 등록되었습니다." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
      setDialogOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`공급처 '${s.name}'을(를) 삭제할까요? 발주/지급 내역은 남아 있습니다.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/suppliers/${s.id}`);
      toast({ title: "공급처가 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/suppliers"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="eyebrow">Suppliers</div>
            <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">공급처 관리</h1>
            <p className="text-sm text-muted-foreground">OEM 공장(클라리멘토 등) 공급처 등록 · 관리</p>
          </div>
          <Button onClick={openCreate} data-testid="button-add-supplier">
            <Plus className="mr-1.5 h-4 w-4" />
            공급처 추가
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">공급처 목록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !suppliers || suppliers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Factory className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                등록된 공급처가 없습니다. 가장 먼저 등록한 공급처가 자동발주 대상(대표 공급처)이 됩니다.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {suppliers.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-4"
                  data-testid={`row-supplier-${s.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
                      {idx === 0 && (
                        <span className="shrink-0 border border-foreground px-1.5 py-0.5 font-ui text-[10px] tracking-wide text-foreground">
                          대표 · 자동발주
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      담당 {s.contact || "-"} · {s.phone || "-"}
                    </div>
                    {s.memo && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.memo}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="수정" data-testid={`button-edit-supplier-${s.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="삭제" data-testid={`button-delete-supplier-${s.id}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "공급처 수정" : "공급처 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">상호 *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 클라리멘토" data-testid="input-supplier-name" />
            </div>
            <div>
              <Label className="text-xs">담당자</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="담당자명" data-testid="input-supplier-contact" />
            </div>
            <div>
              <Label className="text-xs">연락처</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" data-testid="input-supplier-phone" />
            </div>
            <div>
              <Label className="text-xs">메모</Label>
              <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-supplier-memo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>취소</Button>
            <Button onClick={submit} disabled={busy} data-testid="button-submit-supplier">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
