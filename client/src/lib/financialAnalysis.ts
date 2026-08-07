import { won } from "@/lib/format";
import type { FinancialStatement, FinancialStatementLine } from "@shared/schema";

// 재무제표 자동 분석 (규칙 기반) — 수입·지출·손익 데이터를 회계 관점으로 진단.
// 외부 AI 호출 없이 앱 데이터만으로 계산합니다.

export type FsTone = "good" | "warn" | "bad" | "info";

export type FsInsight = { tone: FsTone; label: string; text: string };
export type FsMetric = { label: string; value: string; tone?: FsTone };

export type FsAnalysis = {
  headline: { tone: FsTone; text: string };
  metrics: FsMetric[];
  insights: FsInsight[];
  suggestions: string[];
};

const pct = (num: number, den: number): number => (den > 0 ? (num / den) * 100 : 0);
const p1 = (n: number): string => `${n.toFixed(1)}%`;

function bizName(l: FinancialStatementLine): string {
  const map: Record<string, string> = {
    store: "음식점업(매장)",
    wholesale: "원두도매업(도매)",
    online: "온라인",
    atelier: "아뜰리에",
    common: "공통",
  };
  return map[l.sector] ?? l.label;
}

export function analyzeFinancials(data: FinancialStatement): FsAnalysis {
  const t = data.totals;
  const wc = data.workingCapital;
  const rev = t.revenue, cogs = t.cogs, gross = t.grossProfit, sga = t.sga, op = t.operatingProfit;
  const opRate = pct(op, rev), grossRate = pct(gross, rev), cogsRate = pct(cogs, rev), sgaRate = pct(sga, rev);

  const insights: FsInsight[] = [];
  const suggestions: string[] = [];

  // ── 종합 진단 (headline) ──
  let headline: FsAnalysis["headline"];
  if (rev <= 0 && op === 0) {
    headline = { tone: "info", text: "이 기간에 집계된 매출이 없어 분석할 손익이 없습니다. 기간을 바꿔 조회해 보세요." };
  } else if (op > 0) {
    if (opRate >= 15) headline = { tone: "good", text: `영업이익 ${won(op)} · 영업이익률 ${p1(opRate)}로 우수한 흑자 구조입니다.` };
    else if (opRate >= 5) headline = { tone: "good", text: `영업이익 ${won(op)} · 영업이익률 ${p1(opRate)}로 안정적인 흑자입니다.` };
    else headline = { tone: "warn", text: `영업이익 ${won(op)} · 영업이익률 ${p1(opRate)}로 소폭 흑자입니다. 이익 여력이 크지 않습니다.` };
  } else if (op === 0) {
    headline = { tone: "warn", text: "영업이익이 0으로 손익분기 수준입니다." };
  } else {
    headline = { tone: "bad", text: `영업손실 ${won(op)} · 영업이익률 ${p1(opRate)}로 적자 상태입니다.` };
  }

  // ── 핵심 지표 ──
  const metrics: FsMetric[] = [
    { label: "매출액", value: won(rev) },
    { label: "매출총이익률", value: p1(grossRate), tone: grossRate >= 30 ? "good" : grossRate >= 15 ? "warn" : "bad" },
    { label: "영업이익", value: won(op), tone: op > 0 ? "good" : op < 0 ? "bad" : "warn" },
    { label: "영업이익률", value: p1(opRate), tone: opRate >= 10 ? "good" : opRate >= 0 ? "warn" : "bad" },
    { label: "매출원가율", value: p1(cogsRate) },
    { label: "판관비율", value: p1(sgaRate) },
  ];

  if (rev > 0) {
    // ── 매출원가율 ──
    if (cogs > 0) {
      if (cogsRate >= 75) {
        insights.push({ tone: "warn", label: "매출원가", text: `매출원가율이 ${p1(cogsRate)}로 높습니다. 발주 단가나 판매 단가를 점검해 마진을 확보할 여지가 있습니다.` });
        suggestions.push("원가율이 높으니 공장 발주 단가 협상 또는 판매 단가 조정을 검토하세요.");
      } else if (cogsRate >= 60) {
        insights.push({ tone: "info", label: "매출원가", text: `매출원가율은 ${p1(cogsRate)}입니다. 원두 도매 특성상 원가 비중이 큰 편이니 추이를 지켜보세요.` });
      } else {
        insights.push({ tone: "good", label: "매출원가", text: `매출원가율 ${p1(cogsRate)}로 원가 관리가 양호합니다.` });
      }
    }

    // ── 판매관리비 ──
    if (sga > gross) {
      insights.push({ tone: "bad", label: "판관비", text: `판매관리비(${won(sga)})가 매출총이익(${won(gross)})을 초과해 영업적자의 주요 원인입니다.` });
      suggestions.push("판매관리비가 매출총이익을 넘습니다. 고정비(임대료·인건비 등) 절감이 시급합니다.");
    } else if (sgaRate >= 30) {
      insights.push({ tone: "warn", label: "판관비", text: `판관비율이 ${p1(sgaRate)}로 높은 편입니다. 고정비 비중을 점검해 보세요.` });
      suggestions.push("판매관리비 비중이 크니 고정비 절감 여지를 살펴보세요.");
    } else if (sga > 0) {
      insights.push({ tone: "info", label: "판관비", text: `판관비율은 ${p1(sgaRate)}로, 매출총이익 대비 관리 가능한 수준입니다.` });
    }
  }

  // ── 부문별 손익 ──
  const active = data.lines.filter((l) => l.revenue !== 0 || l.cogs !== 0 || l.sga !== 0 || l.operatingProfit !== 0);
  const lossSectors = active.filter((l) => l.operatingProfit < 0);
  for (const l of lossSectors) {
    insights.push({ tone: "bad", label: bizName(l), text: `${bizName(l)} 부문이 영업손실 ${won(l.operatingProfit)}입니다. 부문 단위로 원인을 살펴볼 필요가 있습니다.` });
  }
  if (lossSectors.length > 0) {
    suggestions.push(`${lossSectors.map(bizName).join("·")} 부문의 적자 원인을 개별적으로 분석해 보세요.`);
  }
  const profitSectors = active.filter((l) => l.operatingProfit > 0).sort((a, b) => b.operatingProfit - a.operatingProfit);
  if (profitSectors.length > 0) {
    const top = profitSectors[0];
    insights.push({ tone: "good", label: bizName(top), text: `${bizName(top)} 부문이 영업이익 ${won(top.operatingProfit)}(이익률 ${p1(pct(top.operatingProfit, top.revenue))})로 실적을 견인합니다.` });
  }

  // ── 영업외비용 (이자 등) ──
  const nonop = (t as any).nonOperating ?? 0;
  const net = (t as any).netProfit ?? op;
  if (nonop > 0) {
    insights.push({ tone: op > 0 && net <= 0 ? "bad" : "info", label: "영업외비용",
      text: `이자 등 영업외비용이 ${won(nonop)}입니다. 영업이익 ${won(op)}에서 차감하면 순이익은 ${won(net)}입니다.` });
    if (op > 0 && net <= 0) suggestions.push("영업은 흑자지만 이자비용 때문에 순이익이 적자입니다. 대출 구조 조정을 검토해 보세요.");
  }

  // ── 채권·채무 ──
  if (wc.receivables > 0) {
    if (rev > 0 && wc.receivables > rev) {
      insights.push({ tone: "warn", label: "채권", text: `거래처 미수금(${won(wc.receivables)})이 이 기간 매출을 웃돕니다. 회수가 지연되면 자금 흐름에 부담이 될 수 있습니다.` });
      suggestions.push("미수금 회수 주기를 단축하면 현금 흐름이 개선됩니다.");
    } else {
      insights.push({ tone: "info", label: "채권", text: `거래처 미수금은 ${won(wc.receivables)}입니다. 정기적으로 회수 상태를 확인하세요.` });
    }
  }
  if (wc.payables > 0) {
    insights.push({ tone: "info", label: "채무", text: `공장 미지급금은 ${won(wc.payables)}입니다.` });
  }
  if (wc.net < 0) {
    insights.push({ tone: "warn", label: "순운전자본", text: `순운전자본이 마이너스(${won(wc.net)})입니다. 단기적으로 지급 부담(채무)이 회수 예정(채권)보다 큽니다.` });
    suggestions.push("채무가 채권보다 큽니다. 지급 일정을 관리해 단기 유동성을 확보하세요.");
  } else if (wc.receivables > 0 || wc.payables > 0) {
    insights.push({ tone: "good", label: "순운전자본", text: `순운전자본은 ${won(wc.net)}로 단기 지급 여력이 있습니다.` });
  }

  // ── 개선 제안 (기본값) ──
  if (op < 0 && !suggestions.some((s) => s.includes("영업"))) {
    suggestions.unshift("지출 구조를 점검해 영업이익을 흑자로 전환하는 것이 최우선입니다.");
  }
  if (suggestions.length === 0 && rev > 0) {
    suggestions.push("현재 수익 구조는 양호합니다. 부문별 매출 성장에 집중해 보세요.");
  }

  return { headline, metrics, insights, suggestions };
}
