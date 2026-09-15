import { z } from "zod";

export const FLAVOR_GROUPS: Record<string, readonly string[]> = {
  과일: ["레몬", "라임", "오렌지", "귤", "자몽", "유자", "베르가모트", "청사과", "배", "복숭아", "살구", "자두", "체리", "딸기", "라즈베리", "블루베리", "블랙커런트", "청포도", "적포도", "망고", "파인애플", "패션프루트", "리치", "건포도", "무화과", "대추"],
  꽃: ["재스민", "장미", "오렌지꽃", "아카시아꽃", "라벤더"],
  "견과·곡물": ["견과류", "아몬드", "헤이즐넛", "호두", "땅콩", "피칸", "밤", "볶은 보리", "구운 곡물"],
  초콜릿: ["초콜릿", "다크 초콜릿", "밀크 초콜릿", "코코아"],
  "달콤한 향": ["캐러멜", "꿀", "흑설탕", "메이플 시럽", "바닐라", "당밀", "토피"],
  "차·허브": ["홍차", "녹차", "우롱차", "캐모마일", "민트", "레몬그라스"],
  향신료: ["시나몬", "정향", "생강", "육두구"],
  "발효·와인": ["와인", "럼", "발효 과일", "요거트"],
};
export const noteKey = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/[\s·_-]+/g, "");
const aliases: Record<string, string> = {
  초콜렛: "초콜릿", chocolate: "초콜릿", 다크초콜렛: "다크 초콜릿", darkchocolate: "다크 초콜릿",
  밀크초콜렛: "밀크 초콜릿", milkchocolate: "밀크 초콜릿", 카라멜: "캐러멜", caramel: "캐러멜",
  자스민: "재스민", jasmine: "재스민", 헤즐넛: "헤이즐넛", hazelnut: "헤이즐넛", 너티: "견과류", nutty: "견과류",
};
const canonical = new Map(Object.values(FLAVOR_GROUPS).flat().map(n => [noteKey(n), n]));
export function canonicalNote(value: string): string {
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return aliases[noteKey(text)] ?? canonical.get(noteKey(text)) ?? text;
}
export function normalizeNotes(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(canonicalNote).filter(n => {
    const key = noteKey(n);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function readNotes(raw: string): string[] {
  try { const value = JSON.parse(raw); return Array.isArray(value) ? normalizeNotes(value.filter(v => typeof v === "string")) : []; }
  catch { return []; }
}
export function matchingNotes(query: string, group: string): string[] {
  const key = noteKey(query);
  const categoryAlias: Record<string, string> = { floral: "꽃", 플로럴: "꽃", fruity: "과일", 고소: "견과·곡물" };
  const search = categoryAlias[key] ?? canonicalNote(query);
  return Object.entries(FLAVOR_GROUPS).flatMap(([category, notes]) => {
    if (!query && group !== "전체" && category !== group) return [];
    return notes.filter(n => !key || noteKey(n).includes(noteKey(search)) || noteKey(category).includes(noteKey(search)));
  });
}

export const BASIC_SENSES = ["acidity", "sweetness", "body", "bitterness"] as const;
export type BasicSense = typeof BASIC_SENSES[number];
export const SENSE_LABELS = { acidity: "산미", sweetness: "단맛", body: "바디", bitterness: "쓴맛", flavor: "향미", aftertaste: "후미", balance: "균형", cleanliness: "깔끔함" } as const;
export const TEXTURES = ["매끄러움", "크리미함", "실키함", "오일리함", "물 같음", "거침", "입안이 마름"] as const;
export const DEFECTS = ["탄 향", "재 향", "종이 향", "곰팡이 냄새", "고무 냄새", "풋내", "식초 같은 향", "거슬리는 발효취"] as const;
const quality = z.number().int().min(1).max(5).nullable().default(null);
const pair = (min = 0) => z.object({ intensity: z.number().int().min(min).max(5).nullable().default(null), quality }).strict().default({});
export const espressoSensorySchema = z.object({
  acidity: pair(), sweetness: pair(), body: pair(1), bitterness: pair(), flavor: pair(1), aftertaste: pair(1),
  balance: quality, cleanliness: quality,
  textures: z.array(z.enum(TEXTURES)).max(TEXTURES.length).default([]),
  defects: z.array(z.enum(DEFECTS)).max(DEFECTS.length).default([]),
}).strict();
export type EspressoSensory = z.infer<typeof espressoSensorySchema>;
export function emptySensory(): EspressoSensory { return espressoSensorySchema.parse({}); }
export function readSensory(raw: string | null | undefined): EspressoSensory {
  try { const parsed = espressoSensorySchema.safeParse(JSON.parse(raw || "{}")); return parsed.success ? parsed.data : emptySensory(); }
  catch { return emptySensory(); }
}
export const noteListSchema = z.array(z.string().trim().min(1).max(30)).max(20).transform(normalizeNotes);
export const QUALITY_LABELS = ["", "매우 아쉬움", "아쉬움", "보통", "좋음", "매우 좋음"];
export function intensityLabels(sense: keyof typeof SENSE_LABELS): string[] {
  if (sense === "body") return ["", "아주 가벼움", "가벼움", "중간", "무거움", "아주 무거움"];
  if (sense === "aftertaste") return ["", "아주 짧음", "짧음", "중간", "김", "아주 김"];
  return ["없음", "아주 약함", "약함", "중간", "강함", "아주 강함"];
}

export type IntensitySummary = { mean: number | null; min: number | null; max: number | null; count: number };
export type PublicExtraction = {
  id: number; date: string; dose: number; yield: number; seconds: number; waterTemp: number;
  grind: string; roastDays: number; roomTemp: number; humidity: number; grinderTemp: number;
  notes: string[]; intensities: Record<BasicSense, number | null>;
};
export type PartnerBrewGuide = {
  from: string; to: string;
  beans: {
    bean: string; count: number; recommendation: PublicExtraction | null; recommendationSource: "confirmed" | "legacy" | null;
    notes: { label: string; count: number }[];
    intensities: Record<BasicSense, IntensitySummary>;
    recent: PublicExtraction[];
  }[];
};
