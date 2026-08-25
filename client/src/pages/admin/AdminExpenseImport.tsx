// 카드·은행 내역 불러오기 — 파일을 올리면 자동 분류하고, 애매한 것만 골라 확인한 뒤 저장한다.
//
// 파싱은 브라우저에서 한다. 서버에 파일 업로드 장치를 새로 만들지 않아도 되고,
// 카드사 파일 형식이 늘어나도 화면만 고치면 된다.
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg, won } from "@/lib/format";
import { SECTORS, SECTOR_LABEL, type FixedCostItem } from "@shared/schema";
import { Upload, Loader2, CheckCircle2, HelpCircle, Copy, Save, Wallet } from "lucide-react";

type ParsedRow = { date: string; merchant: string; amount: number; source: string; refNo: string };

type ClassifiedRow = ParsedRow & {
  key: string;
  category: string;
  sector: string;
  personal: boolean;
  excluded: boolean;
  confidence: "high" | "low";
  reason: string;
  duplicate: boolean;
};

type AnalyzeRes = {
  rows: ClassifiedRow[];
  summary: { total: number; high: number; low: number; duplicate: number; amount: number };
};

const ETC = "기타";

// ===== 파일 읽기 =====

async function loadSheetJs(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return w.XLSX;
  // 상수로 빼야 타입 검사기가 원격 모듈을 찾으려 들지 않는다 (POS 매출 화면과 같은 방식)
  const CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
  const mod = await import(/* @vite-ignore */ CDN);
  w.XLSX = mod;
  return mod;
}

function toIsoDate(v: unknown): string {
  const s = String(v ?? "").trim();
  // 2026.07.31 / 2026-07-31 / 2026/07/31
  let m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // 2026년 07월 29일
  m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // 20260731
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}

function toAmount(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 열 이름이 카드사마다 달라서, 후보 낱말이 들어간 열을 찾아 쓴다 */
function findCol(header: string[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i].replace(/\s/g, "");
    if (candidates.some((c) => h.includes(c))) return i;
  }
  return -1;
}

/**
 * 현대카드 내려받기 파일은 확장자가 .xls 이지만 실제로는 웹페이지(HTML)다.
 * 표를 직접 읽어낸다.
 */
function parseHtmlTable(text: string, source: string): ParsedRow[] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const rows: ParsedRow[] = [];
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const trs = Array.from(table.querySelectorAll("tr"));
    let header: string[] = [];
    let idx = { date: -1, merchant: -1, amount: -1, ref: -1, cancel: -1 };
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim());
      if (cells.length < 3) continue;
      if (idx.date < 0) {
        header = cells;
        idx = {
          date: findCol(header, ["승인일", "이용일", "거래일", "사용일"]),
          merchant: findCol(header, ["가맹점", "이용하신곳", "적요", "내용"]),
          amount: findCol(header, ["승인금액", "이용금액", "금액", "출금"]),
          ref: findCol(header, ["승인번호"]),
          cancel: findCol(header, ["취소"]),
        };
        if (idx.date < 0 || idx.merchant < 0 || idx.amount < 0) idx.date = -1;
        continue;
      }
      const date = toIsoDate(cells[idx.date]);
      const amount = toAmount(cells[idx.amount]);
      const merchant = (cells[idx.merchant] ?? "").trim();
      if (!date || !merchant || !amount) continue;
      // 소계·합계 줄 제외
      if (/소계|합계|총계/.test(merchant)) continue;
      rows.push({
        date,
        merchant,
        amount,
        source,
        refNo: idx.ref >= 0 ? (cells[idx.ref] ?? "").trim() : "",
      });
    }
  }
  return rows;
}

/**
 * 엑셀(.xlsx/.xls) — 시트를 훑어 표 머리글을 찾아 읽는다.
 *
 * 카드와 은행이 형태가 다르다.
 *  - 카드: 승인금액 한 열. 취소는 음수 줄로 따로 붙는다.
 *  - 은행(국민): 출금액·입금액이 각각 다른 열. 출금만 가져와야 한다.
 *  - 은행(토스): 거래 금액 한 열에 부호가 있다. 음수(출금)만 가져와야 한다.
 * 입금을 지출로 넣으면 손익이 통째로 뒤집히므로 여기서 확실히 갈라낸다.
 */
