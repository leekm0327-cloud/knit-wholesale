import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X } from "lucide-react";

export type DetailFields = {
  tagline: string;
  blendRatio: string;
  recommendedUse: string;
  country: string;
  region: string;
  farm: string;
  variety: string;
  process: string;
  altitude: string;
  flavorNotes: string;
  roastLevel: string;
  description: string;
};

export const emptyDetailFields: DetailFields = {
  tagline: "",
  blendRatio: "",
  recommendedUse: "",
  country: "",
  region: "",
  farm: "",
  variety: "",
  process: "",
  altitude: "",
  flavorNotes: "",
  roastLevel: "",
  description: "",
};

type Props = {
  template: "blend" | "single";
  setTemplate: (t: "blend" | "single") => void;
  detail: DetailFields;
  setDetail: (key: keyof DetailFields, value: string) => void;
  images: string[];
  setImages: (v: string[]) => void;
};

export function ProductDetailEditor({ template, setTemplate, detail, setDetail, images, setImages }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const list = Array.from(files);
    if (images.length + list.length > 10) {
      toast({ title: "이미지는 최대 10장", description: "10장을 초과해 첨부할 수 없습니다.", variant: "destructive" });
      return;
    }
    const next: string[] = [...images];
    let remaining = list.length;
    if (remaining === 0) return;
    list.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "이미지 크기 초과", description: `${file.name}은 5MB를 초과합니다.`, variant: "destructive" });
        remaining -= 1;
        if (remaining === 0) setImages(next);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") next.push(reader.result);
        remaining -= 1;
        if (remaining === 0) setImages(next);
      };
      reader.onerror = () => {
        remaining -= 1;
        if (remaining === 0) setImages(next);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
          상세페이지 양식
        </h3>
        <div className="w-32">
          <Select value={template} onValueChange={(v) => setTemplate(v as "blend" | "single")}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-detail-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blend">블렌드 양식</SelectItem>
              <SelectItem value="single">싱글 오리진 양식</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">한 줄 소개 (tagline)</Label>
        <Input
          value={detail.tagline}
          onChange={(e) => setDetail("tagline", e.target.value)}
          placeholder="예: 매일 마셔도 질리지 않는 균형감"
          data-testid="input-detail-tagline"
        />
      </div>

      {template === "blend" ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">블렌드 구성</Label>
            <Input
              value={detail.blendRatio}
              onChange={(e) => setDetail("blendRatio", e.target.value)}
              placeholder="예: 브라질 50% / 콜롬비아 30% / 에티오피아 20%"
              data-testid="input-detail-blend-ratio"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">추천 사용처</Label>
            <Input
              value={detail.recommendedUse}
              onChange={(e) => setDetail("recommendedUse", e.target.value)}
              placeholder="예: 에스프레소, 라떼, 밀크 베이스"
              data-testid="input-detail-recommended-use"
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">국가</Label>
              <Input
                value={detail.country}
                onChange={(e) => setDetail("country", e.target.value)}
                placeholder="예: 에티오피아"
                data-testid="input-detail-country"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">지역</Label>
              <Input
                value={detail.region}
                onChange={(e) => setDetail("region", e.target.value)}
                placeholder="예: 예가체프"
                data-testid="input-detail-region"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">농장</Label>
              <Input
                value={detail.farm}
                onChange={(e) => setDetail("farm", e.target.value)}
                placeholder="예: 코케 워시드 스테이션"
                data-testid="input-detail-farm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">품종</Label>
              <Input
                value={detail.variety}
                onChange={(e) => setDetail("variety", e.target.value)}
                placeholder="예: Heirloom"
                data-testid="input-detail-variety"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">가공 방식</Label>
              <Input
                value={detail.process}
                onChange={(e) => setDetail("process", e.target.value)}
                placeholder="예: 워시드 / 내추럴"
                data-testid="input-detail-process"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">고도</Label>
              <Input
                value={detail.altitude}
                onChange={(e) => setDetail("altitude", e.target.value)}
                placeholder="예: 1,800 ~ 2,100m"
                data-testid="input-detail-altitude"
              />
            </div>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">향미 노트</Label>
        <Input
          value={detail.flavorNotes}
          onChange={(e) => setDetail("flavorNotes", e.target.value)}
          placeholder="예: 블루베리, 자스민, 다크 초콜릿"
          data-testid="input-detail-flavor-notes"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">로스팅 레벨</Label>
        <Input
          value={detail.roastLevel}
          onChange={(e) => setDetail("roastLevel", e.target.value)}
          placeholder="예: 미디엄 라이트"
          data-testid="input-detail-roast-level"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">상세 설명</Label>
        <Textarea
          value={detail.description}
          onChange={(e) => setDetail("description", e.target.value)}
          placeholder="원두에 대한 자세한 설명을 자유롭게 작성하세요"
          rows={4}
          data-testid="textarea-detail-description"
        />
      </div>

      {/* 이미지 업로더 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">상품 사진</Label>
          <span className="text-[11px] text-muted-foreground">{images.length} / 10장 (각 5MB 이하)</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          data-testid="button-add-product-image"
        >
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
          사진 추가
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {images.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden border border-border">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                  aria-label="이미지 제거"
                >
                  <X className="h-3 w-3" />
                </button>
                {i === 0 && (
                  <span className="absolute left-1 top-1 border border-foreground bg-background px-1 py-0.5 font-ui text-[8px] font-bold uppercase tracking-[0.1em] text-foreground">
                    대표
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          첫 번째 사진이 상세페이지 대표 이미지가 됩니다. 드래그로 순서를 바꿀 수는 없으니 추가 순서대로 정렬됩니다.
        </p>
      </div>
    </div>
  );
}
