import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";

type NewsSummary = {
  id: number;
  title: string;
  coverImage: string;
  pinned: number;
  publishedAt: number;
};

export default function News() {
  const { data: list, isLoading } = useQuery<NewsSummary[]>({ queryKey: ["/api/news"] });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
        <div className="mb-6 border-b border-border pb-6">
          <p className="eyebrow mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">News</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">니트커피 소식</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            니트커피가 전하는 소식과 정보를 확인해 보세요.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : (list ?? []).length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground" data-testid="text-news-empty">
            아직 등록된 소식이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(list ?? []).map((n) => (
              <Link
                key={n.id}
                href={`/news/${n.id}`}
                className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
                data-testid={`card-news-${n.id}`}
              >
                <div className="aspect-[3/2] w-full overflow-hidden bg-muted">
                  {n.coverImage ? (
                    <img src={n.coverImage} alt={n.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">니트커피</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{n.title}</h3>
                  {n.publishedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDate(n.publishedAt)}</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
