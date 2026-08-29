import { Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { EspressoLogCharts } from "@/components/EspressoLogCharts";

export default function Espresso() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="mb-10 flex flex-col items-center text-center">
          <StackedLogo />
          <p className="eyebrow mt-6">Espresso Extraction Log</p>
          <h1 className="font-display mt-3 break-keep text-3xl font-semibold tracking-tight text-foreground">
            에스프레소 추출 로그
          </h1>
          <p className="mt-3 max-w-lg break-keep text-[15px] leading-relaxed text-muted-foreground">
            니트커피는 매 세팅마다 추출 데이터를 기록하고 관리합니다.
            실제 매장에서 쌓인 추출 기록을 집계해 보여드립니다.
          </p>
        </div>

        <EspressoLogCharts />

        <div className="mt-12 border-t border-border pt-8 text-center">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            data-testid="link-back-login"
          >
            로그인 / 주문하러 가기
          </Link>
        </div>
      </div>
    </div>
  );
}
