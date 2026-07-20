// 카카오톡 채널 바로가기 — 우측 하단 플로팅 버튼 (브랜드 톤: 차분한 다크)
// 로그인 페이지 / 메인(카탈로그) 페이지 공용 컴포넌트

const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_xiLQFG";

// 카카오톡 말풍선 심볼 (단색, currentColor)
function KakaoBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden="true">
      <path d="M128 36C70.56 36 24 72.89 24 118.4c0 29.44 19.48 55.26 48.77 69.83-1.61 5.6-10.34 35.9-10.69 38.28 0 0-.21 1.79.95 2.47.87.5 1.86.3 2.53.15 3.32-.46 38.44-25.12 44.51-29.4 6.14.86 12.44 1.31 18.93 1.31 57.44 0 104-36.89 104-82.4S185.44 36 128 36z" />
    </svg>
  );
}

export function KakaoChannelButton() {
  return (
    <a
      href={KAKAO_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="카카오톡 채널로 문의하기"
      data-testid="button-kakao-channel"
      className="group fixed bottom-16 right-5 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-3.5 text-background shadow-lg ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl sm:bottom-7 sm:right-7"
    >
      <KakaoBubbleIcon className="h-5 w-5 shrink-0" />
      <span className="hidden pr-0.5 font-ui text-xs font-semibold tracking-wide sm:inline">
        카카오톡 문의
      </span>
    </a>
  );
}
