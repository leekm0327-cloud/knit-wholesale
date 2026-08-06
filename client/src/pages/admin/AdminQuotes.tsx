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
import type { QuoteView, QuoteBean, QuoteAppendix, QuoteConsulting, Product } from "@shared/schema";
import { productToAppendix, stripWeight, beanRank } from "@/lib/quoteAppendix";
import { Plus, Trash2, X, ExternalLink, Copy, Pencil, FileText } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 기본 원두 + 현재 정가(직접 수정 가능) — 표기 순서: 코튼 > 울 > 실크 > 디카페인
const DEFAULT_BEANS: { name: string; listPrice: string }[] = [
  { name: "코튼 블렌드", listPrice: "32,000" },
  { name: "울 블렌드", listPrice: "30,000" },
  { name: "실크 블렌드", listPrice: "37,000" },
  { name: "디카페인", listPrice: "34,000" },
];
function defaultBeans(): QuoteBean[] {
  return DEFAULT_BEANS.map((b) => ({ name: b.name, listPrice: b.listPrice, prices: ["", "", ""] }));
}
// 메뉴 컨설팅 항목 (계약서 3조 기준) — 항목별 금액 입력, 체크 시 합산
const CONSULTING_TEMPLATE: { label: string; desc: string }[] = [
  { label: "음료 메뉴 구성 및 개발", desc: "매장 맞춤 메뉴 구성·레시피(원가율 포함), 기본 20종 내 + 시그니처 2종, 시음 2회" },
  { label: "커피 및 음료 교육", desc: "추출·품질·장비·제조·동선·발주 교육 (영업 전 3일)" },
  { label: "커피 바 장비 제안", desc: "커피 바 장비 선정·배치 제안·납품, 초도 물량 제안 (장비 구매 비용 별도)" },
  { label: "현장 관리 감독", desc: "영업 시작 당일 현장 관리 감독 (1일)" },
];
function defaultConsulting(): QuoteConsulting[] {
  return CONSULTING_TEMPLATE.map((t) => ({ label: t.label, desc: t.desc, price: 0, checked: false }));
}
function parseWon(v: string): number {
  return Number((v || "").replace(/[^0-9]/g, "")) || 0;
}

