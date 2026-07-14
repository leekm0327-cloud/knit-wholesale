// 에스프레소 추출 환경 인포그래픽용 라인 아이콘 세트 (사이트 톤 = lucide 얇은 라인)
import {
  Coffee,
  Cog,
  Droplet,
  Droplets,
  CircleDot,
  Filter,
  Thermometer,
  Timer,
  Scale,
  Zap,
  FlaskConical,
  Leaf,
  Gauge,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// 관리자 아이콘 선택지 (key → 아이콘 + 라벨)
export const ESPRESSO_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "coffee", label: "커피/머신", Icon: Coffee },
  { key: "grinder", label: "그라인더", Icon: Cog },
  { key: "water", label: "물방울", Icon: Droplet },
  { key: "droplets", label: "습도", Icon: Droplets },
  { key: "basket", label: "바스켓", Icon: CircleDot },
  { key: "filter", label: "필터", Icon: Filter },
  { key: "thermometer", label: "온도", Icon: Thermometer },
  { key: "timer", label: "시간", Icon: Timer },
  { key: "scale", label: "저울", Icon: Scale },
  { key: "gauge", label: "게이지", Icon: Gauge },
  { key: "wrench", label: "장비", Icon: Wrench },
  { key: "zap", label: "전원", Icon: Zap },
  { key: "flask", label: "추출", Icon: FlaskConical },
  { key: "leaf", label: "원두", Icon: Leaf },
];

const KEY_MAP: Record<string, LucideIcon> = ESPRESSO_ICON_OPTIONS.reduce(
  (acc, o) => ((acc[o.key] = o.Icon), acc),
  {} as Record<string, LucideIcon>,
);

// 기존에 저장된 이모지도 라인 아이콘으로 매핑 (마이그레이션 없이 호환)
const EMOJI_MAP: Record<string, LucideIcon> = {
  "☕": Coffee,
  "⚙️": Cog,
  "⚙": Cog,
  "💧": Droplet,
  "🧩": CircleDot,
  "💦": Droplets,
  "🌡️": Thermometer,
  "⏱️": Timer,
};

// 저장된 값(아이콘 key 또는 레거시 이모지)을 라인 아이콘 컴포넌트로 해석
export function resolveEspressoIcon(value: string | undefined | null): LucideIcon {
  if (value) {
    if (KEY_MAP[value]) return KEY_MAP[value];
    if (EMOJI_MAP[value]) return EMOJI_MAP[value];
  }
  return Coffee;
}
