import { AdminLayout } from "@/components/AdminLayout";
import { EspressoLogCharts } from "@/components/EspressoLogCharts";

export default function AdminEspresso() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Espresso log</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">에스프레소 추출 로그</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          구글폼(데일리 에스프레소 로그) 응답을 집계한 차트입니다. 공개 페이지·메인 화면에도 동일하게 노출됩니다.
        </p>
        <EspressoLogCharts />
      </div>
    </AdminLayout>
  );
}