export default function AdminQuotes() {
  const { toast } = useToast();
  const { data: quotes } = useQuery<QuoteView[]>({ queryKey: ["/api/admin/quotes"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const beanProducts = (products ?? [])
    .filter((p) => ["blend", "decaf", "single", "single_espresso", "single_filter"].includes(p.category) && p.available === 1)
    .slice()
    .sort((a, b) => beanRank(stripWeight(a.name)) - beanRank(stripWeight(b.name)));

  const [editingId, setEditingId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [validDays, setValidDays] = useState("30");
  const [usageHeaders, setUsageHeaders] = useState<string[]>(["", "", ""]);
  const [beans, setBeans] = useState<QuoteBean[]>(defaultBeans());
  const [consulting, setConsulting] = useState<QuoteConsulting[]>(defaultConsulting());
  const [appendix, setAppendix] = useState<QuoteAppendix[]>([]);
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
    setBeans((bs) => [...bs, { name: "", listPrice: "", prices: Array.from({ length: cols }, () => "") }]);
  }
  function removeBean(i: number) {
    setBeans((bs) => bs.filter((_, idx) => idx !== i));
  }
  function setBeanName(i: number, v: string) {
    setBeans((bs) => bs.map((b, idx) => (idx === i ? { ...b, name: v } : b)));
  }
  function setBeanList(i: number, v: string) {
    setBeans((bs) => bs.map((b, idx) => (idx === i ? { ...b, listPrice: v } : b)));
  }
  function setBeanPrice(bi: number, ci: number, v: string) {
    setBeans((bs) => bs.map((b, idx) => (idx === bi ? { ...b, prices: b.prices.map((p, pi) => (pi === ci ? v : p)) } : b)));
  }
  function toggleConsulting(i: number) {
    setConsulting((c) => c.map((x, idx) => (idx === i ? { ...x, checked: !x.checked } : x)));
  }
  function setConsultingLabel(i: number, v: string) {
    setConsulting((c) => c.map((x, idx) => (idx === i ? { ...x, label: v } : x)));
  }
  function setConsultingPrice(i: number, v: string) {
    setConsulting((c) => c.map((x, idx) => (idx === i ? { ...x, price: parseWon(v) } : x)));
  }
  function addConsulting() {
    setConsulting((c) => [...c, { label: "", desc: "", price: 0, checked: true }]);
  }
  function removeConsulting(i: number) {
    setConsulting((c) => c.filter((_, idx) => idx !== i));
  }
  const consultingTotal = consulting.filter((c) => c.checked).reduce((s, c) => s + (Number(c.price) || 0), 0);
  // 별첨(원두 정보) — 상품 상세페이지에서 가져옴. 상품 선택 시 스냅샷 추가/제거.
  function toggleAppendixProduct(p: Product) {
    const name = stripWeight(p.name);
    setAppendix((a) => (a.some((x) => x.name === name) ? a.filter((x) => x.name !== name) : [...a, productToAppendix(p)]));
  }
  function removeAppendix(i: number) {
    setAppendix((a) => a.filter((_, idx) => idx !== i));
  }

  function resetForm() {
    setEditingId(null); setCustomerName(""); setManagerName(""); setManagerPhone("");
    setIssueDate(todayStr()); setValidDays("30"); setUsageHeaders(["", "", ""]);
    setBeans(defaultBeans());
    setConsulting(defaultConsulting()); setAppendix([]); setSaved(null);
  }

  function startEdit(q: QuoteView) {
    setEditingId(q.id); setCustomerName(q.customerName); setManagerName(q.managerName);
    setManagerPhone(q.managerPhone); setIssueDate(q.issueDate); setValidDays(String(q.validDays));
    setUsageHeaders(q.usageHeaders.length ? q.usageHeaders : ["", "", ""]);
    setBeans(q.beans.length ? q.beans.map((b) => ({ name: b.name, listPrice: (b as any).listPrice ?? "", prices: b.prices })) : defaultBeans());
    setConsulting(q.consulting?.length ? q.consulting : defaultConsulting()); setAppendix(q.appendix ?? []); setSaved(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!customerName.trim()) { toast({ variant: "destructive", title: "예비 거래처명을 입력해 주세요." }); return; }
    const payload = {
      customerName: customerName.trim(), managerName: managerName.trim(), managerPhone: managerPhone.trim(),
      issueDate, validDays: Math.max(1, Number(validDays) || 30),
      usageHeaders, beans: beans.filter((b) => b.name.trim()),
      consulting: consulting.filter((c) => c.label.trim()),
      appendix: appendix.filter((a) => a.name.trim()),
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
    usageHeaders, beans: beans.filter((b) => b.name.trim()),
    consulting: consulting.filter((c) => c.label.trim()), consultingFee: "",
    appendix: appendix.filter((a) => a.name.trim()), createdAt: 0,
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
                    <th className="border border-border bg-muted/40 p-1 text-xs font-medium">정가</th>
                    {usageHeaders.map((h, i) => (
                      <th key={i} className="border border-border bg-muted/40 p-1">
                        <div className="flex items-center gap-1">
                          <Input value={h} onChange={(e) => setHeader(i, e.target.value)} placeholder="월 5kg" className="h-8 min-w-[80px] text-xs" data-testid={`input-col-${i}`} />
                          <button onClick={() => removeCol(i)} className="text-muted-foreground hover:text-destructive" title="칸 삭제"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border border-border p-0" />
                    <th className="border border-border bg-muted/20 p-1 text-center text-[10px] font-normal text-muted-foreground">기준가</th>
                    {usageHeaders.map((_, i) => (
                      <th key={i} className="border border-border bg-muted/20 p-1 text-center text-[10px] font-normal text-muted-foreground">제안가</th>
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
                      <td className="border border-border p-1">
                        <Input value={b.listPrice ?? ""} onChange={(e) => setBeanList(bi, e.target.value)} placeholder="정가" className="h-8 min-w-[76px] text-right text-xs" data-testid={`input-list-${bi}`} />
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

          {/* 메뉴 컨설팅 — 항목별 금액, 체크 시 합산 */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">메뉴 컨설팅 (체크한 항목만 노출 · 금액 합산)</Label>
              <Button variant="outline" size="sm" onClick={addConsulting}><Plus className="mr-1 h-3.5 w-3.5" />항목</Button>
            </div>
            <div className="space-y-1.5">
              {consulting.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2" data-testid={`consulting-${i}`}>
                  <input type="checkbox" checked={c.checked} onChange={() => toggleConsulting(i)} className="mt-1 h-4 w-4 accent-[#6b6a45]" />
                  <div className="min-w-0 flex-1">
                    <Input value={c.label} onChange={(e) => setConsultingLabel(i, e.target.value)} placeholder="항목명" className="h-8 text-xs font-medium" />
                    {c.desc ? <p className="mt-0.5 text-[11px] text-muted-foreground">{c.desc}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₩</span>
                    <Input value={c.price ? c.price.toLocaleString() : ""} onChange={(e) => setConsultingPrice(i, e.target.value)} placeholder="0" className="h-8 w-28 text-right text-xs" data-testid={`consulting-price-${i}`} />
                    <button onClick={() => removeConsulting(i)} className="text-muted-foreground hover:text-destructive" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-xs text-muted-foreground">
              선택 합계 <span className="font-semibold text-foreground">₩{consultingTotal.toLocaleString()}</span> <span className="text-[11px]">(VAT 별도)</span>
            </div>
          </div>

          {/* 별첨 · 원두 정보 — 상품 상세페이지에서 자동 */}
          <div className="mt-6">
            <Label className="text-xs">별첨 · 원두 정보 (상품을 선택하면 상세페이지 정보를 가져옵니다)</Label>
            <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">블렌드 구성 · 향미 노트 · 로스팅 레벨 · 권장 레시피를 상품 관리의 상세페이지에서 그대로 불러옵니다. 내용을 바꾸려면 상품 관리에서 수정하세요.</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {beanProducts.map((p) => {
                const name = stripWeight(p.name);
                const checked = appendix.some((a) => a.name === name);
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm" data-testid={`appendix-prod-${p.id}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAppendixProduct(p)} className="h-4 w-4 accent-[#6b6a45]" />
                    <span className={checked ? "text-foreground" : "text-muted-foreground"}>{name}</span>
                  </label>
                );
              })}
            </div>
            {appendix.length > 0 && (
              <div className="mt-3 space-y-2">
                {appendix.map((a, i) => (
                  <div key={i} className="rounded-md border border-border p-3 text-xs" data-testid={`appendix-${i}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium text-foreground">{a.name}</span>
                      <button onClick={() => removeAppendix(i)} className="ml-auto text-muted-foreground hover:text-destructive" title="제외"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="space-y-0.5 text-muted-foreground">
                      {a.composition && <div><span className="text-foreground">블렌드 구성</span> · {a.composition}</div>}
                      {a.flavor && <div><span className="text-foreground">향미 노트</span> · {a.flavor}</div>}
                      {a.roast && <div><span className="text-foreground">로스팅 레벨</span> · {a.roast}</div>}
                      {a.recipe && <div><span className="text-foreground">권장 레시피</span> · {a.recipe}</div>}
                      {!a.composition && !a.flavor && !a.roast && !a.recipe && <div className="italic">상세페이지 정보가 없습니다. 상품 관리에서 입력하세요.</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