function parseSheet(XLSX: any, buf: ArrayBuffer, source: string): ParsedRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const out: ParsedRow[] = [];
  for (const name of wb.SheetNames) {
    const aoa: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
    let idx = { date: -1, merchant: -1, alt: -1, amount: -1, withdraw: -1, balance: -1, ref: -1 };
    for (const row of aoa) {
      const cells = (row ?? []).map((c) => String(c ?? "").trim());
      if (cells.length < 3) continue;
      if (idx.date < 0) {
        const date = findCol(cells, ["승인일", "이용일", "거래일", "사용일", "거래일시"]);
        const merchant = findCol(cells, ["가맹점", "이용하신곳", "보낸분", "받는분", "거래처", "적요", "내용"]);
        const withdraw = findCol(cells, ["출금액", "출금"]);
        const amount = findCol(cells, ["승인금액", "이용금액", "거래금액", "금액"]);
        if (date >= 0 && merchant >= 0 && (withdraw >= 0 || amount >= 0)) {
          idx = {
            date,
            merchant,
            // 상대방 이름이 비어 있을 때 대신 쓸 열 (은행의 '적요' 등)
            alt: findCol(cells, ["적요", "내용", "거래유형", "구분"]),
            amount,
            withdraw,
            // 잔액 열이 있으면 은행 거래내역이다. 카드 명세서에는 잔액이 없다.
            balance: findCol(cells, ["잔액"]),
            ref: findCol(cells, ["승인번호"]),
          };
        }
        continue;
      }
      const date = toIsoDate(cells[idx.date]);
      let merchant = (cells[idx.merchant] ?? "").trim();
      // 은행 내역은 상대방 이름이 비는 경우가 있다(대출이자 등). 그때는 적요를 이름으로 쓴다.
      if (!merchant && idx.alt >= 0) merchant = (cells[idx.alt] ?? "").trim();
      if (!date || !merchant) continue;
      if (/소계|합계|총계/.test(merchant)) continue;

      const isBank = idx.balance >= 0;
      let amount = 0;
      if (idx.withdraw >= 0) {
        // 출금 열이 따로 있는 은행 파일 — 출금만 쓴다
        amount = toAmount(cells[idx.withdraw]);
        if (amount <= 0) continue;
      } else if (isBank) {
        // 한 열에 부호로 입출금을 나타내는 은행 파일 — 음수(나간 돈)만 쓴다
        const v = toAmount(cells[idx.amount]);
        if (v >= 0) continue;
        amount = Math.abs(v);
      } else {
        // 카드 명세서 — 음수는 취소 줄이므로 그대로 두고 뒤에서 상계한다
        amount = toAmount(cells[idx.amount]);
      }
      if (!amount) continue;
      out.push({ date, merchant, amount, source, refNo: idx.ref >= 0 ? (cells[idx.ref] ?? "").trim() : "" });
    }
  }
  return out;
}

/**
 * 취소 상계 — 카드사는 취소 건을 원래 줄은 그대로 두고 음수 줄을 따로 붙인다.
 * 승인번호+날짜로 묶어 합치면 전체취소는 0원이 되어 사라지고, 부분취소는 남은 금액만 남는다.
 * 이 처리를 빠뜨리면 지출이 크게 부풀려진다.
 */
