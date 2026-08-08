import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { won } from "@/lib/format";
import type { PosSummary, PosCompare } from "@shared/schema";
import { Upload, Loader2, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// 판매가 아닌 기록용 항목 — POS에서 테이블번호·인원수·좌석을 상품처럼 찍는 값들
const NOISE_CATS = new Set(["Number", "Seat"]);
// 상품명 자체가 표시용인 것 (매장/포장 구분 표시 등)
const NOISE_NAMES = new Set(["매장", "포장", "홀", "테이크아웃"]);
const SHEET_CANDIDATES = ["상품 주문 상세내역", "상품 주문 합계"];

// SheetJS(CDN) 동적 로드 — 서버 의존성 없이 브라우저에서 엑셀 파싱
async function loadXLSX(): Promise<any> {
  const CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
  return await import(/* @vite-ignore */ CDN);
}
function toNum(v: any): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function toYmd(v: any): string {
  if (v == null) return "";
  const s = String(v);
  const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}
function hourOf(v: any): number | null {
  if (v == null) return null;
  const m = String(v).match(/\b(\d{1,2}):(\d{2})/);
  return m ? Math.max(0, Math.min(23, parseInt(m[1], 10))) : null;
}
function findCol(header: any[], keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").replace(/\s+/g, "");
    if (keys.some((k) => h.includes(k.replace(/\s+/g, "")))) return i;
  }
  return -1;
}

