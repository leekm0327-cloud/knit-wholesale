// Classification is category-driven: legacy coffee templates on equipment must not select coffee UI.
const COFFEE_CATEGORIES = new Set(['blend', 'decaf', 'single', 'single_espresso', 'single_filter', 'dripbag']);
const EQUIPMENT_LABELS: Record<string, string> = { water_filter: '정수 필터', machine_parts: '머신 부품' };
export function productDetailKind(key: string, category?: { label: string; groupLabel?: string; isBean: number }) {
  const coffee = !EQUIPMENT_LABELS[key] && (COFFEE_CATEGORIES.has(key) || category?.isBean === 1);
  const label = category?.label || EQUIPMENT_LABELS[key] || '';
  return { coffee, label, title: label ? `${label} 정보` : '상품 정보' };
}
export function storedDetailObject(raw: string | null | undefined): Record<string, unknown> {
  try { const d = JSON.parse(raw || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
export const PRODUCT_SPEC_FIELDS = [
  ['description', '상품 설명'], ['specifications', '규격·사양'], ['compatibility', '호환 정보'], ['recommendedUse', '사용·관리 안내'],
] as const;

/** Separate cover photo; older products fall back to their first detail image. */
export function productThumbnail(raw: string | null | undefined): string {
  const value = storedDetailObject(raw).thumbnailImage;
  return typeof value === 'string' ? value : '';
}

export function productGalleryImages(raw: string | null | undefined, detailImages: string[]): string[] {
  const thumbnail = productThumbnail(raw);
  return thumbnail ? [thumbnail] : detailImages;
}
