import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RotateCw } from "lucide-react";

// 조회 실패 표시. '데이터가 없음'과 '불러오지 못함'을 구분해서 보여주기 위한 공통 컴포넌트.
// (실패를 빈 상태로 표시하면 데이터가 지워진 것으로 오해할 수 있음)
export function LoadError({
  onRetry,
  title = "정보를 불러오지 못했습니다.",
  description = "인터넷 연결을 확인한 뒤 다시 시도해 주세요. 저장된 내용이 사라진 것은 아닙니다.",
  compact = false,
}: {
  onRetry?: () => void;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const body = (
    <div className={`flex flex-col items-center gap-3 text-center ${compact ? "py-6" : "py-16"}`}>
      <AlertTriangle className="h-9 w-9 text-amber-500/70" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          다시 시도
        </Button>
      )}
    </div>
  );
  return compact ? body : <Card>{body}</Card>;
}
