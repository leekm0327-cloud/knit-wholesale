// 데일리 에스프레소 추출 로그 — 게시된 구글시트(CSV)를 불러와 집계.
// 공개 데이터이므로 개인정보(담당자·코멘트)는 집계에서 제외하고 수치만 사용한다.
import type { EspressoStats } from "@shared/schema";

// 구글시트 "웹에 게시" CSV 주소
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOzlZaaBn2KW8ACr1ay9szUwuUYAHGbKs7DMkfb-E5OlumlGjettN2XQ4oKFeNGsb8-0zTZ40mu_DO/pub?output=csv";

const RATING_ORDER = ["매우 긍정", "긍정", "보통", "부정", "매우 부정"];
// 평균 레시피는 '긍정'/'매우 긍정' 평가 기록만으로 계산 (좋았던 세팅의 레시피)
const POSITIVE_RATINGS = ["긍정", "매우 긍정"];
const TTL_MS = 10 * 60 * 1000; // 10분 캐시

let cache: EspressoStats | null = null;
let cacheAt = 0;

// 따옴표/줄바꿈을 처리하는 최소 CSV 파서
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normDate(s: string): string {
  const m = (s || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function num(s: string): number {
  const v = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

function aggregate(csv: string): EspressoStats {
  const rows = parseCsv(csv);
  const empty: EspressoStats = { totalLogs: 0, from: "", to: "", byRating: [], byDate: [], byBeanRecipe: [] };
  if (rows.length < 2) return empty;
  const header = rows[0].map((h) => h.trim());
  const col = (kw: string) => header.findIndex((h) => h.includes(kw));
  const cDate = col("날짜");
  const cBean = col("원두");
  const cDose = col("도징");
  const cYield = col("추출량");
  const cTime = col("추출 시간") >= 0 ? col("추출 시간") : col("추출시간");
  const cRating = col("종합 평가") >= 0 ? col("종합 평가") : col("평가");

  const ratingMap = new Map<string, number>();
  const dateMap = new Map<string, number>();
  const beanMap = new Map<string, { count: number; dose: number; yield: number; time: number; doseN: number; yieldN: number; timeN: number }>();
  let total = 0;
  const dates: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => !String(v).trim())) continue; // 빈 행 스킵
    // 타임스탬프/날짜가 전혀 없으면 유효 로그 아님
    const dISO = cDate >= 0 ? normDate(r[cDate]) : "";
    const bean = cBean >= 0 ? String(r[cBean] ?? "").trim() : "";
    const rating = cRating >= 0 ? String(r[cRating] ?? "").trim() : "";
    if (!dISO && !bean && !rating) continue;
    total++;

    if (rating) ratingMap.set(rating, (ratingMap.get(rating) ?? 0) + 1);
    if (dISO) { dateMap.set(dISO, (dateMap.get(dISO) ?? 0) + 1); dates.push(dISO); }

    // 평균 레시피: 긍정/매우 긍정 평가 기록만 반영
    if (bean && POSITIVE_RATINGS.includes(rating)) {
      const b = beanMap.get(bean) ?? { count: 0, dose: 0, yield: 0, time: 0, doseN: 0, yieldN: 0, timeN: 0 };
      b.count++;
      const d = cDose >= 0 ? num(r[cDose]) : NaN;
      const y = cYield >= 0 ? num(r[cYield]) : NaN;
      const t = cTime >= 0 ? num(r[cTime]) : NaN;
      if (Number.isFinite(d)) { b.dose += d; b.doseN++; }
      if (Number.isFinite(y)) { b.yield += y; b.yieldN++; }
      if (Number.isFinite(t)) { b.time += t; b.timeN++; }
      beanMap.set(bean, b);
    }
  }

  const byRating = Array.from(ratingMap.entries())
    .map(([rating, count]) => ({ rating, count }))
    .sort((a, b) => {
      const ia = RATING_ORDER.indexOf(a.rating);
      const ib = RATING_ORDER.indexOf(b.rating);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  const byDate = Array.from(dateMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const byBeanRecipe = Array.from(beanMap.entries())
    .map(([bean, b]) => {
      const avgDose = b.doseN ? b.dose / b.doseN : 0;
      const avgYield = b.yieldN ? b.yield / b.yieldN : 0;
      const avgTime = b.timeN ? b.time / b.timeN : 0;
      return {
        bean,
        count: b.count,
        avgDose: r1(avgDose),
        avgYield: r1(avgYield),
        avgTime: r1(avgTime),
        ratio: avgDose > 0 ? r1(avgYield / avgDose) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const sortedDates = dates.slice().sort();
  return {
    totalLogs: total,
    from: sortedDates[0] ?? "",
    to: sortedDates[sortedDates.length - 1] ?? "",
    byRating,
    byDate,
    byBeanRecipe,
  };
}

export async function fetchEspressoStats(): Promise<EspressoStats> {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const res = await fetch(CSV_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`시트 응답 오류 (HTTP ${res.status})`);
    const text = await res.text();
    const stats = aggregate(text);
    cache = stats;
    cacheAt = Date.now();
    return stats;
  } catch (e: any) {
    // 실패 시 이전 캐시라도 반환, 없으면 에러 표시
    if (cache) return cache;
    return { totalLogs: 0, from: "", to: "", byRating: [], byDate: [], byBeanRecipe: [], error: e?.message ?? String(e) };
  }
}
