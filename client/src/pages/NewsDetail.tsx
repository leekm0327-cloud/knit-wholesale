import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

type NewsBlock =
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string };

type NewsDetailData = {
  id: number;
  title: string;
  coverImage: string;
  blocks: NewsBlock[];
  publishedAt: number;
  viewCount: number;
};

export default function NewsDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading, isError } = useQuery<NewsDetailData>({
    queryKey: [`/api/news/${id}`],
    enabled: Number.isFinite(id),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-8 sm:pt-10">
        <Link href="/news" className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="link-news-back">
          <ArrowLeft className="h-3.5 w-3.5" /> 소식 목록
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="aspect-[3/2] w-full" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="py-24 text-center text-sm text-muted-foreground" data-testid="text-news-notfound">
            소식을 찾을 수 없습니다.
          </div>
        ) : (
          <article>
            {data.coverImage && (
              <img src={data.coverImage} alt={data.title} className="mb-6 w-full rounded-lg object-cover" />
            )}
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground" data-testid="text-news-title">
              {data.title}
            </h1>
            {data.publishedAt ? (
              <p className="mt-2 text-xs text-muted-foreground">{fmtDate(data.publishedAt)}</p>
            ) : null}

            <div className="mt-8 space-y-5">
              {data.blocks.map((b, i) =>
                b.type === "paragraph" ? (
                  <p key={i} className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">
                    {b.text}
                  </p>
                ) : (
                  <img key={i} src={b.src} alt="" className="max-w-full rounded-lg" />
                ),
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
