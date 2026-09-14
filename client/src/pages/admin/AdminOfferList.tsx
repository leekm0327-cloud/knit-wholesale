import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, FileText, Link2, Loader2, Printer, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminFold } from "@/components/AdminFold";
import { OfferListDocument } from "@/components/OfferListDocument";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { OFFER_SHARE_URL, offerDate, offerText, sameOffer, type OfferList } from "@shared/offer-list";

const key = ["/api/admin/offer-list"];
const readOffer = async (): Promise<OfferList> => (await apiRequest("GET", key[0])).json();
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export default function AdminOfferList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, error, isPending, isFetching, refetch } = useQuery<OfferList>({
    queryKey: key, queryFn: readOffer, enabled: user?.role === "admin",
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true,
  });
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copyFallback, setCopyFallback] = useState("");
  const restoreTitle = useRef<null | (() => void)>(null);
  useEffect(() => () => restoreTitle.current?.(), []);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(OFFER_SHARE_URL);
      toast({ title: "공유 링크를 복사했어요", description: "카카오톡채널 버튼의 링크 주소에 붙여넣으세요." });
    } catch {
      toast({ title: "아래 공유 주소를 선택해 복사해 주세요" });
      const input = document.getElementById("offer-share-url") as HTMLInputElement | null;
      input?.focus(); input?.select();
    }
  }

  async function exportList(kind: "copy" | "print") {
    if (!data || busy || isFetching || error) return;
    setBusy(true); setCopyFallback("");
    try {
      const fresh = await readOffer();
      queryClient.setQueryData(key, fresh);
      if (!sameOffer(data, fresh)) {
        toast({ title: "상품 정보가 바뀌어 갱신했습니다", description: "최신 오퍼리스트를 확인한 뒤 다시 저장하거나 복사해 주세요." });
        return;
      }
      if (!fresh.count) return;
      if (kind === "copy") {
        const text = offerText(fresh, showPrice);
        try {
          await navigator.clipboard.writeText(text);
          toast({ title: "오퍼리스트를 복사했어요", description: "카카오톡이나 메일에 붙여넣을 수 있습니다." });
        } catch {
          setCopyFallback(text);
          toast({ title: "아래 글을 선택해 복사해 주세요", description: "이 브라우저에서는 자동 복사를 허용하지 않았습니다." });
        }
      } else {
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]);
        await nextPaint();
        const logo = document.querySelector<HTMLImageElement>(".offer-masthead img");
        if (logo && !logo.complete) await logo.decode();
        restoreTitle.current?.();
        const oldTitle = document.title;
        const restore = () => { document.title = oldTitle; window.removeEventListener("afterprint", restore); restoreTitle.current = null; };
        restoreTitle.current = restore;
        document.title = `니트커피_오퍼리스트_${offerDate(fresh.generatedAt)}`;
        window.addEventListener("afterprint", restore);
        window.print();
      }
    } catch (e) {
      toast({ title: "오퍼리스트를 확인하지 못했습니다", description: errMsg(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  const disabled = busy || isFetching || !data?.count || !!error;
  return <AdminLayout><link rel="stylesheet" href="/offer-list.css"/><div className="offer-page">
    <div className="offer-heading"><div><h1>오퍼리스트</h1><p>현재 주문 가능한 상품으로 자동 구성합니다.</p></div>
      <Button variant="outline" onClick={() => refetch()} disabled={busy || isFetching} data-testid="offer-refresh"><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />최신 상품 반영</Button>
    </div>
    <AdminFold id="offer-list-guide" title="포함 기준·사용 방법">
      <p>판매 중이며 사이트에 노출하는 카테고리의 상품만 포함합니다. 숨김 카테고리·품절 상품은 자동으로 제외합니다.</p>
      <p>상품 관리의 기본 도매가를 사용하며, 부가세 별도입니다. 거래처별 약정 가격은 적용하지 않습니다. 상품 정보 수정은 <Link href="/admin/products" className="underline">상품 관리</Link>에서 할 수 있습니다.</p>
      <p>PDF 저장은 인쇄 화면에서 ‘PDF로 저장’을 선택하세요. 저장·복사 직전에 판매 상태와 가격을 다시 확인합니다. 저장한 파일은 이후 상품 변경에 따라 바뀌지 않으므로 다시 생성해 주세요.</p>
    </AdminFold>
    <div className="offer-share-panel">
      <label htmlFor="offer-share-url">거래처 공유 링크</label>
      <div className="offer-share-row">
        <input id="offer-share-url" readOnly value={OFFER_SHARE_URL} onFocus={e => e.currentTarget.select()}/>
        <Button variant="outline" onClick={copyShareLink}><Link2 className="mr-2 h-4 w-4"/>링크 복사</Button>
        <Button variant="outline" asChild><a href={OFFER_SHARE_URL} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4"/>공유 화면 보기</a></Button>
      </div>
      <p>로그인 없이 최신 판매 상품과 기본 도매가를 볼 수 있습니다. 아래 가격 표시 선택은 PDF·글 복사에만 적용됩니다.</p>
    </div>
    <div className="offer-controls"><label><input type="checkbox" checked={showPrice} onChange={e => { setShowPrice(e.target.checked); setCopyFallback(""); }} disabled={busy} />도매가 표시</label>
      <div className="offer-actions">
        <Button variant="outline" onClick={() => exportList("copy")} disabled={disabled} data-testid="offer-copy"><Copy className="mr-2 h-4 w-4"/>글 복사</Button>
        <Button onClick={() => exportList("print")} disabled={disabled} data-testid="offer-print"><Printer className="mr-2 h-4 w-4"/>인쇄 / PDF 저장</Button>
      </div>
    </div>
    {busy && <p className="offer-state" role="status">최신 상품 정보를 확인하고 있어요…</p>}
    {error ? <div className="offer-error" role="alert">상품을 불러오지 못했습니다. 최신 상품 반영을 눌러 다시 시도해 주세요.</div> : isPending ? <p className="offer-state" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>상품을 불러오고 있어요…</p> : data && <>
      <p className="offer-state">현재 {data.count}종 · 품절 {data.excluded.soldOut}종, 숨김·미분류 {data.excluded.hidden}종 제외{data.excluded.unnamed ? ` · 상품명 없는 ${data.excluded.unnamed}종 제외` : ""}</p>
      {data.count ? <OfferListDocument list={data} showPrice={showPrice}/> : <div className="offer-error"><FileText className="mb-2 h-5 w-5"/>현재 오퍼리스트에 담을 상품이 없습니다. <Link href="/admin/products" className="underline">상품 관리에서 판매 상태 확인</Link></div>}
    </>}
    {copyFallback && <div className="offer-copy-box"><label htmlFor="offer-copy-text">복사할 오퍼리스트</label><textarea id="offer-copy-text" readOnly value={copyFallback} onFocus={e => e.currentTarget.select()}/></div>}
  </div></AdminLayout>;
}
