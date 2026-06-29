import { useState, useRef } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Download, Upload, AlertTriangle, Loader2 } from "lucide-react";

export default function AdminBackup() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await apiRequest("GET", "/api/admin/backup/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).message ?? "다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      // 파일명은 서버 Content-Disposition에서 가져오거나 직접 생성
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `knit-backup-${new Date().toISOString().slice(0, 10)}.db`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "백업 다운로드 완료", description: filename });
    } catch (e) {
      toast({ title: "다운로드 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingFile(file);
    setConfirmOpen(true);
  }

  async function handleRestore() {
    if (!pendingFile) return;
    setConfirmOpen(false);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/admin/backup/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).message ?? "복원 실패");
      }
      toast({
        title: "복원 완료",
        description: "데이터베이스가 복원되었습니다. 페이지를 새로고침합니다.",
      });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({ title: "복원 실패", description: errMsg(e), variant: "destructive" });
    } finally {
      setUploading(false);
      setPendingFile(null);
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 border-b border-border pb-5">
          <p className="eyebrow mb-1">Database management</p>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            백업 / 복원
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            데이터베이스를 수동으로 백업하거나 이전 백업 파일로 복원할 수 있습니다.
            Owner 전용 기능입니다.
          </p>
        </div>

        {/* 백업 다운로드 */}
        <div className="mb-6 rounded-none border border-border p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">데이터베이스 백업</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            현재 데이터베이스 전체를 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.db</code> 파일로 다운로드합니다.
          </p>
          <Button
            onClick={handleDownload}
            disabled={downloading}
            data-testid="button-backup-download"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {downloading ? "다운로드 중…" : "백업 다운로드"}
          </Button>
        </div>

        {/* 백업 복원 */}
        <div className="rounded-none border border-destructive/40 bg-destructive/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">데이터베이스 복원 (위험)</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            백업 파일(<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.db</code>)을 선택하면
            <strong className="text-foreground"> 현재 데이터 전체가 덮어쓰기</strong>됩니다.
            복원 전 반드시 현재 데이터를 백업해 두십시오.
            이 작업은 되돌릴 수 없습니다.
          </p>
          <Button
            variant="destructive"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="button-backup-restore"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "복원 중…" : "백업 파일 선택 후 복원"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".db"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* 확인 다이얼로그 */}
        <Dialog open={confirmOpen} onOpenChange={(v) => { if (!v) { setConfirmOpen(false); setPendingFile(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                복원 확인
              </DialogTitle>
              <DialogDescription>
                <span className="font-semibold text-foreground">{pendingFile?.name}</span> 파일로
                데이터베이스를 복원합니다.{" "}
                <strong>현재 데이터 전부가 덮어쓰여 복구할 수 없습니다.</strong>
                정말로 복원하시겠습니까?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setConfirmOpen(false); setPendingFile(null); }}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleRestore}
                data-testid="button-confirm-restore"
              >
                복원 실행
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
