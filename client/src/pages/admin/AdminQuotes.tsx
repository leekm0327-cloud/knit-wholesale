import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuoteDocument } from "@/components/QuoteDocument";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QuoteView, QuoteBean } from "@shared/schema";
import { Plus, Trash2, X, ExternalLink, Copy, Pencil, FileText } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DEFAULT_BEANS = ["울 블렌드", "코튼 블렌드", "실크 블렌드", "디카페인"];
const CONSULTING_OPTIONS = [
  "매장 콘셉트 진단 · 원두 매칭",
  "시그니처 음료 레시피 개발 (3종)",
  "계절 · 시즌 한정 메뉴 기획",
  "메뉴별 원가 · 마진 계산 시트",
  "바리스타 추출 교육 (매장 방문)",
  "메뉴판 · 음료 표기 문구 정리",
  "오픈 후 1개월 팔로업 점검",
];

export default function AdminQuotes() {
  const { toast } = useToast();
  const { data: quotes } = useQuery<QuoteView[]>({ queryKey: ["/api/admin/quotes"] });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [validDays, setValidDays] = useState("30");
  const [usageHeaders, setUsageHeaders] = useState<string[]>(["", "", ""]);
  const [beans, setBeans] = useState<QuoteBean[]>(DEFAULT_BEANS.map((n) => ({ name: n, prices: ["", "", ""] })));
  const [consulting, setConsulting] = useState<string[]>([]);
  const [consultingFee, setConsultingFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<QuoteView | null>(null);

  const cols = usageHeaders.length;

  function addCol() {
    setUsageHeaders((h) => [...h, ""]);
    setBeans((bs) => bs.map((b) => ({ ...b, prices: [...b.prices, ""] })));
  }
  function removeCol(i: number) {
    if (cols <= 1) return;
    setUsageHeaders((h) => h.filter((_, idx) => idx !== i));
    setBeans((bs) => bs.map((b) => ({ ...b, prices: b.prices.filter((_, idx) => idx !== i) })));
  }
  function setHeader(i: number, v: string) {
    setUsageHeaders((h) => h.map((x, idx) => (idx === i ? v : x)));
  }
  function addBean() {
    setBeans((bs) => [...bs, { name: "", prices: Array.from({ length: cols }, () => "") }]);
  }
  function removeBean(i: number) {
    setBeans((bs) => bs.filter((_, idx) => idx !== i));
  }
  function setBeanName(i: number, v: string) {
    setBeans((bs) => bs.map((b, idx) => (idx === i ? { ...b, name: v } : b)));
  }
  function setBeanPrice(bi: number, ci: number, v: string) {
    setBeans((bs) => bs.map((b, idx) => (idx === bi ? { ...b, prices: b.prices.map((p, pi) => (pi === ci ? v : p)) } : b)));
  }
  function toggleConsulting(item: string) {
    setConsulting((c) => (c.includes(item) ? c.filter((x) => x !== item) : [...c, item]));
  }

  function resetForm() {
    setEditingId(null); setCustomerName(""); setManagerName(""); setManagerPhone("");
    setIssueDate(todayStr()); setValidDays("30"); setUsageHeaders(["", "", ""]);
    setBeans(DEFAULT_BEANS.map((n) => ({ name: n, prices: ["", "", ""] })));
    setConsulting([]); setConsultingFee(""); setSaved(null);
  }

  function startEdit(q: QuoteView) {
    setEditingId(q.id); setCustomerName(q.customerName); setManagerName(q.managerName);
    setManagerPhone(q.managerPhone); setIssueDate(q.issueDate); setValidDays(String(q.validDays));
    setUsageHeaders(q.usageHeaders.length ? q.usageHeaders : ["", "", ""]);
    setBeans(q.beans.length ? q.beans : DEFAULT_BEANS.map((n) => ({ name: n, prices: q.usageHeaders.map(() => "") })));
    setConsulting(q.consulting); setConsultingFee(q.consultingFee); setSaved(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!customerName.trim()) { toast({ variant: "destructive", title: "예비 거래처명을 입력해 주세요." }); return; }
    const payload = {
      customerName: customerName.trim(), managerName: managerName.trim(), managerPhone: managerPhone.trim(),
      issueDate, validDays: Math.max(1, Number(validDays) || 30),
      usageHeaders, beans: beans.filter((b) => b.name.trim()), consulting, consultingFee: consultingFee.trim(),
    };
    setBusy(true);
    try {
      const res = editingId
        ? await apiRequest("PATCH", `/api/admin/quotes/${editingId}`, payload)
        : await apiRequest("POST", "/api/admin/quotes", payload);
      const q: QuoteView = await res.json();
      setSaved(q);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      toast({ title: editingId ? "견적서가 수정되었습니다." : "견적서가 저장되었습니다." });
      setEditingId(q.id);
    } catch (e: any) {
      toast({ variant: "destructive", title: "저장 실패", description: e?.message ?? "" });
    } finally { setBusy(false); }
  }

  async function remove(q: QuoteView) {
    if (!confirm(`견적서 '${q.quoteNo}'을(를) 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/quotes/${q.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quotes"] });
      if (editingId === q.id) resetForm();
      toast({ title: "삭제되었습니다." });
    } catch (e: any) { toast({ variant: "destructive", title: "삭제 실패", description: e?.message ?? "" }); }
  }

  function shareUrl(token: string) { return `${window.location.origin}/#/quote/${token}`; }
  function copyLink(token: string) {
    navigator.clipboard?.writeText(shareUrl(token));
    toast({ title: "공유 링크가 복사되었습니다." });
  }

  // 미리보기용 견적서 객체
  const preview: QuoteView = {
    id: 0, quoteNo: saved?.quoteNo ?? "미리보기", token: saved?.token ?? "",
    customerName, managerName, managerPhone, issueDate, validDays: Number(validDays) || 30,
    usageHeaders, beans: beans.filter((b) => b.name.trim()), consulting, consultingFee, createdAt: 0,
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Quotation</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">견적서</h1>
        <p className="mb-6 text-sm text-muted-foreground">예비 거래처에게 보낼 원두 도매 견적서를 만들고, PDF·공유 링크로 발송합니다.</p>

        {/* 폼 */}
        <Card className="mb-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "견적서 수정" : "새 견적서"}</h2>
            {editingId && <Button variant="ghost" size="sm" onClick={resetForm}>새로 만들기</Button>}
          </div>

          {/* 기본 정보 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">예비 거래처명 *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="○○ 카페" data-testid="input-quote-customer" /></div>
            <div className="space-y-1.5"><Label className="text-xs">발행일</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">담당자</Label>
              <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="담당자명" /></div>
            <div className="space-y-1.5"><Label className="text-xs">연락처</Label>
              <Input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="010-…" /></div>
            <div className="space-y-1.5"><Label className="text-xs">유효기간(일)</Label>
              <Input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} className="w-28" /></div>
          </div>

          {/* 원두 × 사용량 매트릭스 */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">원두 단가 · 월 사용량 기준</Label>
              <Button variant="outline" size="sm" onClick={addCol} data-testid="button-add-col"><Plus className="mr-1 h-3.5 w-3.5" />사용량 칸</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted/40 p-1 text-left text-xs font-medium">원두</th>
                    {usageHeaders.map((h, i) => (
                      <th key={i} className="border border-border bg-muted/40 p-1">
                        <div className="flex items-center gap-1">
                          <Input value={h} onChange={(e) => setHeader(i, e.target.value)} placeholder="월 5kg" className="h-8 min-w-[80px] text-xs" data-testid={`input-col-${i}`} />
                          <button onClick={() => removeCol(i)} className="text-muted-foreground hover:text-destructive" title="칸 삭제"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {beans.map((b, bi) => (
                    <tr key={bi}>
                      <td className="border border-border p-1">
                        <div className="flex items-center gap-1">
                          <Input value={b.name} onChange={(e) => setBeanName(bi, e.target.value)} placeholder="원두명" className="h-8 min-w-[110px] text-xs" />
                          <button onClick={() => removeBean(bi)} className="text-muted-foreground hover:text-destructive" title="원두 삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                      {Array.from({ length: cols }).map((_, ci) => (
                        <td key={ci} className="border border-border p-1">
                          <Input value={b.prices[ci] ?? ""} onChange={(e) => setBeanPrice(bi, ci, e.target.value)} placeholder="₩" className="h-8 min-w-[76px] text-right text-xs" data-testid={`input-price-${bi}-${ci}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" size="sm" onClick={addBean} className="mt-2"><Plus className="mr-1 h-3.5 w-3.5" />원두 추가</Button>
            <p className="mt-1 text-[11px] text-muted-foreground">싱글 오리진은 문서에 "생두 시세에 따라 변동" 안내로 자동 표기됩니다.</p>
          </div>

          {/* 컨설팅 */}
          <div className="mt-6">
            <Label className="text-xs">메뉴 컨설팅 (체크한 항목만 견적서에 노출)</Label>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {CONSULTING_OPTIONS.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={consulting.includes(opt)} onChange={() => toggleConsulting(opt)} className="h-4 w-4 accent-[#6b6a45]" />
                  <span className={consulting.includes(opt) ? "text-foreground" : "text-muted-foreground"}>{opt}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">컨설팅 비용</Label>
              <Input value={consultingFee} onChange={(e) => setConsultingFee(e.target.value)} placeholder="예: ₩300,000 / 회 · 협의" className="max-w-xs" data-testid="input-consulting-fee" />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button onClick={save} disabled={busy} data-testid="button-save-quote">{editingId ? "수정 저장" : "견적서 저장"}</Button>
            {saved && (
              <>
                <Button variant="outline" onClick={() => window.open(shareUrl(saved.token), "_blank")}><ExternalLink className="mr-1 h-4 w-4" />열기 · 인쇄</Button>
                <Button variant="ghost" onClick={() => copyLink(saved.token)}><Copy className="mr-1 h-4 w-4" />링크 복사</Button>
              </>
            )}
          </div>
          {saved && (
            <div className="mt-2 truncate rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              공유 링크: <span className="text-foreground">{shareUrl(saved.token)}</span>
            </div>
          )}
        </Card>

        {/* 미리보기 */}
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium text-muted-foreground">미리보기</div>
          <QuoteDocument quote={preview} />
        </div>

        {/* 저장된 견적서 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-4"><h2 className="text-sm font-semibold text-foreground">저장된 견적서</h2></div>
          {!quotes || quotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">아직 저장된 견적서가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {quotes.map((q) => (
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid={`row-quote-${q.id}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xs font-semibold tabular text-foreground">{q.quoteNo}</span>
                      <span className="truncate text-sm text-foreground">{q.customerName || "—"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{q.issueDate} · 유효 {q.validDays}일</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => window.open(shareUrl(q.token), "_blank")}><ExternalLink className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => copyLink(q.token)}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(q)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(q)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
