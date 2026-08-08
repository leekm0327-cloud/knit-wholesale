import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { won } from "@/lib/format";
import type { FinancialStatement, Sector } from "@shared/schema";
import { analyzeFinancials, type FsTone } from "@/lib/financialAnalysis";
import { FileSpreadsheet, Sparkles, CheckCircle2, AlertTriangle, XCircle, Info, Loader2, Bot, Printer } from "lucide-react";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 부문 → 업종 표시명 (매장=음식점업, 홀세일=원두도매업)
const BIZ_LABEL: Partial<Record<Sector, string>> = {
  store: "음식점업 (매장)",
  wholesale: "원두도매업 (도매)",
  online: "온라인",
  atelier: "아뜰리에",
  consulting: "컨설팅",
  common: "공통",
};
function bizLabel(sector: Sector, fallback: string): string {
  return BIZ_LABEL[sector] ?? fallback;
}

// 분석 톤별 색상·아이콘
const TONE: Record<FsTone, { icon: typeof Info; cls: string; dot: string }> = {
  good: { icon: CheckCircle2, cls: "text-emerald-600", dot: "bg-emerald-500" },
  warn: { icon: AlertTriangle, cls: "text-amber-600", dot: "bg-amber-500" },
  bad: { icon: XCircle, cls: "text-destructive", dot: "bg-destructive" },
  info: { icon: Info, cls: "text-muted-foreground", dot: "bg-muted-foreground/60" },
};

