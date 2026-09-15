import { useState, type ReactNode } from "react";
import { BASIC_SENSES, DEFECTS, FLAVOR_GROUPS, QUALITY_LABELS, SENSE_LABELS, TEXTURES, canonicalNote, intensityLabels, matchingNotes, normalizeNotes, readSensory, type EspressoSensory } from "@shared/espresso-sensory";
import "./espresso-sensory.css";

type Props = {
  value: EspressoSensory; onChange: (value: EspressoSensory) => void;
  notes: string[]; onNotesChange: (notes: string[]) => void; children?: ReactNode;
};
type PairKey = typeof BASIC_SENSES[number] | "flavor" | "aftertaste";
export function EspressoSensoryEditor({ value, onChange, notes, onNotesChange, children }: Props) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("전체");
  const [notice, setNotice] = useState("");
  const patch = (p: Partial<EspressoSensory>) => onChange({ ...value, ...p });
  function toggleNote(raw: string) {
    const note = canonicalNote(raw);
    if (!note || note.length > 30) { setNotice("향미 이름을 1~30자로 입력해 주세요."); return; }
    const selected = normalizeNotes(notes);
    if (selected.includes(note)) { onNotesChange(selected.filter(n => n !== note)); setNotice(""); return; }
    if (selected.length >= 20) { setNotice("향미는 최대 20개까지 선택할 수 있어요."); return; }
    onNotesChange(normalizeNotes([...selected, note])); setNotice("");
  }
  function scoreRow(key: PairKey) {
    return <div className="sensory-row" key={key}>
      <span>{SENSE_LABELS[key]}</span>
      <ScoreSelect label={`${SENSE_LABELS[key]} ${key === "aftertaste" ? "길이" : "강도"}`} value={value[key].intensity} labels={intensityLabels(key)} allowZero={["acidity", "sweetness", "bitterness"].includes(key)} onChange={intensity => patch({ [key]: { ...value[key], intensity } })} />
      <ScoreSelect label={`${SENSE_LABELS[key]} 품질`} value={value[key].quality} labels={QUALITY_LABELS} onChange={quality => patch({ [key]: { ...value[key], quality } })} />
    </div>;
  }
  return <div className="espresso-sensory">
    <div className="sensory-tags" aria-label="선택한 향미">
      {normalizeNotes(notes).map(n => <button type="button" key={n} className="selected" onClick={() => toggleNote(n)} aria-label={`${n} 선택 해제`}>{n} ×</button>)}
      {!notes.length && <span className="sensory-muted">선택한 향미 없음</span>}
    </div>
    <details className="sensory-note-picker">
      <summary>+ 향미 선택</summary>
      <input aria-label="향미 검색" placeholder="향미 검색 · 없으면 직접 추가" value={query} maxLength={30} onChange={e => { setQuery(e.target.value); setNotice(""); }} />
      <div className="sensory-tags sensory-groups">
        {["전체", ...Object.keys(FLAVOR_GROUPS)].map(g => <button type="button" key={g} aria-pressed={group === g} className={group === g ? "selected" : ""} onClick={() => { setGroup(g); setQuery(""); }}>{g}</button>)}
      </div>
      <div className="sensory-tags sensory-options">
        {matchingNotes(query, group).map(n => <button type="button" key={n} aria-pressed={notes.includes(n)} className={notes.includes(n) ? "selected" : ""} onClick={() => toggleNote(n)}>{n}</button>)}
      </div>
      {query.trim() && <button type="button" className="sensory-add" onClick={() => {
        const name = canonicalNote(query);
        if (normalizeNotes(notes).includes(name)) { setNotice(`‘${name}’은 이미 선택했어요.`); return; }
        toggleNote(name);
      }}>‘{canonicalNote(query)}’ 추가</button>}
      <p role="status" className="sensory-muted">{notice || "같은 향미는 한 번만 저장됩니다."}</p>
    </details>
    <div className="sensory-row sensory-heading"><span>항목</span><span>강도</span><span>품질</span></div>
    {BASIC_SENSES.map(scoreRow)}
    <details className="sensory-details">
      <summary>상세 평가 · 메모</summary>
      <p className="sensory-muted">강도는 느껴지는 정도, 품질은 얼마나 좋은지를 뜻해요. 미평가는 집계에서 제외하고, ‘0 · 없음’은 포함해요.</p>
      {scoreRow("flavor")}
      <div className="sensory-muted">후미의 왼쪽 값은 여운의 길이예요.</div>
      {scoreRow("aftertaste")}
      {(["balance", "cleanliness"] as const).map(key => <div className="sensory-row" key={key}>
        <span>{SENSE_LABELS[key]}</span><span className="sensory-muted">품질만 평가</span>
        <ScoreSelect label={`${SENSE_LABELS[key]} 품질`} value={value[key]} labels={QUALITY_LABELS} onChange={score => patch({ [key]: score })} />
      </div>)}
      <ChoiceSet title="질감" options={TEXTURES} selected={value.textures} onChange={textures => patch({ textures })} />
      <ChoiceSet title="아쉬운 특성 · 내부 기록" options={DEFECTS} selected={value.defects} onChange={defects => patch({ defects })} />
      {children}
    </details>
    <p className="sensory-muted sensory-disclosure">향미와 기본 4항목의 강도는 파트너에게 공개돼요. 품질·상세 평가·메모는 내부 기록이에요.</p>
  </div>;
}

function ScoreSelect({ label, value, labels, allowZero = false, onChange }: { label: string; value: number | null; labels: string[]; allowZero?: boolean; onChange: (v: number | null) => void }) {
  return <select aria-label={label} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}>
    <option value="">미평가</option>
    {labels.map((label, i) => (i > 0 || allowZero) && <option key={i} value={i}>{i} · {label}</option>)}
  </select>;
}
function ChoiceSet<T extends string>({ title, options, selected, onChange }: { title: string; options: readonly T[]; selected: T[]; onChange: (v: T[]) => void }) {
  return <div className="sensory-choices"><div className="sensory-muted">{title}</div><div className="sensory-tags">
    {options.map(o => <button type="button" key={o} aria-pressed={selected.includes(o)} className={selected.includes(o) ? "selected" : ""} onClick={() => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])}>{o}</button>)}
  </div></div>;
}

export function EspressoSensorySummary({ raw }: { raw: string | null | undefined }) {
  if (!raw) return null;
  const value = readSensory(raw);
  return <details className="espresso-sensory sensory-record"><summary>감각 평가 · 내부 기록</summary>
    <div className="sensory-row sensory-heading"><span>항목</span><span>강도 / 길이</span><span>품질</span></div>
    {([...BASIC_SENSES, "flavor", "aftertaste"] as const).map(key => <div className="sensory-row" key={key}><span>{SENSE_LABELS[key]}</span>
      <span>{value[key].intensity === null ? "미평가" : `${value[key].intensity} / 5`}</span><span>{value[key].quality === null ? "미평가" : `${value[key].quality} / 5`}</span></div>)}
    <p>균형 {value.balance ?? "미평가"} · 깔끔함 {value.cleanliness ?? "미평가"}</p>
    {!!value.textures.length && <p>질감: {value.textures.join(" · ")}</p>}
    {!!value.defects.length && <p>아쉬운 특성: {value.defects.join(" · ")}</p>}
  </details>;
}
