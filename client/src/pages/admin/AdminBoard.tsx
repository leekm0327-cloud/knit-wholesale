import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDateTime } from "@/lib/format";
import type { PostWithMeta, Post, Comment } from "@shared/schema";
import { Pin, MessageCircle, Eye, ImagePlus, X, Trash2 } from "lucide-react";

const TABS = [
  { key: "notice", label: "공지" },
  { key: "inquiry", label: "문의" },
  { key: "free", label: "자유" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function AdminBoard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("notice");
  const [writeOpen, setWriteOpen] = useState(false);
  const [activePostId, setActivePostId] = useState<number | null>(null);

  const { data: posts, isLoading } = useQuery<PostWithMeta[]>({
    queryKey: [`/api/posts?category=${tab}`],
  });

  // 관리자는 모든 탭에 글쓰기 가능
  const canWrite = true;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1">Admin board</p>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              게시판 관리
            </h1>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-right">
            공지/문의/자유 게시판을 관리합니다. 모든 글을 삭제할 수 있습니다.
          </p>
        </div>

        {/* 탭 */}
        <div className="mb-5 flex items-center justify-between border-b border-border">
          <div className="flex gap-6">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`relative py-3 font-ui text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                  tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-foreground" />
                )}
              </button>
            ))}
          </div>

          {canWrite && (
            <Button
              size="sm"
              onClick={() => setWriteOpen(true)}
              data-testid="button-write-post"
            >
              글쓰기
            </Button>
          )}
        </div>

        {/* 글 목록 */}
        {isLoading ? (
          <div className="divide-y divide-border border-y border-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-none" />
            ))}
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="border-y border-border py-16 text-center text-sm text-muted-foreground">
            아직 등록된 글이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {posts.map((p) => (
              <PostRow key={p.id} post={p} onOpen={() => setActivePostId(p.id)} />
            ))}
          </ul>
        )}
      </div>

      {/* 작성 다이얼로그 */}
      {writeOpen && (
        <WriteDialog
          category={tab}
          isAdmin={true}
          onClose={() => setWriteOpen(false)}
        />
      )}

      {/* 상세 다이얼로그 */}
      {activePostId !== null && (
        <PostDetailDialog
          postId={activePostId}
          isAdmin={true}
          currentUserId={user?.id ?? null}
          onClose={() => setActivePostId(null)}
        />
      )}
    </AdminLayout>
  );
}

function PostRow({ post, onOpen }: { post: PostWithMeta; onOpen: () => void }) {
  return (
    <li
      className="cursor-pointer px-4 py-3 transition-colors hover:bg-muted/20"
      onClick={onOpen}
      data-testid={`row-post-${post.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {post.pinned === 1 && (
              <span className="inline-flex items-center gap-1 border border-foreground bg-foreground/5 px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-foreground">
                <Pin className="h-2.5 w-2.5" />
                고정
              </span>
            )}
            {post.isAdmin === 1 && (
              <span className="inline-flex border border-border bg-muted px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-foreground">
                관리자
              </span>
            )}
            <h3 className="truncate text-sm font-semibold text-foreground" data-testid={`text-title-${post.id}`}>
              {post.title}
            </h3>
            {post.commentCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular text-foreground">
                <MessageCircle className="h-3 w-3" />
                {post.commentCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {post.authorBusinessName} · {post.authorManagerName} · {fmtDateTime(post.createdAt)}
            {" · "}
            <Eye className="inline h-3 w-3" /> {post.viewCount}
          </p>
        </div>
      </div>
    </li>
  );
}

function ImagePickerButton({ images, setImages }: { images: string[]; setImages: (v: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    if (images.length + list.length > 10) {
      toast({ title: "이미지는 최대 10장", description: "10장을 초과해 첨부할 수 없습니다.", variant: "destructive" });
      return;
    }
    const next: string[] = [...images];
    let remaining = list.length;
    list.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "이미지 크기 초과", description: `${file.name}은 5MB를 초과합니다.`, variant: "destructive" });
        remaining -= 1;
        if (remaining === 0) setImages(next);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          next.push(reader.result);
        }
        remaining -= 1;
        if (remaining === 0) setImages(next);
      };
      reader.onerror = () => {
        remaining -= 1;
        if (remaining === 0) setImages(next);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          data-testid="button-add-image"
        >
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          사진 첨부
        </Button>
        <span className="text-[11px] text-muted-foreground">{images.length} / 10장 (각 5MB 이하)</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden border border-border">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                aria-label="이미지 제거"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WriteDialog({
  category,
  isAdmin,
  onClose,
}: {
  category: TabKey;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/posts", {
        category,
        title: title.trim(),
        body: body.trim(),
        images,
        pinned: pinned ? 1 : 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts?category=${category}`] });
      toast({ title: "게시글 등록", description: "게시글이 등록되었습니다." });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "등록 실패", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TABS.find((t) => t.key === category)?.label} 글쓰기</DialogTitle>
          <DialogDescription className="text-xs">
            제목과 내용을 입력해 주세요. 사진은 최대 10장까지 첨부할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              제목
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (200자 이내)"
              maxLength={200}
              className="mt-1.5"
              data-testid="input-title"
            />
          </div>

          <div>
            <label className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              내용
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력해 주세요"
              rows={10}
              className="mt-1.5"
              data-testid="textarea-body"
            />
          </div>

          <ImagePickerButton images={images} setImages={setImages} />

          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                data-testid="checkbox-pinned"
              />
              상단 고정 (관리자 전용)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !title.trim() || !body.trim()}
            data-testid="button-submit-post"
          >
            {mutation.isPending ? "등록 중…" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostDetailDialog({
  postId,
  isAdmin,
  currentUserId,
  onClose,
}: {
  postId: number;
  isAdmin: boolean;
  currentUserId: number | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [commentBody, setCommentBody] = useState("");

  const { data, isLoading } = useQuery<Post & { comments: Comment[] }>({
    queryKey: [`/api/posts/${postId}`],
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/posts/${postId}/comments`, { body: commentBody.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${postId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts?category=${data?.category}`] });
      setCommentBody("");
    },
    onError: (e: Error) => {
      toast({ title: "댓글 등록 실패", description: e.message, variant: "destructive" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts?category=${data?.category}`] });
      toast({ title: "게시글 삭제 완료" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${postId}`] });
    },
    onError: (e: Error) => {
      toast({ title: "댓글 삭제 실패", description: e.message, variant: "destructive" });
    },
  });

  const images = (() => {
    if (!data?.images) return [];
    try {
      const arr = JSON.parse(data.images);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
    } catch {}
    return [];
  })();

  // 관리자는 모든 글 삭제 가능
  const canDeletePost = !!data;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    {data.pinned === 1 && (
                      <span className="inline-flex items-center gap-1 border border-foreground bg-foreground/5 px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-foreground">
                        <Pin className="h-2.5 w-2.5" />
                        고정
                      </span>
                    )}
                    {data.isAdmin === 1 && (
                      <span className="inline-flex border border-border bg-muted px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-foreground">
                        관리자
                      </span>
                    )}
                  </div>
                  <DialogTitle className="text-left text-lg" data-testid="text-post-title">{data.title}</DialogTitle>
                  <DialogDescription className="text-left text-[11px]">
                    {data.authorBusinessName} · {data.authorManagerName} · {fmtDateTime(data.createdAt)}
                    {" · "}조회 {data.viewCount}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" data-testid="text-post-body">
                {data.body}
              </p>

              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden border border-border">
                      <img src={src} alt={`첨부 ${i + 1}`} className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {canDeletePost && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("이 게시글을 삭제할까요? 댓글도 함께 삭제됩니다.")) {
                        deletePostMutation.mutate();
                      }
                    }}
                    disabled={deletePostMutation.isPending}
                    data-testid="button-delete-post"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    글 삭제
                  </Button>
                </div>
              )}

              {/* 댓글 */}
              <div className="border-t border-border pt-4">
                <h3 className="mb-3 font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  댓글 {data.comments.length}
                </h3>
                {data.comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">첫 댓글을 남겨 보세요.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.comments.map((c) => (
                      <li key={c.id} className="border-b border-border pb-3 last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 text-xs">
                            <div className="mb-1 flex items-center gap-2">
                              {c.isAdmin === 1 && (
                                <span className="inline-flex border border-border bg-muted px-1 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-foreground">
                                  관리자
                                </span>
                              )}
                              <span className="font-semibold text-foreground">{c.authorBusinessName}</span>
                              <span className="text-muted-foreground">· {c.authorManagerName}</span>
                              <span className="text-muted-foreground">· {fmtDateTime(c.createdAt)}</span>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed text-foreground">{c.body}</p>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                if (confirm("이 댓글을 삭제할까요?")) deleteCommentMutation.mutate(c.id);
                              }}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="댓글 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 space-y-2">
                  <Textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="댓글을 입력해 주세요 (5,000자 이내)"
                    rows={3}
                    data-testid="textarea-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => commentMutation.mutate()}
                      disabled={commentMutation.isPending || !commentBody.trim()}
                      data-testid="button-submit-comment"
                    >
                      {commentMutation.isPending ? "등록 중…" : "댓글 등록"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