export default function AdminPosSales() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const init = useMemo(() => {
    const now = new Date();
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: ymd(now) };
  }, []);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [category, setCategory] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [groupOrigin, setGroupOrigin] = useState(true); // 산지 원두를 Filter Coffee 한 줄로 묶기
  const [cmpMode, setCmpMode] = useState<"month" | "range">("month"); // 월 단위 vs 임의 기간
  const [rngA, setRngA] = useState({ from: "", to: "" });
  const [rngB, setRngB] = useState({ from: "", to: "" });
  const [cmpA, setCmpA] = useState<string>("");
  const [cmpB, setCmpB] = useState<string>("");

  const { data, isLoading } = useQuery<PosSummary>({
    queryKey: ["/api/admin/pos-sales/summary", { from, to, category, groupOrigin }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/pos-sales/summary?from=${from}&to=${to}&category=${encodeURIComponent(category)}&groupOrigin=${groupOrigin ? 1 : 0}`);
      return res.json();
    },
    enabled: isOwner,
  });

  // 월별 비교 (a=이전 달, b=기준 달. 미지정이면 서버가 최근 2개월 자동 선택)
  const { data: cmp } = useQuery<PosCompare>({
    queryKey: ["/api/admin/pos-sales/compare", { cmpA, cmpB, category, groupOrigin, cmpMode, rngA, rngB }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (cmpA) qs.set("a", cmpA);
      if (cmpB) qs.set("b", cmpB);
      qs.set("category", category);
      qs.set("groupOrigin", groupOrigin ? "1" : "0");
      if (cmpMode === "range" && rngA.from && rngA.to && rngB.from && rngB.to) {
        qs.set("aFrom", rngA.from); qs.set("aTo", rngA.to);
        qs.set("bFrom", rngB.from); qs.set("bTo", rngB.to);
      }
      const res = await apiRequest("GET", `/api/admin/pos-sales/compare?${qs.toString()}`);
      return res.json();
    },
    enabled: isOwner,
  });

  function thisMonth() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setTo(ymd(now));
  }
  function lastMonth() {
    const now = new Date();
    setFrom(ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    setTo(ymd(new Date(now.getFullYear(), now.getMonth(), 0)));
  }
  function thisYear() {
    const now = new Date();
    setFrom(`${now.getFullYear()}-01-01`);
    setTo(ymd(now));
  }
  function useCoverage() {
    if (data?.coverage) { setFrom(data.coverage.from); setTo(data.coverage.to); }
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = SHEET_CANDIDATES.find((s) => wb.SheetNames.includes(s)) || wb.SheetNames.find((s: string) => s.includes("상품"));
      if (!sheetName) throw new Error("‘상품 주문 상세내역’ 시트를 찾을 수 없습니다. POS 매출리포트 엑셀이 맞는지 확인해 주세요.");
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      if (!rows.length) throw new Error("시트에 데이터가 없습니다.");
      const header = rows[0];
      const isDetail = sheetName.includes("상세");
      const cDate = findCol(header, ["주문기준일자", "기준일자", "기간"]);
      const cStatus = findCol(header, ["결제상태"]);
      const cTime = findCol(header, ["주문시작시각", "시작시각"]);
      const cName = findCol(header, ["상품명"]);
      const cCat = findCol(header, ["카테고리"]);
      const cQty = findCol(header, ["수량", "판매건수"]);
      const cAmt = findCol(header, ["실판매금액", "실 판매 금액", "실판매", "판매금액"]);
      if (cDate < 0 || cName < 0 || cAmt < 0) throw new Error("필요한 열(날짜·상품명·판매금액)을 찾지 못했습니다.");

      const prodMap = new Map<string, { date: string; category: string; product: string; qty: number; amount: number }>();
      const hourMap = new Map<string, { date: string; hour: number; category: string; qty: number; amount: number }>();
      // 상세시트는 설명행(1행)을 건너뜀
      const start = isDetail ? 2 : 1;
      let skipped = 0;
      let zeroPriced = 0; // 선결제 소진 등 0원으로 제공된 실제 판매 건수
      const zeroNames = new Set<string>(); // 0원으로 잡힌 메뉴 (예상과 다른 항목이 섞였는지 확인용)
      for (let i = start; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        const date = toYmd(r[cDate]);
        if (!date) continue;
        const status = cStatus >= 0 ? String(r[cStatus] ?? "") : "";
        // 상세시트: 완료 건만. 취소/기타 제외
        if (isDetail && cStatus >= 0 && status && status !== "완료") { skipped++; continue; }
        const cat = String(r[cCat] ?? "").trim();
        const name = String(r[cName] ?? "").trim();
        const qty = Math.round(toNum(r[cQty]));
        const amount = Math.round(toNum(r[cAmt]));
        // 노이즈 제외 — '금액 0원'이 아니라 '항목의 성격'으로 판단한다.
        //  선결제 고객이 마신 음료는 100% 할인되어 0원으로 찍히지만 실제 판매이므로 수량을 세야 한다.
        //  (매출은 선결제 판매 시점에 이미 잡혔으므로 0원이 더해져도 금액은 영향 없음)
        if (!name || NOISE_CATS.has(cat) || NOISE_NAMES.has(name) || amount < 0) { skipped++; continue; }

        if (amount === 0) { zeroPriced += 1; zeroNames.add(name); }

        const pk = `${date}||${cat}||${name}`;
        const pc = prodMap.get(pk) || { date, category: cat, product: name, qty: 0, amount: 0 };
        pc.qty += qty; pc.amount += amount; prodMap.set(pk, pc);

        const hh = cTime >= 0 ? hourOf(r[cTime]) : null;
        if (hh != null) {
          const hk = `${date}||${hh}||${cat}`;
          const hc = hourMap.get(hk) || { date, hour: hh, category: cat, qty: 0, amount: 0 };
          hc.qty += qty; hc.amount += amount; hourMap.set(hk, hc);
        }
      }

      const products = [...prodMap.values()];
      const hourly = [...hourMap.values()];
      if (products.length === 0) throw new Error("집계할 판매 데이터가 없습니다. (모두 취소·0원·노이즈로 제외됨)");
      const dates = products.map((p) => p.date).sort();
      const payload = { from: dates[0], to: dates[dates.length - 1], products, hourly };

      // 업로드는 해당 기간을 통째로 교체한다. 이미 저장된 데이터가 있으면 규모를 보여주고 확인받는다.
      // (기간이 겹치는 파일을 실수로 올려 기존 데이터가 사라지는 것을 막기 위함)
      try {
        const infoRes = await apiRequest("GET", `/api/admin/pos-sales/range-info?from=${payload.from}&to=${payload.to}`);
        const info = await infoRes.json();
        if (info?.products > 0) {
          const ok = confirm(
            `${payload.from} ~ ${payload.to} 구간에 이미 저장된 데이터가 있습니다.\n\n` +
            `기존: ${info.days}일 · ${info.products.toLocaleString()}건 · ${info.amount.toLocaleString()}원\n` +
            `새 파일: ${new Set(products.map((p) => p.date)).size}일 · ${products.length.toLocaleString()}건 · ${products.reduce((s, p) => s + p.amount, 0).toLocaleString()}원\n\n` +
            `이 구간은 새 파일 내용으로 교체됩니다. 진행할까요?`,
          );
          if (!ok) { setUploading(false); if (fileRef.current) fileRef.current.value = ""; return; }
        }
      } catch { /* 확인 조회 실패는 업로드를 막지 않음 */ }

      const res = await apiRequest("POST", "/api/admin/pos-sales/import", payload);
      const info = await res.json();
      toast({ title: "업로드 완료", description: `${info.from} ~ ${info.to} · 상품 ${info.products}행 저장${info.storeDays ? ` · 매장매출 ${info.storeDays}일 자동 반영` : ""}${zeroPriced ? ` · 0원 제공 ${zeroPriced}건 포함 (${Array.from(zeroNames).slice(0, 3).join(", ")}${zeroNames.size > 3 ? ` 외 ${zeroNames.size - 3}종` : ""})` : ""}${skipped ? ` (제외 ${skipped}행)` : ""}` });
      setFrom(info.from); setTo(info.to); setCategory("all");
      setCmpA(""); setCmpB(""); // 최근 2개월 자동 선택으로 초기화
      qc.invalidateQueries({ queryKey: ["/api/admin/pos-sales/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/pos-sales/compare"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: e?.message ?? "파일을 처리하지 못했습니다." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const cats = data?.categories ?? [];
  const topProducts = (data?.byProduct ?? []).slice(0, 30);
  const showMonth = (data?.byMonth?.length ?? 0) > 1;
  const avgPerDay = data && data.totals.days > 0 ? Math.round(data.totals.amount / data.totals.days) : 0;

  const weekdayData = (() => {
    const base = WEEKDAYS.map((label, i) => ({ label, amount: 0, qty: 0 }));
    (data?.byWeekday ?? []).forEach((w) => { if (base[w.weekday]) { base[w.weekday].amount = w.amount; base[w.weekday].qty = w.qty; } });
    return base;
  })();
  const hourData = (() => {
    const map = new Map((data?.byHour ?? []).map((h) => [h.hour, h]));
    const arr: { label: string; amount: number; qty: number }[] = [];
    for (let h = 6; h <= 23; h++) { const v = map.get(h); arr.push({ label: `${h}시`, amount: v?.amount ?? 0, qty: v?.qty ?? 0 }); }
    return arr;
  })();

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">POS sales</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">POS 매출 분석</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          POS 매출리포트 엑셀을 올리면 자동으로 분류·집계합니다. 취소·0원(테이블번호 등) 데이터는 제외되며, 같은 기간을 다시 올리면 덮어씁니다.
        </p>

        {/* 업로드 */}
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-pos-upload">
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              {uploading ? "처리 중…" : "POS 엑셀 업로드"}
            </Button>
            <p className="text-xs text-muted-foreground">
              매출리포트 &gt; 엑셀 다운로드 파일(.xlsx)을 그대로 올리시면 됩니다.
            </p>
          </div>
        </Card>

        {/* 기간 · 카테고리 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={thisMonth}>이번 달</Button>
              <Button variant="outline" size="sm" onClick={lastMonth}>지난달</Button>
              <Button variant="outline" size="sm" onClick={thisYear}>올해</Button>
              {data?.coverage && (
                <Button variant="outline" size="sm" onClick={useCoverage} title={`${data.coverage.from} ~ ${data.coverage.to}`}>
                  데이터 전체
                </Button>
              )}
            </div>
          </div>
          {data?.coverage && (
            <p className="mt-2 text-[11px] text-muted-foreground">저장된 데이터 범위: {data.coverage.from} ~ {data.coverage.to}</p>
          )}
          {/* 카테고리 필터 */}
          {cats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory("all")}
                className={`rounded-full border px-3 py-1 text-xs ${category === "all" ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
              >
                전체
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs ${category === c ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* 월별 비교 (저장된 전체 월 기준 — 위 기간 선택과 무관) */}
        {cmp && cmp.months.length > 0 && (
          <Card className="mb-6 overflow-hidden">
            <div className="border-b p-5">
              <h2 className="text-sm font-semibold text-foreground">{cmpMode === "range" ? "기간 비교" : "월별 비교"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                저장된 전체 월 기준입니다{category !== "all" ? ` · ${category}` : ""}. 위 기간 선택과는 별개로 동작합니다.
              </p>
            </div>

            {/* 월별 추이 표 */}
            <div className="table-scroll">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">월</th>
                    <th className="px-4 py-2 text-right font-medium">매출</th>
                    <th className="px-4 py-2 text-right font-medium">전월 대비</th>
                    <th className="px-4 py-2 text-right font-medium">수량</th>
                    <th className="px-4 py-2 text-right font-medium">영업일</th>
                    <th className="px-4 py-2 text-right font-medium">일평균</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cmp.months.map((m, i) => {
                    const prev = i > 0 ? cmp.months[i - 1] : null;
                    const d = prev && prev.amount > 0 ? ((m.amount - prev.amount) / prev.amount) * 100 : null;
                    return (
                      <tr key={m.month}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{m.month}</td>
                        <td className="px-4 py-2.5 text-right tabular text-foreground">{won(m.amount)}</td>
                        <td className={`px-4 py-2.5 text-right tabular text-xs ${d == null ? "text-muted-foreground" : d >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {d == null ? "—" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{m.qty.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{m.days}일</td>
                        <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{won(m.days > 0 ? Math.round(m.amount / m.days) : 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 비교 대상 선택 — 월 단위 또는 임의 기간 */}
            <div className="flex flex-col gap-3 border-t p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">비교 기준</span>
                <div className="flex overflow-hidden rounded-md border">
                  <button
                    onClick={() => setCmpMode("month")}
                    className={`px-3 py-1 text-xs ${cmpMode === "month" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                    data-testid="button-cmp-month"
                  >
                    월 단위
                  </button>
                  <button
                    onClick={() => {
                      // 처음 전환할 때 최근 두 달을 기본값으로 채워 바로 쓸 수 있게 한다
                      if (!rngA.from && cmp.months.length > 0) {
                        const last = cmp.months[cmp.months.length - 1].month;
                        const prev = cmp.months.length > 1 ? cmp.months[cmp.months.length - 2].month : last;
                        const endOf = (m: string) => {
                          const [y, mm] = m.split("-").map(Number);
                          return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
                        };
                        setRngA({ from: `${prev}-01`, to: endOf(prev) });
                        setRngB({ from: `${last}-01`, to: endOf(last) });
                      }
                      setCmpMode("range");
                    }}
                    className={`px-3 py-1 text-xs ${cmpMode === "range" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                    data-testid="button-cmp-range"
                  >
                    기간 직접 선택
                  </button>
                </div>
              </div>

              {cmpMode === "month" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={cmp.a?.month ?? ""}
                    onChange={(e) => setCmpA(e.target.value)}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                    data-testid="select-cmp-a"
                  >
                    {cmp.months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">→</span>
                  <select
                    value={cmp.b?.month ?? ""}
                    onChange={(e) => setCmpB(e.target.value)}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                    data-testid="select-cmp-b"
                  >
                    {cmp.months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">이전</span>
                    <Input type="date" value={rngA.from} onChange={(e) => setRngA({ ...rngA, from: e.target.value })} className="w-36" data-testid="input-cmp-a-from" />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input type="date" value={rngA.to} onChange={(e) => setRngA({ ...rngA, to: e.target.value })} className="w-36" data-testid="input-cmp-a-to" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">기준</span>
                    <Input type="date" value={rngB.from} onChange={(e) => setRngB({ ...rngB, from: e.target.value })} className="w-36" data-testid="input-cmp-b-from" />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input type="date" value={rngB.to} onChange={(e) => setRngB({ ...rngB, to: e.target.value })} className="w-36" data-testid="input-cmp-b-to" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    같은 길이의 기간끼리 비교해야 증감이 의미 있습니다. 예: 지난달 1~15일 vs 이번달 1~15일
                  </p>
                </div>
              )}
            </div>

            {cmp.a && cmp.b ? (
              <div className="p-5 pt-0">
                {/* 요약 3종 */}
                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { label: "매출", av: cmp.a.totals.amount, bv: cmp.b.totals.amount, fmt: (v: number) => won(v) },
                    { label: "판매수량", av: cmp.a.totals.qty, bv: cmp.b.totals.qty, fmt: (v: number) => `${v.toLocaleString()}개` },
                    {
                      label: "일평균 매출",
                      av: cmp.a.totals.days > 0 ? Math.round(cmp.a.totals.amount / cmp.a.totals.days) : 0,
                      bv: cmp.b.totals.days > 0 ? Math.round(cmp.b.totals.amount / cmp.b.totals.days) : 0,
                      fmt: (v: number) => won(v),
                    },
                  ].map((row) => {
                    const diff = row.bv - row.av;
                    const pctv = row.av > 0 ? (diff / row.av) * 100 : null;
                    return (
                      <div key={row.label} className="rounded-md border p-4">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="font-display mt-1 text-lg font-semibold tabular text-foreground">{row.fmt(row.bv)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {cmp.a!.month} {row.fmt(row.av)} →{" "}
                          <span className={diff >= 0 ? "text-emerald-600" : "text-destructive"}>
                            {diff >= 0 ? "+" : "−"}{row.fmt(Math.abs(diff))}
                            {pctv != null && ` (${diff >= 0 ? "+" : "−"}${Math.abs(pctv).toFixed(1)}%)`}
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* 메뉴별 증감 */}
                {(() => {
                  const map = new Map<string, { product: string; category: string; qa: number; qb: number; aa: number; ab: number }>();
                  cmp.a!.byProduct.forEach((p) => {
                    const k = `${p.category}||${p.product}`;
                    map.set(k, { product: p.product, category: p.category, qa: p.qty, qb: 0, aa: p.amount, ab: 0 });
                  });
                  cmp.b!.byProduct.forEach((p) => {
                    const k = `${p.category}||${p.product}`;
                    const cur = map.get(k) || { product: p.product, category: p.category, qa: 0, qb: 0, aa: 0, ab: 0 };
                    cur.qb = p.qty; cur.ab = p.amount; map.set(k, cur);
                  });
                  const rows = [...map.values()]
                    .map((r) => ({ ...r, dq: r.qb - r.qa, da: r.ab - r.aa }))
                    .sort((x, y) => Math.abs(y.da) - Math.abs(x.da))
                    .slice(0, 20);
                  if (rows.length === 0) return null;
                  return (
                    <>
                      <p className="mb-2 text-xs font-semibold text-foreground">
                        메뉴별 증감 <span className="font-normal text-muted-foreground">· 변동이 큰 20개</span>
                      </p>
                      <div className="table-scroll">
                        <table className="w-full min-w-[560px] text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">메뉴</th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">{cmp.a!.month}</th>
                              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">{cmp.b!.month}</th>
                              <th className="px-3 py-2 text-right font-medium">수량 증감</th>
                              <th className="px-3 py-2 text-right font-medium">매출 증감</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rows.map((r) => (
                              <tr key={`${r.category}-${r.product}`}>
                                <td className="px-3 py-2">
                                  <span className="font-medium text-foreground">{r.product}</span>
                                  <span className="ml-1.5 text-[11px] text-muted-foreground">{r.category}</span>
                                  {r.qa === 0 && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700">신규</span>}
                                  {r.qb === 0 && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">중단</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular text-muted-foreground">{r.qa.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular text-foreground">{r.qb.toLocaleString()}</td>
                                <td className={`px-3 py-2 text-right tabular ${r.dq >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                  {r.dq >= 0 ? "+" : "−"}{Math.abs(r.dq).toLocaleString()}
                                </td>
                                <td className={`px-3 py-2 text-right tabular ${r.da >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                  {r.da >= 0 ? "+" : "−"}{won(Math.abs(r.da))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="p-5 pt-0 text-xs text-muted-foreground">
                비교하려면 2개월 이상의 데이터가 필요합니다. 다른 달의 POS 엑셀도 업로드해 주세요.
              </p>
            )}
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>
        ) : !data || data.totals.qty === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              이 기간에 집계된 POS 매출이 없습니다.{data?.coverage ? " ‘데이터 전체’ 버튼으로 저장된 기간을 확인해 보세요." : " 먼저 POS 엑셀을 업로드해 주세요."}
            </p>
          </div>
        ) : (
          <>
            {/* 요약 지표 */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">총 매출</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground">{won(data.totals.amount)}</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">총 판매수량</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground">{data.totals.qty.toLocaleString()}개</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">영업일수</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground">{data.totals.days}일</p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">일평균 매출</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground">{won(avgPerDay)}</p>
              </div>
            </div>

            {/* 카테고리 집계 */}
            <Card className="mb-6 p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">카테고리별 매출</h2>
              <div className="space-y-2">
                {data.byCategory.map((c) => {
                  const ratio = data.totals.amount > 0 ? (c.amount / data.totals.amount) * 100 : 0;
                  return (
                    <div key={c.category} className="flex items-center gap-3">
                      <div className="w-28 shrink-0 truncate text-sm text-foreground">{c.category}</div>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div className="h-full rounded bg-foreground/70" style={{ width: `${ratio}%` }} />
                      </div>
                      <div className="w-16 shrink-0 text-right text-xs tabular text-muted-foreground">{ratio.toFixed(1)}%</div>
                      <div className="w-28 shrink-0 text-right text-sm tabular text-foreground">{won(c.amount)}</div>
                      <div className="w-16 shrink-0 text-right text-xs tabular text-muted-foreground">{c.qty.toLocaleString()}개</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 메뉴별 순위 */}
            <Card className="mb-6 overflow-hidden">
              <div className="border-b p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">메뉴별 판매 순위 {category !== "all" && <span className="text-muted-foreground">· {category}</span>}</h2>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={groupOrigin} onChange={(e) => setGroupOrigin(e.target.checked)} data-testid="check-group-origin" />
                    산지 원두를 ‘Filter Coffee’로 묶기
                  </label>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  판매수량 기준 상위 {topProducts.length}개
                  {groupOrigin && " · Colombia·Ethiopia처럼 산지명으로 시작하는 음료는 한 줄로 합산됩니다"}
                </p>
              </div>
              <div className="table-scroll">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">#</th>
                      <th className="px-4 py-2 text-left font-medium">메뉴</th>
                      <th className="px-4 py-2 text-left font-medium">카테고리</th>
                      <th className="px-4 py-2 text-right font-medium">판매수량</th>
                      <th className="px-4 py-2 text-right font-medium">매출</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {topProducts.map((p, i) => (
                      <tr key={`${p.category}-${p.product}`}>
                        <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{p.product}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.category}</td>
                        <td className="px-4 py-2.5 text-right tabular text-foreground">{p.qty.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular text-foreground">{won(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 일별 추이 */}
            <Card className="mb-6 p-5">
              <h2 className="mb-4 text-sm font-semibold text-foreground">일별 매출 추이</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byDate.map((d) => ({ label: d.date.slice(5), amount: d.amount }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} width={44} />
                  <Tooltip formatter={(v: any) => won(Number(v))} labelFormatter={(l) => `${l}`} />
                  <Bar dataKey="amount" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* 월별 추이 (2개월 이상일 때) */}
            {showMonth && (
              <Card className="mb-6 p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">월별 매출 추이</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.byMonth.map((m) => ({ label: m.month, amount: m.amount }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} width={44} />
                    <Tooltip formatter={(v: any) => won(Number(v))} />
                    <Bar dataKey="amount" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* 시간대 · 요일 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">시간대별 매출</h2>
                {data.byHour.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">시간 정보가 있는 데이터가 없습니다. (상세내역 시트 필요)</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={hourData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} width={40} />
                      <Tooltip formatter={(v: any) => won(Number(v))} />
                      <Bar dataKey="amount" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold text-foreground">요일별 매출</h2>
                {data.byWeekday.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">시간 정보가 있는 데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={weekdayData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 10000)}만`} width={40} />
                      <Tooltip formatter={(v: any) => won(Number(v))} />
                      <Bar dataKey="amount" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
