import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { won, errMsg } from "@/lib/format";
import { Loader2, CopyX } from "lucide-react";

type DupRow = {
  source: "expense" | "ledger";
  id: number;
  date: string;
  amount: number;
  memo: string;
  category: string;
  createdAt: number;
};
type DupGroup = { key: string; date: string; amount: number; rows: DupRow[] };
type DupResult = { groups: DupGroup[]; summary: { groups: number; extraCount: number; extraAmount: number } };

// 줄 하나를 고르는 키 (지출과 가계부의 id가 겹칠 수 있어 출처를 붙인다)
const rowKey = (r: DupRow) => `${r.source}:${r.id}`;

function stamp(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.toISOString().slice(5, 10).replace("-", ".")} ${d.toISOString().slice(11, 16)}`;
}

export default function AdminExpenseDuplicates() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const { toast } = useToast();

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [loose, setLoose] = useState(false);
  const [withLedger, setWithLedger] = useState(true);
  const [query, setQuery] = useState({ from: today.slice(0, 8) + "01", to: today, loose: false, ledger: true });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isFetching } = useQuery<DupResult>({
    queryKey: ["/api/admin/expense-duplicates", query],
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/admin/expense-duplicates?from=${query.from}&to=${query.to}&mode=${query.loose ? "loose" : "strict"}&ledger=${query.ledger ? 1 : 0}`,
        )
      ).json(),
    enabled: isOwner,
  });

  const groups = data?.groups ?? [];

  // 각 묶음의 첫 건(먼저 저장된 것)만 남기고 나머지를 고른다
  function pickExtras() {
    const s = new Set<string>();
    for (const g of groups) for (const r of g.rows.slice(1)) s.add(rowKey(r));
    setPicked(s);
  }
  function toggle(r: DupRow) {
    setPicked((prev) => {
      const n = new Set(prev);
      const k = rowKey(r);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const pickedRows = useMemo(
    () => groups.flatMap((g) => g.rows).filter((r) => picked.has(rowKey(r))),
    [groups, picked],
  );
  const pickedAmount = pickedRows.reduce((s, r) => s + r.amount, 0);
  // 한 묶음을 통째로 지우면 그 거래가 장부에서 사라진다 — 저장 전에 막는다
  const wipedGroups = groups.filter((g) => g.rows.every((r) => picked.has(rowKey(r))));

  async function removePicked() {
    if (pickedRows.length === 0) return;
    if (wipedGroups.length > 0) {
      toast({
        variant: "destructive",
        title: "한 묶음을 전부 고르셨습니다",
        description: `${wipedGroups[0].date} ${won(wipedGroups[0].amount)} — 최소 한 건은 남겨야 그 거래가 장부에 남습니다.`,
      });
      return;
    }
    if (
      !confirm(
        `${pickedRows.length}건(${won(pickedAmount)})을 지웁니다.\n되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/admin/expense-duplicates/delete", {
        expenseIds: pickedRows.filter((r) => r.source === "expense").map((r) => r.id),
        ledgerIds: pickedRows.filter((r) => r.source === "ledger").map((r) => r.id),
      });
      const body = await res.json();
      toast({ title: body.message ?? "지웠습니다." });
      setPicked(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expense-duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
          소유자만 볼 수 있는 화면입니다.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Duplicates</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">지출 중복 정리</h1>
        <p className="mb-6 break-keep text-sm leading-relaxed text-muted-foreground">
          같은 날짜·같은 금액의 지출을 묶어서 보여줍니다. 같은 명세서를 두 번 올렸거나, 은행 내역과 카드 내역에
          같은 결제가 이중으로 들어온 경우를 찾을 수 있습니다. 지우는 건 직접 고르세요 — 같은 날 같은 금액을 두 번
          결제하는 일도 실제로 있습니다.
        </p>

        <Card className="mb-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-dup-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-dup-to" />
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox checked={loose} onCheckedChange={(v) => setLoose(!!v)} data-testid="check-dup-loose" />
              <span className="text-sm leading-snug text-foreground break-keep">
                내용이 달라도 묶기
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  날짜와 금액만 같으면 한 묶음으로 봅니다. 은행 내역과 카드 내역처럼 같은 결제인데 이름이 다르게
                  적힌 경우를 찾을 때 켜세요. 대신 우연히 금액이 같은 다른 지출도 함께 잡힙니다.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox checked={withLedger} onCheckedChange={(v) => setWithLedger(!!v)} data-testid="check-dup-ledger" />
              <span className="text-sm leading-snug text-foreground break-keep">
                가계부(개인 지출)도 함께 보기
              </span>
            </label>
          </div>
          <Button
            className="mt-4"
            onClick={() => {
              setPicked(new Set());
              setQuery({ from, to, loose, ledger: withLedger });
            }}
            data-testid="button-dup-search"
          >
            찾기
          </Button>
        </Card>

        {isLoading || isFetching ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-16 text-center">
            <CopyX className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">이 기간에는 겹치는 지출이 없습니다.</p>
          </Card>
        ) : (
          <>
            <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm text-foreground">
                겹치는 묶음 <strong>{data!.summary.groups}</strong>개 · 지울 수 있는 건{" "}
                <strong>{data!.summary.extraCount}</strong>건 ({won(data!.summary.extraAmount)})
              </div>
              <Button variant="outline" size="sm" onClick={pickExtras} data-testid="button-dup-pick-extras">
                묶음마다 첫 건만 남기고 모두 고르기
              </Button>
            </Card>

            <div className="space-y-3">
              {groups.map((g) => (
                <Card key={g.key} className="p-4" data-testid={`card-dup-${g.key}`}>
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                    <span className="font-display text-sm font-semibold tabular text-foreground">
                      {g.date.replace(/-/g, ".")} · {won(g.amount)}
                    </span>
                    <span className="text-xs text-muted-foreground">{g.rows.length}건</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.rows.map((r, i) => (
                      <label
                        key={rowKey(r)}
                        className="flex cursor-pointer items-start gap-2.5 rounded-sm px-1 py-1 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={picked.has(rowKey(r))}
                          onCheckedChange={() => toggle(r)}
                          data-testid={`check-dup-row-${rowKey(r)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-foreground break-keep">
                            {r.memo || "(내용 없음)"}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {r.source === "ledger" ? "가계부" : r.category || "기타"}
                            {r.createdAt ? ` · ${stamp(r.createdAt)} 저장` : ""}
                            {i === 0 ? " · 먼저 저장된 건" : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Card>
              ))}
            </div>

            <div className="sticky bottom-0 mt-5 border-t border-border bg-background/95 py-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-foreground">
                  고른 것 <strong className="tabular">{pickedRows.length}</strong>건 ·{" "}
                  <strong className="tabular">{won(pickedAmount)}</strong>
                </div>
                <Button
                  variant="destructive"
                  disabled={busy || pickedRows.length === 0}
                  onClick={removePicked}
                  data-testid="button-dup-delete"
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  고른 항목 지우기
                </Button>
              </div>
              {wipedGroups.length > 0 && (
                <p className="mt-2 text-xs text-destructive break-keep">
                  {wipedGroups.length}개 묶음을 통째로 고르셨습니다. 묶음마다 최소 한 건은 남겨야 그 거래가 장부에
                  남습니다.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
