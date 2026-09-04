import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { SupplyOrder, SupplyVendor } from "@shared/schema";
import { Loader2, Plus, Trash2, X, RotateCcw, Pencil } from "lucide-react";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 2026-08-10 → 8.10 (월) */
function shortDay(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(iso + "T00:00:00Z");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} (${dow})`;
}

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 숫자만 남기고 세 자리마다 콤마 */
function commify(v: string): string {
  const n = v.replace(/[^0-9]/g, "");
  return n ? Number(n).toLocaleString("ko-KR") : "";
}

export default function StaffSupply() {
  const { toast } = useToast();
  const { data: me } = useStaff();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState("");
  const [vendorEtc, setVendorEtc] = useState(false);
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: vendors } = useQuery<SupplyVendor[]>({ queryKey: ["/api/staff/supply-vendors"] });
  const { data: orders, isLoading } = useQuery<SupplyOrder[]>({ queryKey: ["/api/staff/supply-orders"] });

  const list = orders ?? [];
  const monthTotal = list.reduce((s, r) => s + r.amount, 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/staff/supply-orders"] });

  function reset() {
    setOpen(false);
    setEditId(null);
    setVendorEtc(false);
    setDate(today());
    setVendor("");
    setBody("");
    setAmount("");
  }

  /** 같은 구입처의 직전 기록을 그대로 가져온다 */
  async function loadLast(v: string) {
    try {
      const res = await apiRequest("GET", `/api/staff/supply-orders/last?vendor=${encodeURIComponent(v)}`);
      const last: SupplyOrder | null = await res.json();
      if (!last) {
        toast({ title: "지난 기록이 없습니다." });
        return;
      }
      setBody(last.body);
      setAmount(last.amount ? won(last.amount) : "");
      toast({ title: `${shortDay(last.orderDate)} 기록을 불러왔습니다.` });
    } catch (err) {
      toast({ variant: "destructive", title: "불러오기 실패", description: errMsg(err) });
    }
  }

  async function save() {
    if (!body.trim()) {
      toast({ variant: "destructive", title: "내용을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        orderDate: date,
        vendor: vendor.trim(),
        body: body.trim(),
        amount: Number(amount.replace(/[^0-9]/g, "")) || 0,
      };
      if (editId) await apiRequest("PATCH", `/api/staff/supply-orders/${editId}`, payload);
      else await apiRequest("POST", "/api/staff/supply-orders", payload);
      toast({ title: editId ? "수정되었습니다." : "기록되었습니다." });
      reset();
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: SupplyOrder) {
    setEditId(r.id);
    setOpen(true);
    setDate(r.orderDate);
    setVendor(r.vendor);
    setVendorEtc(!!r.vendor && !(vendors ?? []).some((v) => v.name === r.vendor));
    setBody(r.body);
    setAmount(r.amount ? won(r.amount) : "");
  }

  async function remove(r: SupplyOrder) {
    if (!confirm("이 기록을 지울까요?")) return;
    try {
      await apiRequest("DELETE", `/api/staff/supply-orders/${r.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <StaffLayout title="발주 기록" subtitle="구매">
      {!open ? (
        <button className="s-pill wide" onClick={() => setOpen(true)} data-testid="button-open-supply-form">
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          발주 기록하기
        </button>
      ) : (
        <>
          <div className="s-sect flex items-center justify-between" style={{ margin: "2px 4px 9px" }}>
            <span>{editId ? "기록 고치기" : "새 기록"}</span>
            <button className="s-icon" onClick={reset} aria-label="닫기">
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="s-card">
            <label className="s-label">날짜</label>
            <input
              className="s-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-supply-date"
            />

            <div className="mt-3">
              <label className="s-label">구입처</label>
              <div className="flex flex-wrap gap-1.5">
                {(vendors ?? []).map((v) => (
                  <button
                    key={v.id}
                    className={`s-chip ${!vendorEtc && vendor === v.name ? "on" : ""}`}
                    onClick={() => {
                      setVendorEtc(false);
                      setVendor(v.name);
                    }}
                    data-testid={`vendor-${v.name}`}
                  >
                    {v.name}
                  </button>
                ))}
                <button
                  className={`s-chip ${vendorEtc ? "on" : ""}`}
                  onClick={() => {
                    setVendorEtc(true);
                    setVendor("");
                  }}
                >
                  기타
                </button>
              </div>
              {vendorEtc && (
                <input
                  className="s-input mt-2"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="구입처를 적어주세요"
                  data-testid="input-vendor-etc"
                />
              )}
              {!vendorEtc && vendor && (
                <button
                  className="s-pill line wide mt-2.5"
                  onClick={() => loadLast(vendor)}
                  data-testid="button-load-last"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
                  {vendor} 지난 기록 불러오기
                </button>
              )}
            </div>
          </div>

          <div className="s-card">
            <label className="s-label">내용</label>
            <textarea
              className="s-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={"품목을 편하게 적어주세요.\n- 매일우유 1box\n- 생크림 5개\n- 휘핑크림 1개"}
              data-testid="input-supply-body"
            />
            <div className="mt-3">
              <label className="s-label">금액 (모르면 비워두세요)</label>
              <div className="relative">
                <input
                  className="s-input"
                  style={{ paddingRight: 34 }}
                  value={amount}
                  onChange={(e) => setAmount(commify(e.target.value))}
                  inputMode="numeric"
                  placeholder="43,190"
                  data-testid="input-supply-amount"
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px]"
                  style={{ color: "var(--s-muted)" }}
                >
                  원
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
            <button className="s-pill" onClick={save} disabled={busy} data-testid="button-save-supply">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editId ? "수정" : "저장"}
            </button>
            <button className="s-pill line" style={{ paddingLeft: 22, paddingRight: 22 }} onClick={reset}>
              취소
            </button>
          </div>
        </>
      )}

      {/* 이번 달 합계 */}
      <div className="s-sect flex items-baseline justify-between">
        <span>이번 달</span>
        <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
          {list.length}건
        </span>
      </div>
      {list.length > 0 && (
        <div className="s-card flex items-center justify-between">
          <span className="text-[13px]" style={{ color: "var(--s-muted)" }}>
            금액 합계
          </span>
          <span className="text-[19px] font-semibold tracking-tight">{won(monthTotal)}원</span>
        </div>
      )}

      {isLoading ? (
        <div className="mt-2.5 space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="s-card mt-2.5">
          <div className="s-empty">
            아직 기록이 없습니다.
            <br />
            발주하신 뒤 여기에 남겨주세요.
          </div>
        </div>
      ) : (
        <div className="mt-2.5">
          {list.map((r) => (
            <div key={r.id} className="s-card" data-testid={`row-supply-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.vendor && (
                      <span
                        className="rounded-full px-2 py-[3px] text-[10.5px] font-medium"
                        style={{ background: "var(--s-accent-soft)", color: "var(--s-accent)" }}
                      >
                        {r.vendor}
                      </span>
                    )}
                    <span className="text-[12.5px] font-semibold">{shortDay(r.orderDate)}</span>
                  </div>
                  <div className="s-k mt-0.5">{r.staffName}</div>
                </div>
                {me?.id === r.staffId && (
                  <div className="flex shrink-0 gap-1.5">
                    <button className="s-icon" onClick={() => startEdit(r)} aria-label="수정">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                    <button className="s-icon" onClick={() => remove(r)} aria-label="삭제">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.body}</p>

              {r.amount > 0 && (
                <div className="mt-2.5 flex items-baseline justify-end gap-1">
                  <span className="text-[17px] font-semibold tracking-tight">{won(r.amount)}</span>
                  <span className="text-[11.5px]" style={{ color: "var(--s-muted)" }}>
                    원
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 px-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
        주문과 결제는 지금처럼 하시고, 여기엔 기록만 남기시면 됩니다.
        <br />
        금액을 모르면 비워두셔도 됩니다.
      </p>
    </StaffLayout>
  );
}