// **굵게** 처리
function MdInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// AI가 반환한 마크다운(##, -, **)을 가볍게 렌더
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={key} className="my-1 list-disc space-y-1 pl-5">
          {bullets.map((b, i) => (
            <li key={i} className="text-sm leading-relaxed text-muted-foreground"><MdInline text={b} /></li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (/^#{1,3}\s+/.test(line)) {
      flush("ul" + idx);
      out.push(<h3 key={idx} className="mb-1 mt-3 text-sm font-semibold text-foreground first:mt-0">{line.replace(/^#{1,3}\s+/, "")}</h3>);
    } else if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
    } else if (line === "") {
      flush("ul" + idx);
    } else {
      flush("ul" + idx);
      out.push(<p key={idx} className="text-sm leading-relaxed text-foreground"><MdInline text={line} /></p>);
    }
  });
  flush("ul-final");
  return <div className="space-y-1">{out}</div>;
}

export default function AdminFinancials() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";

  const init = useMemo(() => {
    const now = new Date();
    return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
  }, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiTruncated, setAiTruncated] = useState(false);
  const [allocate, setAllocate] = useState(true);
  const aiPrintRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<FinancialStatement>({
    queryKey: ["/api/admin/financial-statement", { from, to, allocate }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/financial-statement?from=${from}&to=${to}&allocate=${allocate ? 1 : 0}`);
      return res.json();
    },
    enabled: isOwner,
  });

  function thisYear() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-01-01`);
    setTo(ymd(now));
  }
  function thisMonth() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setTo(ymd(now));
  }
  function lastMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 지난달 1일
    const last = new Date(now.getFullYear(), now.getMonth(), 0);      // 지난달 말일
    setFrom(ymd(first));
    setTo(ymd(last));
  }

  // 기간이 바뀌면 이전 AI 분석 결과는 무효화
  useEffect(() => { setAiText(null); setAiErr(null); setAiTruncated(false); }, [from, to]);

  // AI 분석 결과만 인쇄 / PDF 저장 (전역 .print-area 규칙 사용)
  function printAi() {
    const el = aiPrintRef.current;
    if (!el) return;
    const prevTitle = document.title;
    document.title = `재무분석_${from}_${to}`;
    el.classList.add("print-area");
    const restore = () => {
      el.classList.remove("print-area");
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 3000);
    window.print();
  }

  // 분석 결과 (규칙 기반) — 모든 훅은 early return 이전에 호출되어야 함
  const analysis = useMemo(() => (data && data.totals ? analyzeFinancials(data) : null), [data]);

  async function runAiAnalysis() {
    setAiBusy(true);
    setAiErr(null);
    try {
      const res = await apiRequest("POST", "/api/admin/financial-statement/ai-analysis", { from, to });
      const json = await res.json();
      setAiText(json.analysis ?? "");
      setAiTruncated(!!json.truncated);
    } catch (e: any) {
      let msg = "AI 분석에 실패했습니다.";
      const raw = String(e?.message ?? "");
      const m = raw.match(/^\d+:\s*([\s\S]*)$/);
      if (m) { try { msg = JSON.parse(m[1])?.message ?? m[1]; } catch { msg = m[1]; } }
      else if (raw) msg = raw;
      setAiErr(msg);
    } finally {
      setAiBusy(false);
    }
  }
  function lastYear() {
    const y = new Date().getFullYear() - 1;
    setFrom(`${y}-01-01`);
    setTo(`${y}-12-31`);
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const lines = data?.lines ?? [];
  const t = data?.totals;
  const wc = data?.workingCapital;

  // 값 포맷: 금액(won) 또는 비율(%)
  const fmtVal = (v: number, fmt: "won" | "pct") => (fmt === "pct" ? `${v.toFixed(1)}%` : won(v));
  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

  // 손익계산서 행 정의 (항목명, 값 추출기, 포맷, 강조 여부)
  type FsRow = {
    key: string;
    label: string;
    get: (l: FinancialStatement["lines"][number]) => number;
    total: number;
    fmt: "won" | "pct";
    strong?: boolean;
    muted?: boolean;
  };
  const rows: FsRow[] = t
    ? [
        { key: "revenue", label: "매출액", get: (l) => l.revenue, total: t.revenue, fmt: "won" },
        { key: "cogs", label: "(−) 매출원가", get: (l) => l.cogs, total: t.cogs, fmt: "won" },
        { key: "cogsRate", label: "매출원가율", get: (l) => rate(l.cogs, l.revenue), total: rate(t.cogs, t.revenue), fmt: "pct", muted: true },
        { key: "gross", label: "매출총이익", get: (l) => l.grossProfit, total: t.grossProfit, fmt: "won", strong: true },
        { key: "sga", label: "(−) 판매관리비", get: (l) => l.sga, total: t.sga, fmt: "won" },
        { key: "op", label: "영업이익", get: (l) => l.operatingProfit, total: t.operatingProfit, fmt: "won", strong: true },
        { key: "opRate", label: "영업이익률", get: (l) => rate(l.operatingProfit, l.revenue), total: rate(t.operatingProfit, t.revenue), fmt: "pct", strong: true, muted: true },
        { key: "nonop", label: "(−) 영업외비용", get: (l) => l.nonOperating, total: t.nonOperating, fmt: "won" },
        { key: "net", label: "순이익", get: (l) => l.netProfit, total: t.netProfit, fmt: "won", strong: true },
      ]
    : [];

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Financial statements</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">재무제표</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          업종별(음식점업·원두도매업) 손익계산서와 채권·채무 현황입니다. 앱 데이터 기반의 내부 경영용 자료이며, 공식 세무신고용 재무제표가 아닙니다.
        </p>

        {/* 기간 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-fs-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-fs-to" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={thisMonth} data-testid="button-fs-month">이번 달</Button>
              <Button variant="outline" size="sm" onClick={lastMonth} data-testid="button-fs-lastmonth">지난달</Button>
              <Button variant="outline" size="sm" onClick={thisYear} data-testid="button-fs-year">올해</Button>
              <Button variant="outline" size="sm" onClick={lastYear} data-testid="button-fs-lastyear">작년</Button>
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={allocate} onChange={(e) => setAllocate(e.target.checked)} data-testid="check-allocate" />
              공통비를 매출 비율로 배분
            </label>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
          </div>
        ) : (
          <>
            {/* 손익계산서 */}
            <Card className="mb-6 overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">손익계산서 (업종별)</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{from} ~ {to}</p>
              </div>
              {lines.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">이 기간에 집계된 손익이 없습니다.</div>
              ) : (
                <div className="table-scroll">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="sticky-col px-4 py-2 text-left font-medium">항목</th>
                        {lines.map((l) => (
                          <th key={l.sector} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                            {bizLabel(l.sector, l.label)}
                          </th>
                        ))}
                        <th className="px-4 py-2 text-right font-semibold text-foreground">합계</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => (
                        <tr key={r.key} className={r.strong && !r.muted ? "bg-muted/20" : ""}>
                          <td className={`sticky-col px-4 py-3 whitespace-nowrap ${r.muted ? "text-xs text-muted-foreground" : r.strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {r.label}
                          </td>
                          {lines.map((l) => {
                            const v = r.get(l);
                            return (
                              <td
                                key={l.sector}
                                className={`px-4 py-3 text-right tabular ${
                                  r.muted
                                    ? "text-xs text-muted-foreground"
                                    : r.strong
                                    ? v < 0 ? "font-semibold text-destructive" : "font-semibold text-foreground"
                                    : "text-foreground"
                                }`}
                              >
                                {fmtVal(v, r.fmt)}
                              </td>
                            );
                          })}
                          <td
                            className={`px-4 py-3 text-right tabular ${
                              r.muted ? "text-xs font-medium text-muted-foreground" : "font-semibold"
                            } ${!r.muted && r.total < 0 ? "text-destructive" : r.muted ? "" : "text-foreground"}`}
                          >
                            {fmtVal(r.total, r.fmt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="border-t p-3 text-[11px] text-muted-foreground">
                매출원가·판매관리비·영업외비용은 <strong className="text-foreground">고정비 항목별 ‘비용 구분’</strong> 설정을 따릅니다. (고정비 항목 관리에서 변경)
                {data?.allocated && (data?.allocatedCommon ?? 0) > 0 && <> · 공통 비용 {won(data!.allocatedCommon)}을 부문별 매출 비율로 배분했습니다.</>}
                {(data?.excluded ?? 0) > 0 && <> · ‘비용 아님’(부가세 납부·자산 취득 등) {won(data!.excluded)}은 손익에서 제외했습니다.</>}
              </div>
            </Card>

            {/* 채권·채무 요약 */}
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">채권 · 채무 현황 (현재 시점)</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">거래처 미수금 (채권)</p>
                  <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-receivables">
                    {won(wc?.receivables ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">공장 미지급금 (채무)</p>
                  <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-payables">
                    {won(wc?.payables ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">순운전자본 (채권 − 채무)</p>
                  <p
                    className={`font-display mt-1 text-lg font-semibold tabular ${
                      (wc?.net ?? 0) < 0 ? "text-destructive" : "text-foreground"
                    }`}
                    data-testid="text-net-wc"
                  >
                    {won(wc?.net ?? 0)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                채권·채무는 기간과 무관하게 현재 미수·미지급 잔액 스냅샷입니다.
              </p>
            </Card>

            {/* 재무 분석 (규칙 기반 자동) */}
            {analysis && (
              <Card className="mt-6 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-5">
                  <Sparkles className="h-4 w-4 text-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">재무 분석</h2>
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">자동 진단</span>
                  <Button
                    variant="default"
                    size="sm"
                    className="ml-auto"
                    onClick={runAiAnalysis}
                    disabled={aiBusy}
                    data-testid="button-ai-analysis"
                  >
                    {aiBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1.5 h-3.5 w-3.5" />}
                    {aiBusy ? "분석 중…" : aiText ? "AI 다시 분석" : "AI 심층 분석"}
                  </Button>
                </div>

                <div className="p-5">
                  {/* 종합 진단 */}
                  {(() => {
                    const T = TONE[analysis.headline.tone];
                    const Icon = T.icon;
                    return (
                      <div className="mb-5 flex items-start gap-2.5 rounded-md border bg-card p-4">
                        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${T.cls}`} />
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">종합 진단</p>
                          <p className="mt-0.5 text-sm font-medium text-foreground">{analysis.headline.text}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 핵심 지표 */}
                  <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {analysis.metrics.map((m) => (
                      <div key={m.label} className="rounded-md border p-3">
                        <p className="text-[11px] text-muted-foreground">{m.label}</p>
                        <p className={`font-display mt-1 text-sm font-semibold tabular ${m.tone ? TONE[m.tone].cls : "text-foreground"}`}>
                          {m.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 관찰·경고 */}
                  {analysis.insights.length > 0 && (
                    <div className="mb-5">
                      <p className="mb-2 text-xs font-semibold text-foreground">주요 관찰</p>
                      <ul className="space-y-2">
                        {analysis.insights.map((ins, i) => {
                          const T = TONE[ins.tone];
                          const Icon = T.icon;
                          return (
                            <li key={i} className="flex items-start gap-2">
                              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${T.cls}`} />
                              <p className="text-sm leading-relaxed text-foreground">
                                <span className="mr-1.5 text-xs font-medium text-muted-foreground">[{ins.label}]</span>
                                {ins.text}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* 개선 제안 */}
                  {analysis.suggestions.length > 0 && (
                    <div className="rounded-md border border-dashed p-4">
                      <p className="mb-2 text-xs font-semibold text-foreground">개선 제안</p>
                      <ul className="space-y-1.5">
                        {analysis.suggestions.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                            <span className="leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* AI 심층 분석 결과 */}
                  {(aiBusy || aiErr || aiText) && (
                    <div ref={aiPrintRef} className="ai-report mt-5 rounded-md border bg-muted/20 p-4">
                      {/* 인쇄 시 글자가 흐려지지 않도록 보정 */}
                      <style>{`@media print{
                        .ai-report, .ai-report *{color:#111 !important;background:transparent !important;border-color:#ddd !important}
                        .ai-report{font-size:10.5pt;line-height:1.65}
                        .ai-report h3{margin-top:14px}
                      }`}</style>
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <Bot className="h-4 w-4 text-foreground" />
                        <p className="text-xs font-semibold text-foreground">AI 심층 분석</p>
                        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground no-print">Claude</span>
                        {aiText && !aiBusy && (
                          <Button variant="outline" size="sm" className="ml-auto no-print" onClick={printAi} data-testid="button-print-ai">
                            <Printer className="mr-1.5 h-3.5 w-3.5" /> 인쇄 / PDF 저장
                          </Button>
                        )}
                      </div>

                      {/* 인쇄 시에만 보이는 문서 머리말 */}
                      {aiText && (
                        <div className="hidden print:block mb-4 border-b pb-3">
                          <p className="text-base font-semibold text-foreground">니트커피 재무 분석 리포트</p>
                          <p className="mt-1 text-xs text-muted-foreground">분석 기간 {from} ~ {to}</p>
                        </div>
                      )}

                      {aiBusy ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> AI가 재무 데이터를 분석하고 있습니다…
                        </div>
                      ) : aiErr ? (
                        <p className="text-sm text-destructive">{aiErr}</p>
                      ) : aiText ? (
                        <>
                          <MarkdownLite text={aiText} />
                          {aiTruncated && (
                            <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                              분석 내용이 매우 길어 일부가 생략되었을 수 있습니다. 기간을 좁혀서 다시 분석하면 더 상세히 볼 수 있습니다.
                            </p>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="border-t p-3 text-[11px] text-muted-foreground">
                  앱에 입력된 매출·지출·발주 데이터를 규칙 기반으로 자동 진단한 내부 참고 자료입니다. 공인회계사·세무사의 전문 자문이나 공식 세무신고를 대체하지 않습니다.
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
