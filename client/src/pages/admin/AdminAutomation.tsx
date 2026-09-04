// 자동화 — 정해진 시각에 스스로 도는 작업들을 켜고 끄고, 결과를 확인하는 화면.
// 자동화의 가장 흔한 실패는 "조용히 멈추는 것"이라, 마지막 실행 결과를 늘 앞에 보여준다.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Play, Download, Trash2, Loader2, CheckCircle2, XCircle, Clock, HardDrive, AlertTriangle } from "lucide-react";

type Job = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  hour: number;
  minute: number;
  config: Record<string, any>;
  lastRunAt: number;
  lastStatus: string;
  lastMessage: string;
  nextRunAt: number;
};

type Run = {
  id: number;
  jobKey: string;
  startedAt: number;
  finishedAt: number;
  status: string;
  trigger: string;
  message: string;
};

type BackupFile = { name: string; size: number; createdAt: number };

type Res = {
  jobs: Job[];
  runs: Run[];
  backups: BackupFile[];
  backupDir: string;
  backupTotalSize: number;
  kakaoReady: boolean;
  serverTimeKst: string;
};

const API = "/api/admin/automation";

function fmtWhen(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export default function AdminAutomation() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Res>({ queryKey: [API], refetchInterval: 30000 });
  const [running, setRunning] = useState("");

  const saveMut = useMutation({
    mutationFn: async ({ key, patch }: { key: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `${API}/${key}`, patch);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [API] }),
    onError: (e) => toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" }),
  });

  async function runNow(key: string) {
    setRunning(key);
    try {
      const res = await apiRequest("POST", `${API}/${key}/run`, {});
      const body = await res.json().catch(() => ({}));
      toast({
        title: res.ok ? "실행 완료" : "실행 실패",
        description: (body as any).message ?? "",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (e) {
      toast({ title: "실행 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setRunning("");
      qc.invalidateQueries({ queryKey: [API] });
    }
  }

  async function removeBackup(name: string) {
    if (!confirm(`${name} 을 지울까요? 되돌릴 수 없습니다.`)) return;
    try {
      await apiRequest("DELETE", `${API}/backups/${name}`);
      toast({ title: "삭제했습니다." });
      qc.invalidateQueries({ queryKey: [API] });
    } catch (e) {
      toast({ title: "삭제 실패", description: errMsg(e), variant: "destructive" });
    }
  }

  async function downloadBackup(name: string) {
    try {
      const res = await apiRequest("GET", `${API}/backups/${name}`);
      if (!res.ok) throw new Error("내려받기 실패");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast({ title: "내려받기 실패", description: errMsg(e), variant: "destructive" });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Automation</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">자동화</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          정해진 시각에 서버가 스스로 하는 일들입니다. 켜 두면 사람이 기억하지 않아도 되고, 결과는 아래에 그대로
          남습니다. 실패하면 대표님 카카오톡으로 알려드립니다.
        </p>

        {!isLoading && data && !data.kakaoReady && (
          <Card className="mb-5 border-amber-300 bg-amber-50 p-4" data-testid="banner-kakao-off">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-xs leading-relaxed text-amber-900">
                카카오 알림이 연동되어 있지 않아, 자동화가 실패해도 알림이 가지 않습니다. 설정·연동 → 카카오 알림에서
                연결해 주세요. 연결 전까지는 이 화면의 실행 기록으로만 확인할 수 있습니다.
              </p>
            </div>
          </Card>
        )}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            {(data?.jobs ?? []).map((job) => (
              <Card key={job.key} className="p-5" data-testid={`job-${job.key}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{job.name}</h2>
                      {job.enabled ? (
                        <Badge className="text-[10px]">켜짐</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          꺼짐
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{job.description}</p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={job.enabled}
                      onChange={(e) => saveMut.mutate({ key: job.key, patch: { enabled: e.target.checked } })}
                      className="h-4 w-4 accent-[#6b6a45]"
                      data-testid={`toggle-${job.key}`}
                    />
                    사용
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-border pt-4">
                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">실행 시각 (한국 시간)</div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        defaultValue={job.hour}
                        onBlur={(e) => saveMut.mutate({ key: job.key, patch: { hour: Number(e.target.value) } })}
                        className="w-16"
                        data-testid={`hour-${job.key}`}
                      />
                      <span className="text-sm text-muted-foreground">시</span>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        defaultValue={job.minute}
                        onBlur={(e) => saveMut.mutate({ key: job.key, patch: { minute: Number(e.target.value) } })}
                        className="w-16"
                        data-testid={`minute-${job.key}`}
                      />
                      <span className="text-sm text-muted-foreground">분</span>
                    </div>
                  </div>

                  {job.key === "backup" && (
                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">보관 개수</div>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        defaultValue={Number(job.config.keep) || 14}
                        onBlur={(e) =>
                          saveMut.mutate({ key: job.key, patch: { config: { keep: Number(e.target.value) } } })
                        }
                        className="w-20"
                        data-testid="keep-backup"
                      />
                    </div>
                  )}

                  {job.key === "ecount_check" && (
                    <div>
                      <div className="mb-1 text-[11px] text-muted-foreground">점검 범위 (최근 N일)</div>
                      <Input
                        type="number"
                        min={7}
                        max={120}
                        defaultValue={Number(job.config.lookbackDays) || 45}
                        onBlur={(e) =>
                          saveMut.mutate({ key: job.key, patch: { config: { lookbackDays: Number(e.target.value) } } })
                        }
                        className="w-20"
                        data-testid="lookback-ecount"
                      />
                    </div>
                  )}

                  {job.key === "inactive_customers" && (
                    <>
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">실행 요일</div>
                        <select
                          value={String(job.config.weekday ?? "1")}
                          onChange={(e) => saveMut.mutate({ key: job.key, patch: { config: { weekday: e.target.value } } })}
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          data-testid="weekday-inactive"
                        >
                          <option value="1">월요일</option>
                          <option value="2">화요일</option>
                          <option value="3">수요일</option>
                          <option value="4">목요일</option>
                          <option value="5">금요일</option>
                          <option value="6">토요일</option>
                          <option value="0">일요일</option>
                          <option value="*">매일</option>
                        </select>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">미주문 기준 (N일)</div>
                        <Input
                          type="number"
                          min={7}
                          max={90}
                          defaultValue={Number(job.config.days) || 14}
                          onBlur={(e) =>
                            saveMut.mutate({ key: job.key, patch: { config: { days: Number(e.target.value) } } })
                          }
                          className="w-20"
                          data-testid="days-inactive"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">카카오 알림</div>
                    <select
                      value={String(job.config.notify ?? "fail")}
                      onChange={(e) => saveMut.mutate({ key: job.key, patch: { config: { notify: e.target.value } } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      data-testid={`notify-${job.key}`}
                    >
                      <option value="fail">실패했을 때만</option>
                      <option value="always">할 때마다</option>
                      <option value="off">보내지 않음</option>
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => runNow(job.key)}
                    disabled={running === job.key}
                    className="ml-auto"
                    data-testid={`run-${job.key}`}
                  >
                    {running === job.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    지금 실행
                  </Button>
                </div>

                <div className="mt-4 rounded-md bg-muted/40 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      다음 실행 {job.enabled ? fmtWhen(job.nextRunAt) : "—"}
                    </span>
                    <span className="text-muted-foreground">마지막 실행 {fmtWhen(job.lastRunAt)}</span>
                  </div>
                  {job.lastStatus && (
                    <div className="mt-1.5 flex items-start gap-1.5">
                      {job.lastStatus === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span className={job.lastStatus === "ok" ? "text-foreground" : "text-destructive"}>
                        {job.lastMessage || (job.lastStatus === "ok" ? "완료" : "실패")}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            {/* 백업 파일 */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <HardDrive className="h-4 w-4" />
                  보관 중인 백업
                </h2>
                <span className="text-xs text-muted-foreground">
                  {(data?.backups ?? []).length}개 · {fmtSize(data?.backupTotalSize ?? 0)}
                </span>
              </div>
              {(data?.backups ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  아직 백업이 없습니다. 위에서 “지금 실행”을 눌러 하나 만들어 보세요.
                </p>
              ) : (
                <div className="divide-y">
                  {(data?.backups ?? []).map((f) => (
                    <div key={f.name} className="flex items-center gap-3 px-5 py-3" data-testid={`backup-${f.name}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-display truncate text-sm text-foreground">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtWhen(f.createdAt)} · {fmtSize(f.size)}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => downloadBackup(f.name)} aria-label="내려받기">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => removeBackup(f.name)} aria-label="삭제">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                백업은 서버 저장 공간에 보관됩니다. 서버 자체에 문제가 생기는 경우까지 대비하려면, 가끔 한 번씩
                내려받아 다른 곳에도 두시는 편이 안전합니다.
              </p>
            </Card>

            {/* 실행 기록 */}
            <Card className="overflow-hidden">
              <div className="border-b p-5">
                <h2 className="text-sm font-semibold text-foreground">최근 실행 기록</h2>
              </div>
              {(data?.runs ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">아직 실행된 자동화가 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {(data?.runs ?? []).map((r) => (
                    <div key={r.id} className="flex items-start gap-2.5 px-5 py-2.5 text-xs">
                      {r.status === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : r.status === "fail" ? (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      ) : (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      )}
                      <span className="font-display w-32 shrink-0 text-muted-foreground">{fmtWhen(r.startedAt)}</span>
                      <span className="w-14 shrink-0 text-muted-foreground">
                        {r.trigger === "manual" ? "수동" : "자동"}
                      </span>
                      <span className={`min-w-0 flex-1 ${r.status === "fail" ? "text-destructive" : "text-foreground"}`}>
                        {r.message || (r.status === "running" ? "실행 중…" : "")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <p className="text-[11px] text-muted-foreground">
              서버 기준 현재 시각 {data?.serverTimeKst ?? "—"} (한국 시간). 배포나 재시작으로 예정 시각을 놓쳤더라도,
              서버가 다시 뜨면 그날 안에 한 번은 실행합니다.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
