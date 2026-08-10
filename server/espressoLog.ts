// 데일리 에스프레소 추출 로그 — 직원 앱에 쌓인 추출 기록(espresso_logs)을 집계.
// 예전에는 구글시트(CSV)를 읽었지만, 2026-08 부터 직원 앱 기록으로 일원화했다.
// 공개 데이터이므로 담당자 이름은 코멘트에서 지우고 수치만 사용한다.
import type { EspressoStats } from "@shared/schema";


const RATING_ORDER = ["매우 긍정", "긍정", "보통", "부정", "매우 부정"];
// 평균 레시피는 '긍정'/'매우 긍정' 평가 기록만으로 계산 (좋았던 세팅의 레시피)
const POSITIVE_RATINGS = ["긍정", "매우 긍정"];

// 맛 코멘트에서 뽑아낼 '긍정 맛 표현' 사전 (부정·중립 표현은 넣지 않는다)
const FLAVOR_TAGS: { label: string; patterns: string[] }[] = [
  { label: "단맛", patterns: ["단맛", "달달", "단 맛", "단맛좋"] },
  { label: "산미", patterns: ["산미", "신맛", "새콤", "시트러스", "상큼"] },
  { label: "견과", patterns: ["견과", "너티", "너트", "아몬드", "호두", "땅콩"] },
  { label: "고소함", patterns: ["고소"] },
  { label: "밸런스", patterns: ["밸런스", "밸런", "균형", "조화"] },
  { label: "바디감", patterns: ["바디", "무게감", "질감", "묵직", "라운드"] },
  { label: "클린컵", patterns: ["클린", "깔끔", "깨끗", "클리어"] },
  { label: "초콜릿", patterns: ["초콜릿", "초코", "카카오"] },
  { label: "감칠맛", patterns: ["감칠"] },
  { label: "긴 여운", patterns: ["여운", "후미", "애프터", "피니시"] },
  { label: "과일 향", patterns: ["복숭아", "망고", "자두", "베리", "자몽", "오렌지", "딸기", "과일", "플로럴", "꽃", "플레이버"] },
];

// 세팅 메모(내부 작업 노트) 신호 — 이런 표현이 들어간 코멘트는 대표 코멘트에서 제외
const MEMO_RE = /\d\s*도|낮춤|낮춰|낮췄|높였|높임|올림|조정|세팅|추출\s*온도|그라인더|디개싱|디게싱|분쇄도|클릭|D\s*\+|노력/;

function hasFlavor(note: string): boolean {
  return FLAVOR_TAGS.some((t) => t.patterns.some((p) => note.includes(p)));
}

