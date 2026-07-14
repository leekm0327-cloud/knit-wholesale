import { Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { EspressoLogCharts } from "@/components/EspressoLogCharts";
import { ChevronLeft } from "lucide-react";

export default function Espresso() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <StackedLogo />
          <h1 className="font-display mt-6 text-2xl font-semibold text-foreground">에스프레소 추출 로그</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            니트커피는 매 세팅마다 추출 데이터를 기록하고 관리합니다. 실제 매장에서 쌓인 추출 기록을 집계해 보여드립니다.
          </p>
        </div>

        <EspressoLogCharts />

        <div className="mt-10 flex justify-center">
          <Link href="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-login">
            <ChevronLeft className="h-4 w-4" />
            로그인 / 주문하러 가기
          </Link>
        </div>
      </div>
    </div>
  );
}
