// 카드·은행 내역 불러오기 — 올린 표를 과거 기록에 비추어 자동 분류한다.
//
// 설계 원칙
//  1) 바로 저장하지 않는다. 분류 결과를 먼저 보여주고, 사람이 확인한 뒤에 들어간다.
//  2) 과거 판단을 재사용한다. 한 번 정해준 가맹점은 다음부터 묻지 않는다.
//  3) 확신이 없으면 비워서 올린다. 억지로 채우면 틀린 채로 저장되어 나중에 더 큰 일이 된다.
//  4) 중복은 반드시 걸러낸다. 같은 명세서를 두 번 올리면 지출이 두 배가 된다.

import type { Express, Request, Response, NextFunction } from "express";
import { sqlite, storage } from "./storage";
import { SECTORS, type Sector } from "@shared/schema";

sqlite.exec(`
  -- 한 번 정해준 가맹점 → 분류. 다음 업로드부터 자동으로 쓰인다.
  CREATE TABLE IF NOT EXISTS expense_rules (
    merchant_key TEXT PRIMARY KEY,
    sample_name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    sector TEXT NOT NULL DEFAULT 'common',
    personal INTEGER NOT NULL DEFAULT 0,
    excluded INTEGER NOT NULL DEFAULT 0,
    hits INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

// 이미 만들어진 표에도 컬럼을 더한다
try {
  sqlite.exec("ALTER TABLE expense_rules ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
} catch {
  /* 이미 있음 */
}

const ETC = "기타";

/** 화면에서 넘어온 부문 값이 정해진 목록 안에 있는지 확인한다 */
function toSector(v: unknown): Sector {
  const s = String(v ?? "");
  return (SECTORS as readonly string[]).includes(s) ? (s as Sector) : "common";
}

// ===== 가맹점 이름 정리 =====

/**
 * 카드사가 주는 가맹점명은 지점·법인격·잘린 괄호가 섞여 있어 그대로는 못 묶는다.
 * 예) "네이버파이낸셜(주 네이버", "네이버페이 네이버파이낸셜 주식" → 둘 다 "네이버파이낸셜"
 */
export function merchantKey(raw: string): string {
  let s = String(raw ?? "")
    .replace(/　/g, " ") // 전각 공백
    .trim();
  // 괄호 안 내용 제거. 카드사가 이름을 잘라 괄호가 열린 채 끝나는 경우도 함께 처리한다.
  s = s.replace(/[（(][^)）]*[)）]?/g, " ");
  s = s.replace(/주식회사|\(주\)|㈜|\(사\)|\(재\)/g, " ");
  // 앞머리에 붙는 결제수단 표기
  s = s.replace(/^(토스페이|카카오페이|네이버페이|페이코|스마일페이)[_\s]+/i, "");
  s = s.replace(/\s+주식\s*$/g, " "); // "…파이낸셜 주식" 처럼 잘린 법인격
  // 지점 표기 제거. 다만 지우고 나서 이름이 사라지거나 너무 짧아지면 원래대로 둔다.
  // ("세븐일레븐후암삼거리점" 처럼 브랜드와 지점이 붙어 구분이 안 되는 이름을 통째로
  //  날려버리면, 서로 다른 편의점들이 한 덩어리로 묶여 엉뚱한 분류가 된다.)
  {
    let t = s.replace(/\s+[가-힣A-Za-z0-9]{1,12}(점|지점|영업소)\s*$/, "");
    t = t.replace(/^([A-Za-z0-9]{2,10})[가-힣]{1,12}(점|지점)$/, "$1");
    if (t.trim().length >= 2) s = t;
  }
  s = s.replace(/[_\-·]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

// ===== 비용이 아닌 출금 가려내기 =====

/**
 * 은행 거래내역의 출금에는 '쓴 돈'이 아닌 것이 많이 섞여 있다.
 * 그대로 넣으면 지출이 몇 배로 부풀고 손익이 완전히 틀어지므로, 걸러야 할 후보를 짚어준다.
 * 다만 자동으로 버리지는 않는다. 최종 판단은 화면에서 사람이 한다.
 */
type ExcludeHint = { excluded: boolean; reason: string };

const CARD_ISSUERS = /삼성카드|현대카드|국민카드|롯데카드|신한카드|하나카드|비씨카드|우리카드|농협카드|kb국민카드/i;
const LOAN_PRINCIPAL = /원금|대출원리금|중도상환|약정상환/;
/** 세금·공과금·보험료 — 이름에 상호가 붙어 나와도 이건 실제 비용이다 */
const TAX_LIKE =
  /국세|지방세|세무서|세입|관세|부가세|법인세|소득세|주민세|재산세|건강보험|국민연금|고용보험|산재보험|전기료|한국전력|수도|가스|도시가스|상하수도/;

function buildExcludeHinter(): (name: string) => ExcludeHint {
  // 본인·상호 이름 (계좌 간 이체 판별용) 과 공급처 이름 (공장 지급 판별용) 을 DB 에서 가져온다
  const words: { re: RegExp; reason: string }[] = [];
  try {
    const me = sqlite
      .prepare("SELECT business_name, manager_name FROM customers WHERE role = 'admin' ORDER BY id LIMIT 1")
      .get() as { business_name?: string; manager_name?: string } | undefined;
    for (const w of [me?.business_name, me?.manager_name]) {
      const t = String(w ?? "").replace(/\s+/g, "");
      if (t.length >= 2) words.push({ re: new RegExp(t.split("").join("\\s*")), reason: "본인·상호 계좌 간 이체로 보입니다" });
    }
  } catch {
    /* 없으면 넘어간다 */
  }
  try {
    const sups = sqlite.prepare("SELECT name FROM suppliers").all() as { name: string }[];
    for (const sp of sups) {
      const t = String(sp.name ?? "").replace(/\s+/g, "");
      if (t.length >= 2)
        words.push({
          re: new RegExp(t.split("").join("\\s*")),
          reason: "공장 지급으로 보입니다. 발주 시점에 이미 지출로 잡혀 있습니다",
        });
    }
  } catch {
    /* 없으면 넘어간다 */
  }

  return (name: string): ExcludeHint => {
    const n = String(name ?? "");
    if (CARD_ISSUERS.test(n))
      return { excluded: true, reason: "카드대금 결제로 보입니다. 카드 명세서에서 이미 잡힙니다" };
    // 세금·공과금·4대보험은 상호가 이름에 붙어 나오는 경우가 많다("국세-니트커피").
    // 계좌 간 이체로 오해해 걸러버리면 실제 비용이 통째로 빠지므로 여기서 먼저 빠져나간다.
    if (TAX_LIKE.test(n)) return { excluded: false, reason: "" };
    if (LOAN_PRINCIPAL.test(n)) return { excluded: true, reason: "대출 원금 상환은 비용이 아닙니다" };
    for (const w of words) if (w.re.test(n)) return { excluded: true, reason: w.reason };
    return { excluded: false, reason: "" };
  };
}

// ===== 분류에 쓸 재료 =====

type Rule = { merchantKey: string; category: string; sector: string; personal: number; excluded: number };

function loadRules(): Map<string, Rule> {
  const rows = sqlite.prepare("SELECT * FROM expense_rules").all() as any[];
  const m = new Map<string, Rule>();
  for (const r of rows)
    m.set(r.merchant_key, {
      merchantKey: r.merchant_key,
      category: r.category,
      sector: r.sector,
      personal: r.personal,
      excluded: r.excluded ?? 0,
    });
  return m;
}

/**
 * 과거 지출 기록에서 가맹점 → 분류를 배운다.
 * 같은 가맹점을 여러 카테고리로 넣으셨다면 가장 많이 쓴 쪽을 고르고,
 * 표가 갈리면(과반이 아니면) 확신 없음으로 둔다.
 */
function learnFromHistory(): Map<string, { category: string; sector: string; confident: boolean; n: number }> {
  const rows = sqlite
    .prepare("SELECT memo, category, sector FROM expenses WHERE memo <> '' ORDER BY id DESC LIMIT 5000")
    .all() as { memo: string; category: string; sector: string }[];

  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = merchantKey(r.memo);
    if (!k) continue;
    const inner = tally.get(k) ?? new Map<string, number>();
    const combo = `${r.category}||${r.sector}`;
    inner.set(combo, (inner.get(combo) ?? 0) + 1);
    tally.set(k, inner);
  }

  const out = new Map<string, { category: string; sector: string; confident: boolean; n: number }>();
  for (const k of Array.from(tally.keys())) {
    const inner = tally.get(k)!;
    let best = "";
    let bestN = 0;
    let total = 0;
    for (const combo of Array.from(inner.keys())) {
      const n = inner.get(combo)!;
      total += n;
      if (n > bestN) {
        best = combo;
        bestN = n;
      }
    }
    const [category, sector] = best.split("||");
    // 과반이면 믿고, 아니면 참고만 한다
    out.set(k, { category, sector: sector || "common", confident: bestN * 2 > total, n: total });
  }
  return out;
}

// ===== 들어온 줄 =====

export type ImportRow = {
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  amount: number;
  /** 카드사 이름 등 출처 표시 */
  source?: string;
  /** 승인번호 — 중복 판정에 쓴다 */
  refNo?: string;
};

export type ClassifiedRow = ImportRow & {
  key: string;
  category: string;
  sector: string;
  personal: boolean;
  /** 비용이 아니어서 저장하지 않을 건 (계좌 간 이체·카드대금·공장 지급 등) */
  excluded: boolean;
  /** high: 그대로 저장 / low: 확인 필요 */
  confidence: "high" | "low";
  reason: string;
  duplicate: boolean;
};

/**
 * 이미 들어와 있는 건인지 — 같은 날, 같은 금액, 같은 가맹점이면 중복으로 본다.
 * 개인으로 분류해 가계부로 보낸 것도 함께 봐야 한다. 그러지 않으면 같은 파일을
 * 다시 올렸을 때 개인 지출만 두 번 저장된다.
 */
function buildExistingIndex(): Set<string> {
  const s = new Set<string>();
  const expenseRows = sqlite
    .prepare("SELECT expense_date AS d, amount, memo FROM expenses ORDER BY id DESC LIMIT 20000")
    .all() as { d: string; amount: number; memo: string }[];
  const ledgerRows = sqlite
    .prepare("SELECT date AS d, amount, memo FROM personal_ledger WHERE type = 'expense' ORDER BY id DESC LIMIT 20000")
    .all() as { d: string; amount: number; memo: string }[];
  for (const r of [...expenseRows, ...ledgerRows]) s.add(`${r.d}|${r.amount}|${merchantKey(r.memo)}`);
  return s;
}

export function classifyRows(rows: ImportRow[]): ClassifiedRow[] {
  const rules = loadRules();
  const history = learnFromHistory();
  const existing = buildExistingIndex();
  const hintExclude = buildExcludeHinter();
  const seenInFile = new Set<string>();

  return rows.map((r) => {
    const key = merchantKey(r.merchant);
    const dupKey = `${r.date}|${Math.round(r.amount)}|${key}`;
    const duplicate = existing.has(dupKey) || seenInFile.has(dupKey);
    seenInFile.add(dupKey);

    const rule = rules.get(key);
    if (rule) {
      return {
        ...r,
        key,
        category: rule.category,
        sector: rule.sector,
        personal: rule.personal === 1,
        excluded: rule.excluded === 1,
        confidence: "high",
        reason: rule.excluded === 1 ? "전에 제외하기로 정한 건" : "전에 정해두신 분류",
        duplicate,
      };
    }

    // 비용이 아닌 출금은 분류보다 먼저 걸러낸다. 다만 확인은 받는다.
    const hint = hintExclude(r.merchant);
    if (hint.excluded) {
      return {
        ...r,
        key,
        category: "",
        sector: "common",
        personal: false,
        excluded: true,
        confidence: "low",
        reason: hint.reason,
        duplicate,
      };
    }

    const hist = history.get(key);
    if (hist && hist.confident) {
      return {
        ...r,
        key,
        category: hist.category,
        sector: hist.sector,
        personal: false,
        excluded: false,
        confidence: "high",
        reason: `과거 지출 ${hist.n}건과 같은 곳`,
        duplicate,
      };
    }

    return {
      ...r,
      key,
      category: hist?.category ?? "",
      sector: hist?.sector ?? "common",
      personal: false,
      excluded: false,
      confidence: "low",
      reason: hist ? "과거 분류가 여러 갈래라 확인이 필요합니다" : "처음 보는 곳입니다",
      duplicate,
    };
  });
}

// ===== 저장 =====

export type CommitRow = {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  sector: string;
  personal: boolean;
  excluded?: boolean;
  /** 이 분류를 다음부터 자동으로 쓸지 */
  remember?: boolean;
};

function rememberRule(
  merchant: string,
  category: string,
  sector: string,
  personal: boolean,
  isExcluded: boolean,
): void {
  const key = merchantKey(merchant);
  if (!key) return;
  sqlite
    .prepare(
      `INSERT INTO expense_rules (merchant_key, sample_name, category, sector, personal, excluded, hits, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(merchant_key) DO UPDATE SET
         category = excluded.category,
         sector = excluded.sector,
         personal = excluded.personal,
         excluded = excluded.excluded,
         hits = expense_rules.hits + 1,
         updated_at = excluded.updated_at`,
    )
    .run(key, merchant.slice(0, 60), category, sector, personal ? 1 : 0, isExcluded ? 1 : 0, Date.now());
}

// ===== 라우트 =====

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  if (req.session.adminRole !== "owner") return res.status(403).json({ message: "Owner 권한이 필요합니다." });
  next();
}

function safe(fn: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };
}

const MAX_ROWS = 3000;

function parseIncoming(body: any): ImportRow[] {
  const raw = Array.isArray(body?.rows) ? body.rows : [];
  const out: ImportRow[] = [];
  for (const r of raw.slice(0, MAX_ROWS)) {
    const date = String(r?.date ?? "").slice(0, 10);
    const amount = Math.round(Number(r?.amount ?? 0));
    const merchant = String(r?.merchant ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (!merchant) continue;
    out.push({
      date,
      merchant,
      amount,
      source: String(r?.source ?? "").slice(0, 20),
      refNo: String(r?.refNo ?? "").slice(0, 40),
    });
  }
  return out;
}

export function registerExpenseImportRoutes(app: Express) {
  /** 올린 줄을 분류해서 돌려준다. 저장하지 않는다. */
  app.post(
    "/api/admin/expense-import/analyze",
    requireOwner,
    safe((req, res) => {
      const rows = parseIncoming(req.body);
      if (rows.length === 0) return res.status(400).json({ message: "읽을 수 있는 내역이 없습니다." });
      const classified = classifyRows(rows);
      res.json({
        rows: classified,
        summary: {
          total: classified.length,
          high: classified.filter((r) => r.confidence === "high" && !r.duplicate).length,
          low: classified.filter((r) => r.confidence === "low" && !r.duplicate).length,
          duplicate: classified.filter((r) => r.duplicate).length,
          amount: classified.filter((r) => !r.duplicate).reduce((s, r) => s + r.amount, 0),
        },
      });
    }),
  );

  /** 확인이 끝난 줄을 실제로 저장한다. */
  app.post(
    "/api/admin/expense-import/commit",
    requireOwner,
    safe(async (req, res) => {
      const raw: CommitRow[] = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, MAX_ROWS) : [];
      if (raw.length === 0) return res.status(400).json({ message: "저장할 내역이 없습니다." });

      // 개인 지출을 담을 가계부 분류 — 없으면 하나 만들어 둔다
      let personalCategoryId = 0;
      if (raw.some((r) => r.personal)) {
        const cats = await storage.listPersonalCategories();
        const found = cats.find((c) => c.type === "expense" && c.name === "카드");
        personalCategoryId = found
          ? found.id
          : (await storage.createPersonalCategory({ name: "카드", type: "expense" })).id;
      }

      let savedExpense = 0;
      let savedPersonal = 0;
      let skippedExcluded = 0;
      const failed: string[] = [];

      for (const r of raw) {
        // 제외로 표시된 건은 저장하지 않는다. 다만 그 판단은 기억해 다음부터 자동으로 걸러준다.
        if (r.excluded) {
          rememberRule(String(r.merchant ?? ""), "", "common", false, true);
          skippedExcluded += 1;
          continue;
        }
        const date = String(r.date ?? "").slice(0, 10);
        const amount = Math.round(Number(r.amount ?? 0));
        const merchant = String(r.merchant ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || !merchant) {
          failed.push(`${merchant || "(이름 없음)"} ${date}`);
          continue;
        }
        try {
          if (r.personal) {
            await storage.createPersonalLedger({
              date,
              type: "expense",
              categoryId: personalCategoryId,
              amount,
              memo: merchant,
            });
            savedPersonal += 1;
          } else {
            await storage.createExpense({
              expenseDate: date,
              category: r.category || ETC,
              amount,
              memo: merchant,
              sector: toSector(r.sector),
            });
            savedExpense += 1;
          }
          if (r.remember !== false)
            rememberRule(merchant, r.category || ETC, r.sector || "common", !!r.personal, false);
        } catch (e: any) {
          failed.push(`${merchant}: ${e?.message ?? e}`);
        }
      }

      try {
        const actor = await storage.getCustomer(req.session.userId!);
        await storage.logActivity({
          actorUserId: req.session.userId ?? 0,
          actorEmail: actor?.email ?? "",
          actorRole: req.session.adminRole ?? "owner",
          action: "expense_import",
          targetType: "expense",
          summary: `카드·은행 내역 불러오기: 지출 ${savedExpense}건, 가계부 ${savedPersonal}건, 제외 ${skippedExcluded}건`,
        });
      } catch {
        /* 활동 로그 실패는 무시 */
      }

      res.json({
        message: `지출 ${savedExpense}건, 가계부 ${savedPersonal}건을 저장했습니다.${
          skippedExcluded > 0 ? ` (비용이 아닌 ${skippedExcluded}건은 제외)` : ""
        }`,
        savedExpense,
        savedPersonal,
        skippedExcluded,
        failed,
      });
    }),
  );

  /** 배운 분류 규칙 — 잘못 배운 것을 고치거나 지울 수 있게 */
  app.get(
    "/api/admin/expense-import/rules",
    requireOwner,
    safe((_req, res) => {
      const rows = sqlite
        .prepare("SELECT * FROM expense_rules ORDER BY hits DESC, updated_at DESC LIMIT 300")
        .all() as any[];
      res.json({
        rules: rows.map((r) => ({
          merchantKey: r.merchant_key,
          sampleName: r.sample_name,
          category: r.category,
          sector: r.sector,
          personal: r.personal === 1,
          hits: r.hits,
        })),
      });
    }),
  );

  app.delete(
    "/api/admin/expense-import/rules/:key",
    requireOwner,
    safe((req, res) => {
      sqlite.prepare("DELETE FROM expense_rules WHERE merchant_key = ?").run(String(req.params.key));
      res.json({ message: "지웠습니다. 다음부터 다시 여쭤봅니다." });
    }),
  );
}