// 긍정 코멘트 묶음에서 맛 태그 상위 N개 추출 ("~없음" 등 부정 표현은 제외)
function extractTags(notes: string[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const seen = new Set<string>();
    for (const t of FLAVOR_TAGS) {
      let matched = false;
      for (const p of t.patterns) {
        let from = 0;
        while (from <= note.length) {
          const idx = note.indexOf(p, from);
          if (idx < 0) break;
          const after = note.slice(idx + p.length, idx + p.length + 5);
          if (!after.includes("없")) { matched = true; break; } // '신맛 없음' 등 부정은 건너뜀
          from = idx + p.length;
        }
        if (matched) break;
      }
      if (matched && !seen.has(t.label)) {
        seen.add(t.label);
        counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// 직원 이름 제거 (담당자 컬럼에서 수집한 이름 + 존칭 접미사)
function anonymize(note: string, nameSet: Set<string>): string {
  let s = note;
  let removed = false;
  for (const nm of nameSet) {
    if (nm.length < 2) continue;
    if (s.includes(nm)) removed = true;
    s = s.split(nm).join("");
  }
  // 존칭 접미사 제거는 실제로 이름을 지운 문장에만 적용한다.
  // (그렇지 않으면 '여운이 깁니다' 같은 조사까지 잘려 문장이 어색해진다)
  if (removed) s = s.replace(/(이|씨|님|형|누나|쌤)\s/g, " ");
  return s.replace(/\s{2,}/g, " ").replace(/^[\s,·]+|[\s,·]+$/g, "").trim();
}

// 원두별 대표 코멘트 1~2개 선별 (맛 위주, 세팅 메모·이름 제외)
function pickNotes(comments: { veryPos: boolean; note: string }[], nameSet: Set<string>): string[] {
  const clean = comments
    .map((c) => ({ veryPos: c.veryPos, note: anonymize(c.note.trim(), nameSet) }))
    .filter((c) => {
      const n = c.note;
      if (n.length < 8 || n.length > 70) return false; // 너무 짧거나 긴 서술 제외
      if (MEMO_RE.test(n)) return false; // 세팅 메모 제외
      return true;
    });
  clean.sort((a, b) => {
    if (a.veryPos !== b.veryPos) return a.veryPos ? -1 : 1; // 매우 긍정 우선
    const ha = hasFlavor(a.note), hb = hasFlavor(b.note);
    if (ha !== hb) return ha ? -1 : 1; // 맛 표현 있는 코멘트 우선
    return a.note.length - b.note.length; // 간결한 것 우선
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of clean) {
    const key = c.note.slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.note);
    if (out.length >= 2) break;
  }
  return out;
}

type BinAcc = { count: number; dose: number; doseN: number; yield: number; yieldN: number; time: number; timeN: number };
const HUM_BINS: { label: string; max: number }[] = [
  { label: "~49%", max: 50 },
  { label: "50–59%", max: 60 },
  { label: "60–69%", max: 70 },
  { label: "70–79%", max: 80 },
  { label: "80%+", max: Infinity },
];
const TEMP_BINS: { label: string; max: number }[] = [
  { label: "~21℃", max: 22 },
  { label: "22–23℃", max: 24 },
  { label: "24–25℃", max: 26 },
  { label: "26–27℃", max: 28 },
  { label: "28℃+", max: Infinity },
];
function binIndex(bins: { label: string; max: number }[], v: number): number {
  for (let i = 0; i < bins.length; i++) if (v < bins[i].max) return i;
  return bins.length - 1;
}
function newAcc(): BinAcc { return { count: 0, dose: 0, doseN: 0, yield: 0, yieldN: 0, time: 0, timeN: 0 }; }
function addRecipe(a: BinAcc, d: number, y: number, t: number) {
  a.count++;
  if (Number.isFinite(d)) { a.dose += d; a.doseN++; }
  if (Number.isFinite(y)) { a.yield += y; a.yieldN++; }
  if (Number.isFinite(t)) { a.time += t; a.timeN++; }
}


// 별점(1~5)을 시트의 평가 표기로 변환
function ratingLabel(n: number): string {
  if (n >= 5) return "매우 긍정";
  if (n === 4) return "긍정";
  if (n === 3) return "보통";
  if (n === 2) return "부정";
  if (n === 1) return "매우 부정";
  return "";
}

/** 집계 입력 — DB의 추출 기록 한 줄 */
export type EspressoLogRow = {
  date: string;
  bean: string;
  dose: number;
  yield: number;
  time: number;
  roomTemp: number;
  roomHumidity: number;
  rating: number; // 1~5, 0이면 미평가
  note: string;
  staff: string;
};

/** 직원 앱 기록만으로 집계한다 (구글시트 없이) */
export function aggregateLogs(rows: EspressoLogRow[]): EspressoStats {
  const humAcc = HUM_BINS.map(newAcc);
  const tempAcc = TEMP_BINS.map(newAcc);

  const ratingMap = new Map<string, number>();
  const dateMap = new Map<string, number>();
  const beanMap = new Map<string, { count: number; dose: number; yield: number; time: number; doseN: number; yieldN: number; timeN: number }>();
  const beanComments = new Map<string, { veryPos: boolean; note: string }[]>();
  const nameSet = new Set<string>();
  let total = 0;
  const dates: string[] = [];

  for (const r of rows) {
    const bean = (r.bean ?? "").trim();
    const rating = ratingLabel(r.rating);
    if (!r.date && !bean && !rating) continue;
    total++;

    // 담당자 이름 수집 (대표 코멘트 익명화용) — 전체 이름 + 성 뗀 이름
    const nm = (r.staff ?? "").trim();
    if (nm.length >= 2) {
      nameSet.add(nm);
      if (nm.length >= 3) nameSet.add(nm.slice(1)); // '박대건' → '대건'
    }

    if (rating) ratingMap.set(rating, (ratingMap.get(rating) ?? 0) + 1);
    if (r.date) { dateMap.set(r.date, (dateMap.get(r.date) ?? 0) + 1); dates.push(r.date); }

    // 평균 레시피 · 환경 구간별 집계: 긍정/매우 긍정 평가 기록만 반영
    if (!POSITIVE_RATINGS.includes(rating)) continue;

    const d = r.dose > 0 ? r.dose : NaN;
    const y = r.yield > 0 ? r.yield : NaN;
    const t = r.time > 0 ? r.time : NaN;

    if (bean) {
      const b = beanMap.get(bean) ?? { count: 0, dose: 0, yield: 0, time: 0, doseN: 0, yieldN: 0, timeN: 0 };
      b.count++;
      if (Number.isFinite(d)) { b.dose += d; b.doseN++; }
      if (Number.isFinite(y)) { b.yield += y; b.yieldN++; }
      if (Number.isFinite(t)) { b.time += t; b.timeN++; }
      beanMap.set(bean, b);
      const note = (r.note ?? "").trim();
      if (note) {
        const arr = beanComments.get(bean) ?? [];
        arr.push({ veryPos: r.rating >= 5, note });
        beanComments.set(bean, arr);
      }
    }

    if (r.roomHumidity > 0) addRecipe(humAcc[binIndex(HUM_BINS, r.roomHumidity)], d, y, t);
    if (r.roomTemp > 0) addRecipe(tempAcc[binIndex(TEMP_BINS, r.roomTemp)], d, y, t);
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
      const comments = beanComments.get(bean) ?? [];
      return {
        bean,
        count: b.count,
        avgDose: r1(avgDose),
        avgYield: r1(avgYield),
        avgTime: r1(avgTime),
        ratio: avgDose > 0 ? r1(avgYield / avgDose) : 0,
        tags: extractTags(comments.map((c) => c.note)),
        notes: pickNotes(comments, nameSet),
      };
    })
    .sort((a, b) => b.count - a.count);

  const binRows = (bins: { label: string; max: number }[], acc: BinAcc[]) =>
    bins
      .map((bin, i) => {
        const a = acc[i];
        const avgDose = a.doseN ? a.dose / a.doseN : 0;
        const avgYield = a.yieldN ? a.yield / a.yieldN : 0;
        const avgTime = a.timeN ? a.time / a.timeN : 0;
        return {
          label: bin.label,
          count: a.count,
          avgDose: r1(avgDose),
          avgYield: r1(avgYield),
          avgTime: r1(avgTime),
          ratio: avgDose > 0 ? r1(avgYield / avgDose) : 0,
        };
      })
      .filter((b) => b.count > 0);

  const sortedDates = dates.slice().sort();
  return {
    totalLogs: total,
    from: sortedDates[0] ?? "",
    to: sortedDates[sortedDates.length - 1] ?? "",
    byRating,
    byDate,
    byBeanRecipe,
    byHumidity: binRows(HUM_BINS, humAcc),
    byTemp: binRows(TEMP_BINS, tempAcc),
  };
}
