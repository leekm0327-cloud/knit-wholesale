import { AdminLayout } from "@/components/AdminLayout";
import { DessertItemManager } from "@/components/DessertItemManager";

export default function AdminDessertItems() {
  return <AdminLayout><div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-xl font-semibold">디저트 목록</h1><p className="mt-2 text-sm text-muted-foreground">직원들이 생산·폐기를 기록할 때 선택하는 품목을 관리합니다.</p></div>
      <a href="?tab=dessert#/admin/staff/logs" className="inline-flex min-h-10 items-center text-sm underline">생산·폐기 기록 보기</a>
    </div>
    <DessertItemManager />
  </div></AdminLayout>;
}
