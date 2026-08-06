import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { QuoteDocument } from "@/components/QuoteDocument";
import { Loader2, Printer } from "lucide-react";
import type { QuoteView as QuoteViewType } from "@shared/schema";

export default function QuoteView() {
  const [, params] = useRoute("/quote/:token");
  const token = params?.token ?? "";

  const { data, isLoading, isError } = useQuery<QuoteViewType>({
    queryKey: ["/api/quote/public", token],
    queryFn: async () => {
      const res = await fetch(`/api/quote/public/${token}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  function print() {
    const prev = document.title;
    const name = (data?.customerName || "견적서").replace(/[\\/:*?"<>|]/g, "").trim();
    document.title = `견적서_${name || "니트커피"}`;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 3000);
    window.print();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#e6e3db", padding: "28px 16px" }}>
      <style>{`@media print{ body{background:#fff} .qv-noprint{display:none!important} }`}</style>

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#9a978f" }} />
        </div>
      ) : isError || !data ? (
        <div style={{ maxWidth: 620, margin: "60px auto", textAlign: "center", color: "#6f6c5f", fontSize: 14 }}>
          견적서를 찾을 수 없습니다. 링크를 다시 확인해 주세요.
        </div>
      ) : (
        <>
          <div className="qv-noprint" style={{ maxWidth: 620, margin: "0 auto 14px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={print}
              data-testid="button-print-quote"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: ".02em",
                background: "#20201e", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", cursor: "pointer",
              }}
            >
              <Printer className="h-4 w-4" /> 인쇄 / PDF 저장
            </button>
          </div>
          <QuoteDocument quote={data} />
        </>
      )}
    </div>
  );
}
