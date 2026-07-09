import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtDate, errMsg } from "@/lib/format";
import {
  Newspaper,
  Plus,
  Trash2,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  Loader2,
  Pencil,
  Eye,
} from "lucide-react";

type NewsBlock =
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string };

type NewsItem = {
  id: number;
  title: string;
  coverImage: string;
  blocks: NewsBlock[];
  status: "draft" | "published";
  pinned: number;
  viewCount: number;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
};

const MAX_IMG = 5 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("이미지 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

export default function AdminNews() {
  const { toast } = useToast();
  const { data: list, isLoading } = useQuery<NewsItem[]>({ queryKey: ["/api/admin/news"] });

  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [blocks, setBlocks] = useState<NewsBlock[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const coverRef = useRef<HTMLInputElement>(null);
  const blockImgRef = useRef<HTMLInputElement>(null);

  function openNew() {
    setEditing(null);
    setIsNew(true);
    setTitle("");
    setCoverImage("");
    setBlocks([]);
    setStatus("draft");
    setPinned(false);
  }
  function openEdit(n: NewsItem) {
    setEditing(n);
    setIsNew(false);
    setTitle(n.title);
    setCoverImage(n.coverImage);
    setBlocks(n.blocks ?? []);
    setStatus(n.status);
    setPinned(n.pinned === 1);
  }
  function closeForm() {
    setEditing(null);
    setIsNew(false);
  }

  const formOpen = isNew || editing !== null;

  async function onCoverChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_IMG) {
      toast({ variant: "destructive", title: "이미지 크기 초과", description: "커버 이미지는 5MB 이하만 가능합니다." });
      return;
    }
    setCoverImage(await fileToDataUrl(file));
  }
  async function onBlockImageChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_IMG) {
      toast({ variant: "destructive", title: "이미지 크기 초과", description: "이미지는 5MB 이하만 가능합니다." });
      return;
    }
    const src = await fileToDataUrl(file);
    setBlocks((prev) => [...prev, { type: "image", src }]);
  }

  function addParagraph() {
    setBlocks((prev) => [...prev, { type: "paragraph", text: "" }]);
  }
  function updateParagraph(idx: number, text: string) {
    setBlocks((prev) => prev.map((b, i) => (i === idx && b.type === "paragraph" ? { ...b, text } : b)));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function removeBlock(idx: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "제목을 입력해 주세요." });
      return;
    }
    setSaving(true);
    try {
      const payload = { title, coverImage, blocks, status, pinned };
      if (isNew) {
        await apiRequest("POST", "/api/admin/news", payload);
        toast({ title: "소식 작성 완료" });
      } else if (editing) {
        await apiRequest("PATCH", `/api/admin/news/${editing.id}`, payload);
        toast({ title: "소식 수정 완료" });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      closeForm();
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(n: NewsItem) {
    if (!window.confirm(`"${n.title}" 소식을 삭제하시겠습니까?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/news/${n.id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      toast({ title: "삭제 완료" });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">News</div>
            <h1 className="font-display mt-1 text-xl font-semibold text-foreground">니트커피 소식 관리</h1>
          </div>
          {!formOpen && (
            <Button onClick={openNew} data-testid="button-news-new">
              <Plus className="mr-1.5 h-4 w-4" />
              소식 작성
            </Button>
          )}
        </div>

        {formOpen ? (
          <Card className="space-y-5 p-5">
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground">제목</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="소식 제목" data-testid="input-news-title" />
            </div>

            {/* 커버 이미지 */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground">커버 이미지</label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => coverRef.current?.click()} data-testid="button-news-cover">
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> 커버 선택
                </Button>
                {coverImage && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCoverImage("")}>
                    제거
                  </Button>
                )}
                <span className="text-[11px] text-muted-foreground">3:2 비율 권장 · 5MB 이하</span>
              </div>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onCoverChange(e.target.files); e.target.value = ""; }} />
              {coverImage && (
                <div className="mt-2 aspect-[3/2] w-full max-w-sm overflow-hidden rounded-md border border-border">
                  <img src={coverImage} alt="커버" className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {/* 본문 블록 에디터 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">본문</label>
              <div className="space-y-3">
                {blocks.length === 0 && (
                  <p className="text-xs text-muted-foreground">문단 또는 이미지를 추가해 본문을 구성하세요.</p>
                )}
                {blocks.map((b, idx) => (
                  <div key={idx} className="rounded-md border border-border p-3" data-testid={`block-news-${idx}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <Badge variant="secondary">{b.type === "paragraph" ? "문단" : "이미지"}</Badge>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => moveBlock(idx, -1)} disabled={idx === 0}>
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1}>
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeBlock(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {b.type === "paragraph" ? (
                      <Textarea
                        value={b.text}
                        onChange={(e) => updateParagraph(idx, e.target.value)}
                        placeholder="문단 내용을 입력하세요"
                        rows={4}
                        data-testid={`textarea-news-block-${idx}`}
                      />
                    ) : (
                      <img src={b.src} alt="" className="max-h-64 rounded-md object-contain" />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addParagraph} data-testid="button-news-add-paragraph">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> 문단 추가
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => blockImgRef.current?.click()} data-testid="button-news-add-image">
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> 이미지 추가
                </Button>
                <input ref={blockImgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onBlockImageChange(e.target.files); e.target.value = ""; }} />
              </div>
            </div>

            {/* 발행/고정 */}
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={status === "published"}
                  onCheckedChange={(v) => setStatus(v ? "published" : "draft")}
                  data-testid="checkbox-news-published"
                />
                발행 (체크 해제 시 초안)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={pinned} onCheckedChange={(v) => setPinned(!!v)} data-testid="checkbox-news-pinned" />
                상단 고정
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={closeForm}>취소</Button>
              <Button onClick={save} disabled={saving} data-testid="button-news-save">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
            </div>
          </Card>
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (list ?? []).length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            아직 작성된 소식이 없습니다.
          </Card>
        ) : (
          <div className="space-y-2">
            {(list ?? []).map((n) => (
              <Card key={n.id} className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-news-${n.id}`}>
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-muted">
                  {n.coverImage ? (
                    <img src={n.coverImage} alt={n.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">니트커피</div>
                  )}
                </div>
                <div className="min-w-[160px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{n.title}</span>
                    {n.pinned === 1 && <Badge variant="secondary">고정</Badge>}
                    {n.status === "published" ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">발행</Badge>
                    ) : (
                      <Badge variant="secondary">초안</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{n.publishedAt ? fmtDate(n.publishedAt) : "미발행"}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{n.viewCount}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(n)} data-testid={`button-news-edit-${n.id}`}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> 수정
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(n)} data-testid={`button-news-delete-${n.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