function netCancellations(rows: ParsedRow[]): { rows: ParsedRow[]; removed: number } {
  const groups = new Map<string, ParsedRow[]>();
  const singles: ParsedRow[] = [];
  for (const r of rows) {
    if (!r.refNo) {
      singles.push(r);
      continue;
    }
    const k = `${r.refNo}|${r.date}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: ParsedRow[] = [...singles.filter((r) => r.amount > 0)];
  let removed = singles.length - out.length;
  for (const list of Array.from(groups.values())) {
    const sum = list.reduce((s, r) => s + r.amount, 0);
    if (Math.round(sum) === 0) {
      removed += list.length;
      continue;
    }
    if (sum < 0) {
      removed += list.length;
      continue;
    }
    out.push({ ...list[0], amount: Math.round(sum) });
    removed += list.length - 1;
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { rows: out, removed };
}

export default function AdminExpenseImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [summary, setSummary] = useState<AnalyzeRes["summary"] | null>(null);
  const [parseNote, setParseNote] = useState("");
  const [skip, setSkip] = useState<Set<number>>(new Set());

  const { data: items } = useQuery<FixedCostItem[]>({ queryKey: ["/api/admin/fixed-cost-items"] });

  // 고정비 항목 + 과거에 실제로 쓰신 항목명. 지출 카테고리는 고정비 목록에만 있는 게 아니라
  // 예전에 쓰던 이름이 남아 있을 수 있는데, 목록에 없으면 화면에서 빈칸처럼 보여 오해를 부른다.
  const categories = useMemo(() => {
    const set = new Set<string>([...(items ?? []).map((i) => i.name), ETC]);
    for (const r of rows) if (r.category) set.add(r.category);
    return Array.from(set);
  }, [items, rows]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const head = new TextDecoder("utf-8").decode(buf.slice(0, 400));
      const source = file.name.replace(/\.[^.]+$/, "").slice(0, 20);

      let parsed: ParsedRow[];
      if (/^\s*<|<html|<table|<script/i.test(head)) {
        // 확장자만 .xls 인 웹페이지 파일 (현대카드 등)
        parsed = parseHtmlTable(new TextDecoder("utf-8").decode(buf), source);
      } else {
        parsed = parseSheet(await loadSheetJs(), buf, source);
      }
      if (parsed.length === 0) throw new Error("표를 찾지 못했습니다. 원본 그대로의 파일인지 확인해 주세요.");

      const { rows: netted, removed } = netCancellations(parsed);
      setParseNote(
        removed > 0
          ? `${parsed.length}줄을 읽어 취소분을 상계하니 ${netted.length}건이 되었습니다. (${removed}줄 정리)`
          : `${netted.length}건을 읽었습니다.`,
      );

      const res = await apiRequest("POST", "/api/admin/expense-import/analyze", { rows: netted });
      const body: AnalyzeRes = await res.json();
      setRows(body.rows);
      setSummary(body.summary);
      setSkip(new Set(body.rows.map((r, i) => (r.duplicate ? i : -1)).filter((i) => i >= 0)));
    } catch (err) {
      toast({ title: "파일을 읽지 못했습니다", description: errMsg(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function patch(i: number, p: Partial<ClassifiedRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function toggleSkip(i: number) {
    setSkip((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  /** 같은 가맹점을 한 번에 같은 분류로 — 애매한 것 정리할 때 손이 훨씬 덜 간다 */
  function applyToSame(i: number) {
    const src = rows[i];
    let n = 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== src.key || r === src) return r;
        n += 1;
        return { ...r, category: src.category, sector: src.sector, personal: src.personal, confidence: "high" };
      }),
    );
    toast({ title: `같은 곳 ${n}건에 함께 적용했습니다.` });
  }

  const toSave = rows.filter((_, i) => !skip.has(i));
  const unresolved = toSave.filter((r) => !r.personal && !r.excluded && !r.category);

  async function save() {
    if (unresolved.length > 0) {
      toast({
        title: "아직 정하지 않은 항목이 있습니다",
        description: `${unresolved.length}건의 분류를 골라주세요.`,
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`${toSave.length}건을 저장합니다. 진행할까요?`)) return;
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/admin/expense-import/commit", {
        rows: toSave.map((r) => ({
          date: r.date,
          merchant: r.merchant,
          amount: r.amount,
          category: r.category,
          sector: r.sector,
          personal: r.personal,
          excluded: r.excluded,
        })),
      });
      const body = await res.json();
      toast({ title: "저장했습니다", description: (body as any).message ?? "" });
      setRows([]);
      setSummary(null);
      setParseNote("");
    } catch (err) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const lowRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.confidence === "low" && !x.r.duplicate);
  const highRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.confidence === "high" && !x.r.duplicate);
  const dupRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.duplicate);

  function RowEditor({ r, i }: { r: ClassifiedRow; i: number }) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3" data-testid={`import-row-${i}`}>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={!skip.has(i)} onChange={() => toggleSkip(i)} className="h-4 w-4 accent-[#6b6a45]" />
          저장
        </label>
        <span className="font-display w-24 shrink-0 text-xs text-muted-foreground">{r.date}</span>
        <span className="min-w-[140px] flex-1 truncate text-sm text-foreground" title={r.merchant}>
          {r.merchant}
        </span>
        <span className="font-display tabular w-24 shrink-0 text-right text-sm font-semibold text-foreground">
          {won(r.amount)}
        </span>

        <select
          value={r.excluded ? "excluded" : r.personal ? "personal" : "expense"}
          onChange={(e) =>
            patch(i, {
              excluded: e.target.value === "excluded",
              personal: e.target.value === "personal",
            })
          }
          className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs"
          data-testid={`kind-${i}`}
        >
          <option value="expense">사업 지출</option>
          <option value="personal">개인</option>
          <option value="excluded">제외</option>
        </select>

        <select
          value={r.category}
          disabled={r.personal || r.excluded}
          onChange={(e) => patch(i, { category: e.target.value })}
          className="h-8 w-36 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
          data-testid={`category-${i}`}
        >
          <option value="">— 고르세요 —</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={r.sector}
          disabled={r.personal || r.excluded}
          onChange={(e) => patch(i, { sector: e.target.value })}
          className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
          data-testid={`sector-${i}`}
        >
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {SECTOR_LABEL[s]}
            </option>
          ))}
        </select>

        <Button size="sm" variant="ghost" onClick={() => applyToSame(i)} title="같은 가맹점에 함께 적용">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Import</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">카드·은행 내역 불러오기</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          카드사나 은행에서 받은 파일을 그대로 올리시면, 과거에 분류해 두신 기록에 비추어 자동으로 항목을 채웁니다.
          처음 보는 곳만 따로 모아 보여드리니 그것만 골라주시면 됩니다. 확인 전에는 저장되지 않습니다.
        </p>

        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
              data-testid="input-file"
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="button-pick-file">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              파일 고르기
            </Button>
            <p className="text-xs text-muted-foreground">
              삼성카드·현대카드 이용내역, 은행 거래내역 엑셀을 받은 그대로 올리시면 됩니다.
            </p>
          </div>
          {parseNote && <p className="mt-3 text-xs text-foreground">{parseNote}</p>}
        </Card>

        {summary && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">저장할 금액</div>
              <div className="font-display tabular mt-1 text-lg font-semibold text-foreground">
                {won(toSave.filter((r) => !r.excluded).reduce((s2, r) => s2 + r.amount, 0))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">자동 분류됨</div>
              <div className="font-display tabular mt-1 text-lg font-semibold text-emerald-700">{summary.high}건</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">확인 필요</div>
              <div className="font-display tabular mt-1 text-lg font-semibold text-amber-700">{summary.low}건</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] text-muted-foreground">이미 있는 건</div>
              <div className="font-display tabular mt-1 text-lg font-semibold text-muted-foreground">
                {summary.duplicate}건
              </div>
            </Card>
          </div>
        )}

        {lowRows.length > 0 && (
          <Card className="mb-5 overflow-hidden border-amber-300">
            <div className="border-b bg-amber-50 p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <HelpCircle className="h-4 w-4" />
                확인이 필요한 {lowRows.length}건
              </h2>
              <p className="mt-0.5 text-[11px] text-amber-900">
                처음 보는 곳입니다. 한 번 골라주시면 다음부터는 자동으로 들어갑니다. 옆의 복사 버튼을 누르면 같은
                가맹점 전체에 같은 분류가 적용됩니다.
              </p>
            </div>
            <div className="divide-y">
              {lowRows.map(({ r, i }) => (
                <RowEditor key={i} r={r} i={i} />
              ))}
            </div>
          </Card>
        )}

        {dupRows.length > 0 && (
          <Card className="mb-5 overflow-hidden">
            <div className="border-b p-5">
              <h2 className="text-sm font-semibold text-foreground">이미 들어와 있는 {dupRows.length}건</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                날짜·금액·가맹점이 같은 지출이 이미 있습니다. 기본으로 저장하지 않게 해두었습니다.
              </p>
            </div>
            <div className="divide-y opacity-60">
              {dupRows.map(({ r, i }) => (
                <RowEditor key={i} r={r} i={i} />
              ))}
            </div>
          </Card>
        )}

        {highRows.length > 0 && (
          <Card className="mb-5 overflow-hidden">
            <div className="border-b p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                자동으로 분류된 {highRows.length}건
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                과거 기록을 따라 채웠습니다. 틀린 게 있으면 여기서 바꾸시면 됩니다.
              </p>
            </div>
            <div className="max-h-[520px] divide-y overflow-y-auto">
              {highRows.map(({ r, i }) => (
                <RowEditor key={i} r={r} i={i} />
              ))}
            </div>
          </Card>
        )}

        {rows.length > 0 && (
          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
            <div className="text-sm text-foreground">
              <span className="font-semibold">{toSave.length}건</span> 저장 예정
              {toSave.some((r) => r.personal) && (
                <Badge variant="secondary" className="ml-2 gap-1 text-[10px]">
                  <Wallet className="h-3 w-3" />
                  개인 {toSave.filter((r) => r.personal).length}건은 가계부로
                </Badge>
              )}
              {toSave.some((r) => r.excluded) && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  비용 아님 {toSave.filter((r) => r.excluded).length}건은 저장 안 함
                </Badge>
              )}
            </div>
            {unresolved.length > 0 && (
              <span className="text-xs text-destructive">아직 {unresolved.length}건의 분류가 비어 있습니다.</span>
            )}
            <Button onClick={save} disabled={saving || toSave.length === 0} className="ml-auto" data-testid="button-save-import">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              저장하기
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
