interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

const HORIZONTAL_LOGO = "knit-logo-horizontal.svg";
const STACKED_LOGO = "knit-logo-stacked.svg";

function assetUrl(name: string) {
  // Vite base "./" 사용 시에도 안전하게 동작하도록 import.meta.env.BASE_URL prefix.
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base}${name}`.replace(/\/+/g, "/");
}

// Knit Coffee 공식 로고 — 가로형 (knit + COFFEE 한 줄).
// AI 원본 viewBox 약 4:1. size 인자 = 높이(px), 폭은 자동.
export function Wordmark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <img
      src={assetUrl(HORIZONTAL_LOGO)}
      alt="knit COFFEE"
      style={{ height: size, width: "auto", display: "block" }}
      className={`select-none ${className ?? ""}`}
      draggable={false}
    />
  );
}

// 스택형 로고 (knit 위 / COFFEE 아래) — 정사각형 공간(인보이스·로그인)에 적합.
export function StackedLogo({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <img
      src={assetUrl(STACKED_LOGO)}
      alt="knit COFFEE"
      style={{ height: size, width: "auto", display: "block" }}
      className={`select-none ${className ?? ""}`}
      draggable={false}
    />
  );
}

// 호환용 — 가로 로고를 작게.
export function KnitMark({ size = 32, className }: { size?: number; className?: string }) {
  return <Wordmark size={size * 0.7} className={className} />;
}

export function Logo({ size = 20, withWordmark = true, className }: LogoProps) {
  void withWordmark;
  return (
    <div className={`flex items-center ${className ?? ""}`}>
      <Wordmark size={size} />
    </div>
  );
}
