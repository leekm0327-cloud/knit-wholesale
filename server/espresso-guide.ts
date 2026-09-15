import type { EspressoLog } from "../shared/schema";
import { BASIC_SENSES, readNotes, readSensory, type BasicSense, type PartnerBrewGuide, type PublicExtraction } from "../shared/espresso-sensory";

// Historical taste/weight labels are not aroma notes. Do not reinterpret them as new scores.
const legacyTasteLabels = new Set(["단맛", "산미", "쓴맛", "묵직", "가벼움"]);
function publicNotes(log: EspressoLog) { return readNotes(log.flavorTags).filter(n => !legacyTasteLabels.has(n)); }
function publicExtraction(log: EspressoLog): PublicExtraction {
  const sensory = readSensory(log.sensory);
  // Explicit whitelist: no staff identity, memo, quality, textures or defects in public responses.
  return {
    id: log.id, date: log.logDate, dose: log.doseG, yield: log.yieldG, seconds: log.timeSec,
    waterTemp: log.waterTemp, grind: log.grindSetting, roastDays: log.roastDays,
    roomTemp: log.roomTemp, humidity: log.roomHumidity, grinderTemp: log.grinderTemp,
    notes: publicNotes(log), intensities: Object.fromEntries(BASIC_SENSES.map(key => [key, sensory[key].intensity])) as Record<BasicSense, number | null>,
  };
}
export function buildPartnerBrewGuide(logs: EspressoLog[], now = new Date()): PartnerBrewGuide {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const to = kst.toISOString().slice(0, 10);
  kst.setUTCDate(kst.getUTCDate() - 13);
  const from = kst.toISOString().slice(0, 10);
  const groups = new Map<string, EspressoLog[]>();
  for (const log of logs.filter(l => l.logDate <= to).sort((a, b) => b.logDate.localeCompare(a.logDate) || b.createdAt - a.createdAt || b.id - a.id)) {
    const name = log.beanName.trim();
    if (!name) continue;
    const rows = groups.get(name) ?? [];
    rows.push(log); groups.set(name, rows);
  }
  return { from, to, beans: Array.from(groups, ([bean, all]) => {
    const recent = all.filter(l => l.logDate >= from).map(publicExtraction);
    const validRecipe = (l: EspressoLog) => l.doseG > 0 && l.yieldG > 0 && l.timeSec > 0;
    const confirmed = all.find(l => l.recommendToPartners === 1 && validRecipe(l));
    const legacy = all.find(l => !l.sensory && l.rating >= 4 && validRecipe(l));
    const recommendation = confirmed ?? legacy;
    const counts = new Map<string, number>();
    recent.forEach(l => l.notes.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1)));
    const intensities = Object.fromEntries(BASIC_SENSES.map(key => {
      const values = recent.map(l => l.intensities[key]).filter((v): v is number => v !== null);
      return [key, {
        count: values.length, mean: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null,
        min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
      }];
    })) as PartnerBrewGuide["beans"][number]["intensities"];
    return {
      bean, count: recent.length, recommendation: recommendation ? publicExtraction(recommendation) : null,
      recommendationSource: confirmed ? "confirmed" as const : legacy ? "legacy" as const : null,
      notes: Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko")),
      intensities, recent,
    };
  }).sort((a, b) => b.count - a.count || a.bean.localeCompare(b.bean, "ko")) };
}
