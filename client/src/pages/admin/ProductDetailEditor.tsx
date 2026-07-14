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
  blendRatio: string; // (레거시) 자유 입력 블렌드 구성 — 하위호환 표시용
  blendComponents: string; // 블렌드 구성 항목 JSON: [{ name, ratio }] (최대 5개)
  recommendedUse: string;
  country: string;
  region: string;
  farm: string;
  farmer: string;
  variety: string;
  process: string;
  altitude: string;
  flavorNotes: string;
  roastLevel: string;
  description: string;
  // B-1: 원두 상세정보 강화
  tastingNotes: string;
  acidity: string;
  body: string;
  brewMethods: string;
  originProcess: string;
  // 권장 레시피 — 에스프레소/필터 중 택1
  recipeType: string; // "" | "espresso" | "filter"
  espBasket: string;
  espTemp: string;
  espDose: string;
  espYield: string;
  espTime: string;
  // 권장 레시피 — 필터 (모두 선택 입력)
  filDripper: string;
  filPaper: string;
  filDose: string;
  filGrind: string;
  filWater: string;
  filTemp: string;
  filTime: string;
};

export const emptyDetailFields: DetailFields = {
  tagline: "",
  blendRatio: "",
  blendComponents: "",
  recommendedUse: "",
  country: "",
  region: "",
  farm: "",
  farmer: "",
  variety: "",
  process: "",
  altitude: "",
  flavorNotes: "",
  roastLevel: "",
  description: "",
  tastingNotes: "",
  acidity: "",
  body: "",
  brewMethods: "",
  originProcess: "",
  recipeType: "",
  espBasket: "",
  espTemp: "",
  espDose: "",
  espYield: "",
  espTime: "",
  filDripper: "",
  filPaper: "",
  filDose: "",
  filGrind: "",
  filWater: "",
  filTemp: "",
  filTime: "",
};

// 산미/바디 1~5 선택 옵션
export const RATING_OPTIONS = ["1", "2", "3", "4", "5"] as const;

type Props = {
  template: "blend" | "single";
  setTemplate: (t: "blend" | "single") => void;
  detail: DetailFields;
  setDetail: (key: keyof DetailFields, value: string) => void;
  images: string[];
  setImages: (v: string[]) => void;
};

// 블렌드 구성 입력기 — 이름 + 비율(%) 최대 5줄. value/onChange 는 JSON 문자열([{name,ratio}]).
function BlendComposition({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let arr: { name: string; ratio: string }[] = [];
  try {
    const p = JSON.parse(value || "[]");
    if (Array.isArray(p)) arr = p.map((x) => ({ name: String(x?.name ?? ""), ratio: String(x?.ratio ?? "") }));
  } catch {}
  const rows = arr.length > 0 ? arr : [{ name: "", ratio: "" }];
  const commit = (next: { name: string; ratio: string }[]) => onChange(JSON.stringify(next));
  const update = (i: number, key: "name" | "ratio", v: string) =>
    commit(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  const add = () => { if (rows.length < 5) commit([...rows, { name: "", ratio: "" }]); };
  const remove = (i: number) => { const next = rows.filter((_, idx) => idx !== i); commit(next); };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        블렌드 구성 <span className="font-normal text-muted-foreground">(원두 이름 + 비율, 최대 5개)</span>
      </Label>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={r.name}
              onChange={(e) => update(i, "name", e.target.value)}
              placeholder="예: Brazil Cerrado Fin Cup Natural"
              data-testid={`input-blend-name-${i}`}
            />
            <div className="flex w-24 shrink-0 items-center gap-1">
              <Input
                value={r.ratio}
                onChange={(e) => update(i, "ratio", e.target.value)}
                placeholder="40"
                data-testid={`input-blend-ratio-${i}`}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="구성 삭제"
              data-testid={`button-remove-blend-${i}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {rows.length < 5 && (
        <Button type="button" variant="outline" size="sm" onClick={add} data-testid="button-add-blend-component">
          + 구성 추가
        </Button>
      )}
    </div>
  );
}

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
        <BlendComposition value={detail.blendComponents} onChange={(v) => setDetail("blendComponents", v)} />
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
              <Label className="text-xs">농부</Label>
              <Input
                value={detail.farmer}
                onChange={(e) => setDetail("farmer", e.target.value)}
                placeholder="예: Thiago Family"
                data-testid="input-detail-farmer"
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
        <Label className="text-xs">원산지 · 가공</Label>
        <Input
          value={detail.originProcess}
          onChange={(e) => setDetail("originProcess", e.target.value)}
          placeholder="예: 콜롬비아 우일라 / 워시드"
          data-testid="input-detail-origin-process"
        />
      </div>

      {/* 권장 레시피 — 에스프레소 / 필터 중 택1 (없음이면 표시 안 함) */}
      <div className="space-y-3 rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">권장 레시피</Label>
          <div className="w-32">
            <Select value={detail.recipeType || "none"} onValueChange={(v) => setDetail("recipeType", v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs" data-testid="select-recipe-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">없음</SelectItem>
                <SelectItem value="espresso">에스프레소</SelectItem>
                <SelectItem value="filter">필터</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {detail.recipeType === "espresso" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">포터필터 바스켓</Label>
              <Input value={detail.espBasket} onChange={(e) => setDetail("espBasket", e.target.value)} placeholder="예: VST 18g" data-testid="input-esp-basket" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Temperature</Label>
              <Input value={detail.espTemp} onChange={(e) => setDetail("espTemp", e.target.value)} placeholder="예: 93℃" data-testid="input-esp-temp" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Dose</Label>
              <Input value={detail.espDose} onChange={(e) => setDetail("espDose", e.target.value)} placeholder="예: 18g" data-testid="input-esp-dose" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Yield</Label>
              <Input value={detail.espYield} onChange={(e) => setDetail("espYield", e.target.value)} placeholder="예: 36g" data-testid="input-esp-yield" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Time</Label>
              <Input value={detail.espTime} onChange={(e) => setDetail("espTime", e.target.value)} placeholder="예: 28초" data-testid="input-esp-time" />
            </div>
          </div>
        )}

        {detail.recipeType === "filter" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Dripper</Label>
              <Input value={detail.filDripper} onChange={(e) => setDetail("filDripper", e.target.value)} placeholder="예: 하리오 V60" data-testid="input-fil-dripper" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">필터 (종이필터)</Label>
              <Input value={detail.filPaper} onChange={(e) => setDetail("filPaper", e.target.value)} placeholder="예: V60 전용지" data-testid="input-fil-paper" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Dose</Label>
              <Input value={detail.filDose} onChange={(e) => setDetail("filDose", e.target.value)} placeholder="예: 20g" data-testid="input-fil-dose" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Ground Size (EK43 기준)</Label>
              <Input value={detail.filGrind} onChange={(e) => setDetail("filGrind", e.target.value)} placeholder="예: 9.0" data-testid="input-fil-grind" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Water</Label>
              <Input value={detail.filWater} onChange={(e) => setDetail("filWater", e.target.value)} placeholder="예: 320g" data-testid="input-fil-water" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Temperature</Label>
              <Input value={detail.filTemp} onChange={(e) => setDetail("filTemp", e.target.value)} placeholder="예: 92℃" data-testid="input-fil-temp" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Time</Label>
              <Input value={detail.filTime} onChange={(e) => setDetail("filTime", e.target.value)} placeholder="예: 2:30" data-testid="input-fil-time" />
            </div>
          </div>
        )}

        {!detail.recipeType && (
          <p className="text-[11px] text-muted-foreground">레시피 유형을 선택하면 입력란이 표시됩니다.</p>
        )}
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
