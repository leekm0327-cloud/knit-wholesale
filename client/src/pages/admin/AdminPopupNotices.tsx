import { AdminFold } from "@/components/AdminFold";
import { useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { PopupNotice } from "@shared/schema";
import { POPUP_IMAGE_ACCEPT, POPUP_IMAGE_MAX_BYTES, POPUP_IMAGE_TYPES } from "@shared/popup-image";
import { Loader2, Trash2, Eye, EyeOff, Megaphone, MonitorPlay, ImagePlus, Pencil, X } from "lucide-react";
import { PopupNoticeCard } from "@/components/PopupNotice";
import { NoticeMessageComposer } from "@/components/NoticeMessageComposer";
import { useAuth } from "@/lib/auth";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

type Draft = {
  title: string;
  body: string;
  imageUrl: string;
  orderUntil: string;
  orderResume: string;
  deliveryNote: string;
  startDate: string;
  endDate: string;
};

const EMPTY: Draft = {
  title: "",
  body: "",
  imageUrl: "",
  orderUntil: "",
  orderResume: "",
  deliveryNote: "",
  startDate: today(),
  endDate: "",
};

const KEY = "/api/admin/popup-notices";

export default function AdminPopupNotices() {
  const { user } = useAuth();
  const [messageNoticeId, setMessageNoticeId] = useState<number | null>(null);
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PopupNotice | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formCard = useRef<HTMLDivElement>(null);
  const imageRequest = useRef(0);

  const { data, isLoading } = useQuery<PopupNotice[]>({ queryKey: [KEY] });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
    // 거래처 화면이 바로 새 공지를 받아가도록 캐시도 비운다
    queryClient.invalidateQueries({ queryKey: ["/api/popup-notices/active"] });
  };
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));

  function resetDraft() {
    imageRequest.current++;
    setImageLoading(false);
    setEditingId(null);
    setD({ ...EMPTY, startDate: today() });
    if (fileInput.current) fileInput.current.value = "";
  }

  function edit(n: PopupNotice) {
    resetDraft();
    setEditingId(n.id);
    setD({
      title: n.title, body: n.body, imageUrl: n.imageUrl || "",
      orderUntil: n.orderUntil, orderResume: n.orderResume, deliveryNote: n.deliveryNote,
      startDate: n.startDate, endDate: n.endDate,
    });
    formCard.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function attachImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!POPUP_IMAGE_TYPES.includes(file.type) || file.size > POPUP_IMAGE_MAX_BYTES) {
      toast({ variant: "destructive", title: "5MB 이하의 JPG, PNG, WEBP, GIF 이미지를 선택해 주세요." });
      return;
    }
    const request = ++imageRequest.current;
    setImageLoading(true);
    try {
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("이미지를 열지 못했습니다. 다른 파일을 선택해 주세요."));
        img.src = imageUrl;
      });
      if (request === imageRequest.current) set({ imageUrl });
    } catch (err) {
      if (request === imageRequest.current) toast({ variant: "destructive", title: "이미지 첨부 실패", description: errMsg(err) });
    } finally {
      if (request === imageRequest.current) setImageLoading(false);
    }
  }

  async function create() {
    if (busy || imageLoading) return;
    if (!d.title.trim()) {
      toast({ variant: "destructive", title: "제목을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest(editingId === null ? "POST" : "PATCH", editingId === null ? KEY : `${KEY}/${editingId}`, d);
      toast({ title: editingId === null ? "팝업 공지를 등록했습니다." : "팝업 공지를 수정했습니다." });
      resetDraft();
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(n: PopupNotice) {
    try {
      await apiRequest("PATCH", `${KEY}/${n.id}`, { active: n.active === 1 ? 0 : 1 });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "변경 실패", description: errMsg(err) });
    }
  }

  async function remove(n: PopupNotice) {
    if (!confirm(`'${n.title}' 팝업을 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `${KEY}/${n.id}`);
      if (editingId === n.id) resetDraft();
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  const t = today();
  const isLive = (n: PopupNotice) =>
    n.active === 1 && (!n.startDate || n.startDate <= t) && (!n.endDate || n.endDate >= t);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Popup</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">팝업 공지</h1>
        <AdminFold id="AdminPopupNotices.tsx-intro-0"><p className="mb-6 text-sm text-muted-foreground">
          거래처가 로그인하면 화면 가운데에 뜨는 안내입니다. 택배사 휴무처럼 주문 일정이 바뀔 때 쓰시면 됩니다.
          거래처가 '오늘 하루 보지 않기'를 누르면 그날은 다시 뜨지 않고, 그냥 닫으면 다음 로그인 때 또 뜹니다.
        </p></AdminFold>

        {/* 등록 */}
        <Card className="mb-6 scroll-mt-4 p-5" ref={formCard}>
          <h2 className="mb-4 text-sm font-semibold text-foreground">{editingId === null ? "새 팝업 만들기" : "팝업 수정"}</h2>

          <fieldset className="space-y-4" disabled={busy}>
            <div>
              <Label className="text-xs text-muted-foreground">제목</Label>
              <Input
                value={d.title}
                maxLength={80}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="예: 8월 14일 택배 휴무 안내"
                data-testid="input-popup-title"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="popup-image" className="text-xs text-muted-foreground">공지 이미지 (선택)</Label>
              <input id="popup-image" ref={fileInput} type="file" accept={POPUP_IMAGE_ACCEPT}
                onChange={attachImage} className="sr-only" data-testid="input-popup-image" />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} data-testid="button-attach-popup-image">
                  {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {d.imageUrl ? "이미지 바꾸기" : "이미지 첨부"}
                </Button>
                {(d.imageUrl || imageLoading) && <Button type="button" variant="ghost" onClick={() => {
                  imageRequest.current++; setImageLoading(false); set({ imageUrl: "" });
                }} data-testid="button-remove-popup-image"><X className="h-4 w-4" />이미지 제거</Button>}
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF · 최대 5MB. 이미지에 안내가 모두 담겨 있으면 아래 글 항목은 비워도 됩니다.</p>
              {d.imageUrl && <img src={d.imageUrl} alt="첨부한 공지 이미지" className="max-h-72 max-w-full rounded border object-contain" data-testid="popup-image-preview" />}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">주문 마감</Label>
                <Input
                  value={d.orderUntil}
                  onChange={(e) => set({ orderUntil: e.target.value })}
                  placeholder="8월 13일 (목)까지"
                  data-testid="input-popup-order-until"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">주문 재개</Label>
                <Input
                  value={d.orderResume}
                  onChange={(e) => set({ orderResume: e.target.value })}
                  placeholder="8월 18일 (화)부터"
                  data-testid="input-popup-order-resume"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">배송 안내</Label>
                <Input
                  value={d.deliveryNote}
                  onChange={(e) => set({ deliveryNote: e.target.value })}
                  placeholder="17~18일 도착 예정"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              세 칸은 비워두면 팝업에 나오지 않습니다. 채운 것만 큰 글씨로 보입니다.
            </p>

            <div>
              <Label className="text-xs text-muted-foreground">내용</Label>
              <Textarea
                value={d.body}
                onChange={(e) => set({ body: e.target.value })}
                rows={5}
                placeholder="자세한 안내를 적어주세요."
                data-testid="input-popup-body"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">노출 시작</Label>
                <Input
                  type="date"
                  value={d.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                  className="w-40"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">노출 종료</Label>
                <Input
                  type="date"
                  value={d.endDate}
                  onChange={(e) => set({ endDate: e.target.value })}
                  className="w-40"
                />
              </div>
              <Button onClick={create} disabled={busy || imageLoading} data-testid="button-create-popup">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                {editingId === null ? "등록" : "수정 저장"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || imageLoading}
                onClick={() =>
                  setPreview({
                    id: 0,
                    ...d,
                    active: 1,
                    createdAt: 0,
                    updatedAt: 0,
                  } as PopupNotice)
                }
                data-testid="button-preview-popup"
              >
                <MonitorPlay className="h-4 w-4" />
                미리보기
              </Button>
              {editingId !== null && <Button variant="ghost" onClick={resetDraft} disabled={busy}>수정 취소</Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              종료일을 비우면 직접 끌 때까지 계속 뜹니다. 종료일이 지나면 자동으로 사라집니다.
            </p>
          </fieldset>
        </Card>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">등록된 팝업</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (data ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">아직 등록된 팝업이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {data!.map((n) => (
                <div key={n.id} className="p-4" data-testid={`popup-row-${n.id}`}>
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{n.title}</span>
                        {isLive(n) ? (
                          <Badge className="text-[10px]">노출 중</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            {n.active === 1 ? "기간 아님" : "꺼짐"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {n.startDate || "즉시"} ~ {n.endDate || "직접 끌 때까지"}
                        {n.orderUntil ? ` · 마감 ${n.orderUntil}` : ""}
                        {n.orderResume ? ` · 재개 ${n.orderResume}` : ""}
                      </div>
                      {n.body && (
                        <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</p>
                      )}
                      {n.imageUrl && <img src={n.imageUrl} alt={`${n.title} 이미지`} className="mt-2 h-20 max-w-full rounded border object-contain" />}
                    </div>
                    <div className="flex flex-wrap shrink-0 items-center gap-0.5">
                      {user?.adminRole === "owner" && <Button size="sm" variant="outline" onClick={() => setMessageNoticeId(messageNoticeId === n.id ? null : n.id)} aria-expanded={messageNoticeId === n.id}>
                        <Megaphone className="h-3.5 w-3.5" />거래처에게 보내기
                      </Button>}
                      <Button size="sm" variant="outline" onClick={() => edit(n)} disabled={busy} aria-label={`${n.title} 수정`}>
                        <Pencil className="h-3.5 w-3.5" />수정
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPreview(n)} aria-label="미리보기">
                        <MonitorPlay className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(n)} disabled={busy} aria-label="노출 전환">
                        {n.active === 1 ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(n)}
                        disabled={busy}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {messageNoticeId === n.id && user?.adminRole === "owner" && <NoticeMessageComposer key={n.id} notice={n} onClose={() => setMessageNoticeId(null)} />}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {preview && <PopupNoticeCard notice={preview} onClose={() => setPreview(null)} />}
    </AdminLayout>
  );
}
