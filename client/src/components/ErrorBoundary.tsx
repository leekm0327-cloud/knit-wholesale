import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw } from "lucide-react";

// 화면 렌더 중 예외가 나도 흰 화면이 되지 않도록 감싸는 안전망.
// (예: 저장된 데이터가 손상되어 JSON.parse가 실패하는 경우)
type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: String(error?.message ?? error ?? "") };
  }

  componentDidCatch(error: any) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500/70" />
        <div>
          <p className="text-base font-semibold text-foreground">화면을 표시하는 중 문제가 발생했습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            새로고침하면 대부분 해결됩니다. 저장된 데이터가 사라진 것은 아닙니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()} data-testid="button-reload">
            <RotateCw className="mr-1.5 h-4 w-4" />
            새로고침
          </Button>
          <Button variant="outline" onClick={() => { window.location.hash = "#/catalog"; window.location.reload(); }}>
            처음 화면으로
          </Button>
        </div>
        {this.state.message && (
          <p className="max-w-md break-words text-[11px] text-muted-foreground/70">{this.state.message}</p>
        )}
      </div>
    );
  }
}
