interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

// X자 매듭(니트 스티치) 모티프 — 두 사선이 교차하며 끝이 둥글게 처리된 손뜨개 느낌
export function KnitMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="니트커피 로고"
      role="img"
    >
      {/* 좌상 -> 우하 가닥 */}
      <path
        d="M12 11 C 18 18, 30 30, 36 37"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* 우상 -> 좌하 가닥 */}
      <path
        d="M36 11 C 30 18, 18 30, 12 37"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* 교차점 매듭 강조 */}
      <circle cx="24" cy="24" r="3.4" fill="currentColor" />
      {/* 가닥 끝 매듭 */}
      <circle cx="12" cy="11" r="2.2" fill="currentColor" />
      <circle cx="36" cy="11" r="2.2" fill="currentColor" />
      <circle cx="12" cy="37" r="2.2" fill="currentColor" />
      <circle cx="36" cy="37" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 32, withWordmark = true, className }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <KnitMark size={size} className="text-accent" />
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
            Knit Coffee
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Wholesale
          </span>
        </div>
      )}
    </div>
  );
}
