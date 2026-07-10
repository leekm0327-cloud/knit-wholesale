/**
 * ECOUNT ERP OpenAPI 클라이언트.
 * - 인증키는 DB에 AES-256-GCM으로 암호화 저장 (BUILD_ECOUNT_SECRET 으로 마스터키 주입)
 * - Zone 조회 → 로그인 → SESSION_ID 캐싱 → 업무 API 호출 패턴
 */
import crypto from "crypto";
import { storage } from "./storage";
import type { EcountSettings, EcountVerifyResult, Order, OrderItem, Customer, Payment } from "@shared/schema";

// ===== 로그 기록 헬퍼 =====
type LogInput = {
  action: string;
  label: string;
  refKind?: string;
  refId?: string;
  summary?: string;
  ok: boolean;
  message: string;
  request?: any;
  response?: any;
  durationMs?: number;
};
// recordLog 자체 실패 점검용 메모리 카운터 (관리자 진단 엔드포인트에서 읽으는다)
export const __ecountLogDebug = {
  attempts: 0,
  successes: 0,
  failures: 0,
  lastError: "" as string,
  lastSavedId: 0,
};

async function recordLog(l: LogInput) {
  __ecountLogDebug.attempts++;
  try {
    const row = await storage.insertEcountLog({
      action: l.action,
      label: l.label,
      refKind: l.refKind ?? "",
      refId: l.refId ?? "",
      summary: l.summary ?? "",
      ok: l.ok ? 1 : 0,
      message: (l.message ?? "").slice(0, 1000),
      requestJson: l.request ? JSON.stringify(l.request).slice(0, 20000) : "",
      responseJson: l.response ? JSON.stringify(l.response).slice(0, 20000) : "",
      durationMs: l.durationMs ?? 0,
    });
    __ecountLogDebug.successes++;
    __ecountLogDebug.lastSavedId = row?.id ?? 0;
  } catch (e: any) {
    __ecountLogDebug.failures++;
    __ecountLogDebug.lastError = (e?.message ?? String(e)).slice(0, 500);
    // 로그 저장 실패 자체는 운영을 막아서는 안 됨 — 콘솔에만
    // eslint-disable-next-line no-console
    console.warn("[ecount log save failed]", e?.message, e?.stack);
  }
}

// ---- AES-256-GCM ----
declare const __ECOUNT_SECRET__: string;
const MASTER = (typeof __ECOUNT_SECRET__ !== "undefined" && __ECOUNT_SECRET__)
  ? __ECOUNT_SECRET__
  : (process.env.ECOUNT_SECRET ?? "knit-default-ecount-secret-change-me-please-32b");

function key(): Buffer {
  return crypto.createHash("sha256").update(MASTER).digest(); // 32 bytes
}

export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}
export function decrypt(enc: string): string {
  if (!enc) return "";
  try {
    const buf = Buffer.from(enc, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// ---- ECOUNT 도메인 ----
function baseHost(zone: string, useTest: boolean): string {
  const prefix = useTest ? "sboapi" : "oapi";
  // ECOUNT 도메인은 Zone 코드가 대문자여야 함 (예: sboapiAA.ecount.com)
  return `https://${prefix}${(zone || "").toUpperCase()}.ecount.com`;
}
function zoneLookupHost(useTest: boolean): string {
  return useTest ? "https://sboapi.ecount.com" : "https://oapi.ecount.com";
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

async function post(url: string, body: any, timeoutMs = 15000, retries = 1): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { _raw: text }; }
      if (!r.ok) {
        const detail = json?.Data?.message ?? json?.Error?.Message ?? json?._raw ?? r.statusText;
        const err = new Error(`HTTP ${r.status} ${shortUrl(url)} — ${typeof detail === "string" ? detail.slice(0, 240) : JSON.stringify(detail).slice(0, 240)}`);
        (err as any).status = r.status;
        if ((r.status === 503 || r.status === 502 || r.status === 504) && attempt < retries) {
          lastErr = err;
          await new Promise((res) => setTimeout(res, 1500));
          continue;
        }
        throw err;
      }
      return json;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error(`요청 시간 초과 (${shortUrl(url)})`);
      }
      if (attempt >= retries) throw e;
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr ?? new Error("알 수 없는 오류");
}

// ---- 핵심 API ----
export async function fetchZone(comCode: string, useTest: boolean): Promise<string> {
  const url = `${zoneLookupHost(useTest)}/OAPI/V2/Zone`;
  try {
    const res = await post(url, { COM_CODE: comCode });
    const zone = res?.Data?.ZONE;
    if (!zone) throw new Error("Zone 응답에 ZONE 값이 없습니다: " + JSON.stringify(res).slice(0, 200));
    return zone;
  } catch (e: any) {
    throw new Error(`[Zone조회] ${e?.message ?? e}`);
  }
}

export async function login(s: EcountSettings, apiKey: string): Promise<string> {
  const url = `${baseHost(s.zone, !!s.useTestEndpoint)}/OAPI/V2/OAPILogin`;
  try {
    const res = await post(url, {
      COM_CODE: s.comCode,
      USER_ID: s.userId,
      API_CERT_KEY: apiKey,
      ZONE: s.zone,
      LAN_TYPE: "ko-KR",
    });
    const sid = res?.Data?.Datas?.SESSION_ID ?? res?.Data?.SESSION_ID;
    if (!sid) {
      const expireDate = res?.Data?.Datas?.ExpireDate ?? res?.Data?.ExpireDate;
      const errCode = res?.Data?.Datas?.Code ?? res?.Data?.Code ?? res?.Error?.Code;
      const errMsg =
        res?.Data?.Datas?.message ??
        res?.Data?.Datas?.Message ??
        res?.Data?.message ??
        res?.Data?.Message ??
        res?.Error?.Message ??
        "원인 불명";
      const dump = JSON.stringify(res?.Data ?? res).slice(0, 400);
      throw new Error(`SESSION_ID 없음 — code=${errCode ?? "-"} expire=${expireDate ?? "-"} msg=${errMsg} | raw=${dump}`);
    }
    return sid;
  } catch (e: any) {
    throw new Error(`[로그인] ${e?.message ?? e}`);
  }
}

// ---- 검증 호출 4건 (ECOUNT 공식 매뉴얼 기반) ----
type CallCtx = { s: EcountSettings; sid: string; host: string; custCode?: string };

function ymdToday(): string {
  const t = new Date();
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}`;
}

// 검증 전체에서 공통으로 쓰는 코드
// ⚠ ECOUNT는 BUSINESS_NO가 있으면 그것을 거래처코드로 강제 사용함
// → CUST 값도 BUSINESS_NO와 일치시켜야 했
// (이미 ECOUNT에 0000000000으로 생성되어 있음)
const VERIFY_CUST_CODE = "0000000000";
const VERIFY_PROD_CD = "ZZAPITEST";

async function verifyCustomers(ctx: CallCtx) {
  // 기초등록API > 거래처등록
  const url = `${ctx.host}/OAPI/V2/AccountBasic/SaveBasicCust?SESSION_ID=${ctx.sid}`;
  const body = {
    CustList: [
      {
        Line: "1",
        BulkDatas: {
          CUST: VERIFY_CUST_CODE,
          BUSINESS_NO: "0000000000",
          CUST_NAME: "API검증용 삭제예정",
          BOSS_NAME: "",
          UPTAE: "",
          JONGMOK: "",
          TEL: "",
          EMAIL: "",
          REMARKS: "API 검증용 수동 삭제 바람",
        },
      },
    ],
  };
  return post(url, body);
}

async function verifyProducts(ctx: CallCtx) {
  // 기초등록API > 품목등록
  // 품목코드는 특수문자(_, -, 한글, 공백) 불가 → 영문/숫자만
  const url = `${ctx.host}/OAPI/V2/InventoryBasic/SaveBasicProduct?SESSION_ID=${ctx.sid}`;
  const body = {
    ProductList: [
      {
        Line: "1",
        BulkDatas: {
          PROD_CD: VERIFY_PROD_CD,
          PROD_DES: "API검증용 삭제예정",
          SIZE_FLAG: "",
          SIZE_DES: "",
          UNIT: "EA",
          PROD_TYPE: "3", // 3 = 상품
          REMARKS_WIN: "API 검증용 수동 삭제 바람",
        },
      },
    ],
  };
  return post(url, body);
}

async function verifySales(ctx: CallCtx) {
  // 영업관리API > 판매입력
  const url = `${ctx.host}/OAPI/V2/Sale/SaveSale?SESSION_ID=${ctx.sid}`;
  const ymd = ymdToday();
  const cust = ctx.custCode || VERIFY_CUST_CODE;
  const body = {
    SaleList: [
      {
        Line: "1",
        BulkDatas: {
          IO_DATE: ymd,
          UPLOAD_SER_NO: "1",
          CUST: cust,
          CUST_DES: "API검증용 삭제예정",
          WH_CD: ctx.s.warehouseCode,
          PROD_CD: VERIFY_PROD_CD,
          PROD_DES: "API검증용 삭제예정",
          QTY: "1",
          PRICE: "1",
          SUPPLY_AMT: "1",
          VAT_AMT: "0",
          REMARKS_WIN: "API검증용",
        },
      },
    ],
  };
  return post(url, body);
}

async function verifyInvoiceAuto(ctx: CallCtx) {
  // 회계API > 매출·매입전표 II 자동분개
  // (수금/입금/채권채무는 ECOUNT에서 자동으로 생성되므로 별도 API 호출 불필요)
  const url = `${ctx.host}/OAPI/V2/InvoiceAuto/SaveInvoiceAuto?SESSION_ID=${ctx.sid}`;
  const ymd = ymdToday();
  const cust = ctx.custCode || VERIFY_CUST_CODE;
  const body = {
    InvoiceAutoList: [
      {
        Line: "1",
        BulkDatas: {
          TRX_DATE: ymd,
          ACCT_DOC_NO: "",
          TAX_GUBUN: "11", // 11 = 매출
          S_NO: "",
          CUST: cust,
          CUST_DES: "API검증용 삭제예정",
          SUPPLY_AMT: "1",
          VAT_AMT: "0",
          ACCT_NO: "",
          CR_CODE: "4019", // 매출 계정코드 (상품매출)
          DR_CODE: "",
          REMARKS_CD: "",
          REMARKS: "API검증용",
          SITE_CD: "",
          PJT_CD: "",
        },
      },
    ],
  };
  return post(url, body);
}

const VERIFY_STEPS: Array<[string, (ctx: CallCtx) => Promise<any>]> = [
  ["거래처등록", verifyCustomers],
  ["품목등록", verifyProducts],
  ["판매전표", verifySales],
  ["회계자동분개", verifyInvoiceAuto],
];

// 거래처등록 응답에서 실제 적용된 거래처코드(CUST) 추출
function extractCustCode(res: any): string | undefined {
  const slipNos = res?.Data?.SlipNos;
  if (Array.isArray(slipNos) && slipNos.length > 0) {
    const first = slipNos[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first?.CUST) return String(first.CUST);
    if (first?.SlipNo) return String(first.SlipNo);
  }
  const candidates = [
    res?.Data?.ResultDetails,
    res?.Data?.SuccessCustList,
    res?.Data?.Datas,
    res?.Data?.Result,
  ].filter(Boolean);
  for (const arr of candidates) {
    if (Array.isArray(arr)) {
      for (const row of arr) {
        if (row?.CUST) return String(row.CUST);
        const sd = row?.SuccessDatas ?? row?.Datas ?? row?.BulkDatas;
        if (sd?.CUST) return String(sd.CUST);
      }
    }
  }
  return undefined;
}

// "OK" 같은 정상 양성 판별 — 실제 에러가 아니면 true
// ECOUNT 정상 응답 예: "OK", "[전표묶음0] OK", "[거래처0] OK"
function isOkText(s: string): boolean {
  const t = s.replace(/<\/?br\s*\/?>/gi, " ").trim();
  if (t === "") return true;
  // 접두 태그 [...]와 공백을 제거한 후 "OK" 또는 "정상" 또는 "SUCCESS" 이면 정상
  const stripped = t.replace(/^\[[^\]]*\]\s*/, "").trim().toUpperCase();
  return stripped === "OK" || stripped === "정상" || stripped === "SUCCESS";
}

// "이미 존재" 계열 — 멱등 등록이면 우리에게는 성공으로 간주
function isAlreadyExistsText(s: string): boolean {
  const t = s.replace(/<\/?br\s*\/?>/gi, " ").trim();
  // 거래처: "거래처코드와 중복되는 코드"
  // 품목:   "품목코드(이미 품목등록에 존재하는 코드입니다)"
  return /중복되는 코드|이미.{0,12}존재|이미.{0,12}등록|already exists/i.test(t);
}

// ResultDetails의 실제 에러만 추출 — ECOUNT는 정상도 TotalError="OK"로 응답
// 반환값: { error: "...", treatAsSuccess: bool }
function extractRealError(res: any): { error?: string; treatAsSuccess?: boolean } {
  const rd = res?.Data?.ResultDetails;
  if (Array.isArray(rd)) {
    for (const row of rd) {
      const te = row?.TotalError;
      if (te != null) {
        const s = String(te);
        if (!isOkText(s)) {
          // 이미 존재면 성공 간주 (재시도 친화)
          if (isAlreadyExistsText(s)) return { error: "이미 등록됨 — 재사용", treatAsSuccess: true };
          return { error: s.replace(/<\/?br\s*\/?>/gi, " ").trim() };
        }
      }
      const errs = row?.Errors;
      if (Array.isArray(errs) && errs.length > 0) {
        const msg = errs.map((e: any) => e?.Message ?? JSON.stringify(e)).join("; ");
        if (isAlreadyExistsText(msg)) return { error: "이미 등록됨 — 재사용", treatAsSuccess: true };
        return { error: msg };
      }
    }
  }
  const single = res?.Data?.Errors;
  if (Array.isArray(single) && single.length > 0) {
    const msg = single.map((e: any) => e?.Message ?? JSON.stringify(e)).join("; ");
    if (isAlreadyExistsText(msg)) return { error: "이미 등록됨 — 재사용", treatAsSuccess: true };
    return { error: msg };
  }
  const top = res?.Error?.Message;
  if (top != null && !isOkText(String(top))) {
    return { error: String(top) };
  }
  return {};
}

export async function runVerification(): Promise<EcountVerifyResult> {
  const s = await storage.getEcountSettings();
  if (!s) throw new Error("ECOUNT 설정이 없습니다.");
  const apiKey = decrypt(s.apiCertKeyEnc);
  if (!apiKey) throw new Error("저장된 인증키를 복호화할 수 없습니다.");

  const results: EcountVerifyResult["results"] = [];
  const finish = (ok: boolean, zone: string) => {
    const finishedAt = Date.now();
    return storage
      .updateEcountSettings({
        lastVerifiedAt: ok ? finishedAt : s.lastVerifiedAt ?? null,
        verificationLog: JSON.stringify(results),
      })
      .then(() => ({ ok, zone, results, finishedAt } as EcountVerifyResult));
  };

  let zone = s.zone;
  if (!zone) {
    try {
      zone = await fetchZone(s.comCode, !!s.useTestEndpoint);
      await storage.updateEcountSettings({ zone });
    } catch (e: any) {
      results.push({ menu: "Zone조회", ok: false, message: e?.message ?? String(e) });
      return finish(false, "");
    }
  }

  const settings: EcountSettings = { ...s, zone };

  let sid: string;
  try {
    sid = await login(settings, apiKey);
    results.push({ menu: "로그인(세션발급)", ok: true, message: `SESSION_ID 수신 완료` });
  } catch (e: any) {
    results.push({ menu: "로그인(세션발급)", ok: false, message: e?.message ?? String(e) });
    return finish(false, zone);
  }

  const host = baseHost(zone, !!settings.useTestEndpoint);

  // 거래처코드는 우리가 직접 부여하지만, 응답에 다른 값이 오면 그것을 우선
  let custCode: string | undefined = VERIFY_CUST_CODE;
  for (const [menu, fn] of VERIFY_STEPS) {
    try {
      const res = await fn({ s: settings, sid, host, custCode });
      if (menu === "거래처등록") {
        const c = extractCustCode(res);
        if (c) custCode = c;
      }
      const status = res?.Status;
      const succ = res?.Data?.SuccessCnt;
      const fail = res?.Data?.FailCnt;
      const { error: errStr, treatAsSuccess } = extractRealError(res);
      const statusOk = String(status) === "200";
      const noFail = fail === undefined || fail === 0 || fail === "0";
      // 이미 등록됨은 성공 간주 (거래처/품목 동일 레코드 재사용 시나리오)
      const ok = statusOk && (treatAsSuccess || (noFail && !errStr));
      let msg: string;
      if (errStr && !treatAsSuccess) msg = errStr.slice(0, 240);
      else if (treatAsSuccess) {
        const extra = menu === "거래처등록" && custCode ? ` (거래처코드: ${custCode})` : "";
        msg = `이미 등록되어 있음 — 재사용${extra}`;
      }
      else if (succ !== undefined) {
        const extra = menu === "거래처등록" && custCode ? ` (거래처코드: ${custCode})` : "";
        msg = `성공 ${succ} / 실패 ${fail ?? 0}${extra}`;
      }
      else if (statusOk) msg = `OK (Status ${status})`;
      else msg = `실패 (Status ${status ?? "?"})`;
      results.push({ menu, ok, message: msg, sample: res?.Data });
      await recordLog({
        action: "verify",
        label: "검증 · " + menu,
        refKind: "verify",
        summary: "검증용 더미 데이터",
        ok,
        message: msg,
        response: res,
      });
    } catch (e: any) {
      const errMsg = e?.message ?? String(e);
      results.push({ menu, ok: false, message: errMsg });
      await recordLog({
        action: "verify",
        label: "검증 · " + menu,
        refKind: "verify",
        ok: false,
        message: errMsg,
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return finish(allOk, zone);
}

// ============================================================
// 운영용: 주문/입금을 실제 ECOUNT로 전송 (수동 버튼에서 호출)
// ============================================================

async function ensureSession(): Promise<{ s: EcountSettings; sid: string; host: string }> {
  const s = await storage.getEcountSettings();
  if (!s) throw new Error("ECOUNT 설정이 없습니다. 관리자 → ECOUNT 메뉴에서 먼저 설정해주세요.");
  const apiKey = decrypt(s.apiCertKeyEnc);
  if (!apiKey) throw new Error("저장된 인증키를 복호화할 수 없습니다. 인증키를 다시 저장해주세요.");
  let zone = s.zone;
  if (!zone) {
    zone = await fetchZone(s.comCode, !!s.useTestEndpoint);
    await storage.updateEcountSettings({ zone });
  }
  const settings: EcountSettings = { ...s, zone };
  const sid = await login(settings, apiKey);
  const host = baseHost(zone, !!settings.useTestEndpoint);
  return { s: settings, sid, host };
}

function ymdFromDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function upsertCustomerOnEcount(
  ctx: { s: EcountSettings; sid: string; host: string },
  customer: Customer,
): Promise<{ ok: boolean; message: string; custCode: string; res: any }> {
  const cleanBizNo = (customer.bizRegNo || "").replace(/[^0-9]/g, "");
  if (!cleanBizNo) {
    return {
      ok: false,
      message:
        "사업자등록번호가 없는 거래처는 ECOUNT에 등록할 수 없습니다. 거래처 관리에서 사업자등록번호를 먼저 입력해주세요.",
      custCode: "",
      res: null,
    };
  }
  const custCode = cleanBizNo;
  const url = `${ctx.host}/OAPI/V2/AccountBasic/SaveBasicCust?SESSION_ID=${ctx.sid}`;
  const body = {
    CustList: [
      {
        Line: "1",
        BulkDatas: {
          CUST: custCode,
          BUSINESS_NO: cleanBizNo || "",
          CUST_NAME: customer.businessName,
          BOSS_NAME: customer.managerName || "",
          UPTAE: "",
          JONGMOK: "",
          TEL: customer.phone || "",
          EMAIL: customer.taxEmail || customer.email || "",
          REMARKS: `니트커피 도매 자동 등록 (고객 ID ${customer.id})`,
        },
      },
    ],
  };
  const res = await post(url, body);
  const { error: errStr, treatAsSuccess } = extractRealError(res);
  const status = String(res?.Status) === "200";
  const ok = status && (treatAsSuccess || !errStr);
  const message = treatAsSuccess
    ? `이미 등록되어 있음 — 재사용 (거래처코드: ${custCode})`
    : ok
    ? `신규 등록 완료 (거래처코드: ${custCode})`
    : `실패: ${errStr ?? `Status ${res?.Status ?? "?"}`}`;
  // 거래처코드는 항상 사업자등록번호(cleanBizNo)로 고정 — ECOUNT 응답에서 다른 코드를 받더라도 사용하지 않음
  return { ok, message, custCode, res };
}

/**
 * 주문 품목들을 ECOUNT에 일괄 upsert (없으면 생성, 있으면 그대로).
 * ECOUNT는 동일 PROD_CD 재등록 시 "이미 등록되어 있음" 류 응답을 주는데 이 또한 성공으로 간주.
 */
async function upsertProductsOnEcount(
  ctx: { s: EcountSettings; sid: string; host: string },
  items: OrderItem[],
  productCodeMap: Map<number, string>,
): Promise<{ ok: boolean; message: string; res: any; codes: string[] }> {
  // 중복 productId 제거
  const uniq = new Map<number, OrderItem>();
  for (const it of items) if (!uniq.has(it.productId)) uniq.set(it.productId, it);
  const list = Array.from(uniq.values());

  // 품목코드 빠진 상품 검증
  const missing = list.filter((it) => !(productCodeMap.get(it.productId) || "").trim());
  if (missing.length > 0) {
    const names = missing.map((it) => it.name).join(", ");
    return {
      ok: false,
      message: `ECOUNT 품목코드가 설정되지 않은 상품이 있습니다: ${names}. 상품 관리에서 ECOUNT 품목코드를 먼저 입력해주세요.`,
      res: null,
      codes: [],
    };
  }

  const codes = list.map((it) => productCodeMap.get(it.productId)!.trim());

  const url = `${ctx.host}/OAPI/V2/InventoryBasic/SaveBasicProduct?SESSION_ID=${ctx.sid}`;
  // 원칙: 품목코드만 확인/등록, PROD_DES(품목명)는 보내지 않음 — ECOUNT 마스터의 이름을 덼쓰지 않음.
  const ProductList = list.map((it, idx) => ({
    Line: String(idx + 1),
    BulkDatas: {
      PROD_CD: productCodeMap.get(it.productId)!.trim(),
      SIZE_FLAG: "",
      SIZE_DES: "",
      UNIT: "EA",
      PROD_TYPE: "3", // 3 = 상품
      REMARKS_WIN: `니트커피 도매 자동 확인 (상품 ID ${it.productId})`,
    },
  }));
  const body = { ProductList };
  const res = await post(url, body);
  const { error: errStr, treatAsSuccess } = extractRealError(res);
  const status = String(res?.Status) === "200";
  const fail = res?.Data?.FailCnt;
  const noFail = fail === undefined || fail === 0 || fail === "0";
  const ok = status && (treatAsSuccess || (!errStr && noFail));
  const message = treatAsSuccess
    ? `품목 ${list.length}건 이미 등록됨 — 재사용`
    : ok
    ? `품목 ${list.length}건 등록 완료`
    : `실패: ${errStr ?? `Status ${res?.Status ?? "?"}`}`;
  return { ok, message, res, codes };
}

async function saveSaleOnEcount(
  ctx: { s: EcountSettings; sid: string; host: string },
  order: Order,
  custCode: string,
  _custName: string,
  productCodeMap: Map<number, string>,
): Promise<{ ok: boolean; message: string; res: any }> {
  const items: OrderItem[] = JSON.parse(order.items);
  // 관리자가 지정한 주문 일자(ecountDate, YYYY-MM-DD)가 있으면 그 날짜로, 없으면 주문 생성일 기준
  const ioDate =
    order.ecountDate && order.ecountDate.trim()
      ? order.ecountDate.replace(/-/g, "")
      : ymdFromDate(new Date(order.createdAt));
  const url = `${ctx.host}/OAPI/V2/Sale/SaveSale?SESSION_ID=${ctx.sid}`;
  // 원칙: 판매전표에는 거래처코드(CUST = 사업자등록번호)와 품목코드(PROD_CD)만 전송.
  // CUST_DES/PROD_DES 는 보내지 않음 — ECOUNT가 마스터 데이터에서 거래처명/품목명을 자동 매칭함.
  const SaleList = items.map((it, idx) => ({
    Line: String(idx + 1),
    BulkDatas: {
      IO_DATE: ioDate,
      UPLOAD_SER_NO: "1",
      CUST: custCode,
      WH_CD: ctx.s.warehouseCode,
      PROD_CD: (productCodeMap.get(it.productId) || "").trim(),
      QTY: String(it.qty),
      PRICE: String(it.unitPrice),
      SUPPLY_AMT: String(it.amount),
      VAT_AMT: String(Math.round(it.amount * 0.1)),
      REMARKS_WIN: `도매주문 ${order.orderNo}`,
    },
  }));
  const body = { SaleList };
  const res = await post(url, body);
  const { error: errStr, treatAsSuccess } = extractRealError(res);
  const status = String(res?.Status) === "200";
  const succ = res?.Data?.SuccessCnt;
  const fail = res?.Data?.FailCnt;
  const noFail = fail === undefined || fail === 0 || fail === "0";
  const ok = status && !errStr && noFail;
  const message = ok
    ? `판매전표 ${succ ?? items.length}건 등록 완료`
    : `실패: ${errStr ?? `Status ${res?.Status ?? "?"}`}`;
  return { ok, message, res };
}

export async function sendOrderToEcount(orderId: number): Promise<{
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; message: string }>;
  custCode?: string;
}> {
  const order = await storage.getOrder(orderId);
  if (!order) throw new Error(`주문 ${orderId} 을 찾을 수 없습니다.`);
  const customer = await storage.getCustomer(order.customerId);
  if (!customer) throw new Error(`주문의 거래처를 찾을 수 없습니다.`);

  const steps: Array<{ step: string; ok: boolean; message: string }> = [];
  let ctx: { s: EcountSettings; sid: string; host: string };
  const loginT0 = Date.now();
  try {
    ctx = await ensureSession();
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "order",
      refId: order.orderNo,
      ok: true,
      message: "OK",
      durationMs: Date.now() - loginT0,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    steps.push({ step: "세션발급", ok: false, message: msg });
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "order",
      refId: order.orderNo,
      ok: false,
      message: msg,
      durationMs: Date.now() - loginT0,
    });
    return { ok: false, steps };
  }

  // 1) 거래처
  let custCode = "";
  {
    const t0 = Date.now();
    try {
      const r = await upsertCustomerOnEcount(ctx, customer);
      custCode = r.custCode;
      steps.push({ step: "거래처 등록", ok: r.ok, message: r.message });
      await recordLog({
        action: "customer",
        label: "거래처 등록",
        refKind: "order",
        refId: order.orderNo,
        summary: `${customer.businessName} (${customer.bizRegNo || "사업자번호 없음"})`,
        ok: r.ok,
        message: r.message,
        response: r.res,
        durationMs: Date.now() - t0,
      });
      if (!r.ok) return { ok: false, steps, custCode };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      steps.push({ step: "거래처 등록", ok: false, message: msg });
      await recordLog({
        action: "customer",
        label: "거래처 등록",
        refKind: "order",
        refId: order.orderNo,
        summary: customer.businessName,
        ok: false,
        message: msg,
        durationMs: Date.now() - t0,
      });
      return { ok: false, steps };
    }
  }

  // 1.5) 품목 자동 등록 (ECOUNT 에 PROD_CD 가 없으면 판매전표가 미등록코드 오류를 낸다)
  // 상품 마스터에서 ecount_code 를 읽어서 productCodeMap 송이로 전달
  const productCodeMap = new Map<number, string>();
  {
    const items: OrderItem[] = JSON.parse(order.items);
    const uniqIds = Array.from(new Set(items.map((it) => it.productId)));
    for (const pid of uniqIds) {
      const p = await storage.getProduct(pid);
      productCodeMap.set(pid, (p?.ecountCode || "").trim());
    }
  }
  {
    const t0 = Date.now();
    try {
      const items: OrderItem[] = JSON.parse(order.items);
      const r = await upsertProductsOnEcount(ctx, items, productCodeMap);
      steps.push({ step: "품목 등록", ok: r.ok, message: r.message });
      await recordLog({
        action: "product",
        label: "품목 등록",
        refKind: "order",
        refId: order.orderNo,
        summary: r.codes.join(", "),
        ok: r.ok,
        message: r.message,
        response: r.res,
        durationMs: Date.now() - t0,
      });
      if (!r.ok) return { ok: false, steps, custCode };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      steps.push({ step: "품목 등록", ok: false, message: msg });
      await recordLog({
        action: "product",
        label: "품목 등록",
        refKind: "order",
        refId: order.orderNo,
        ok: false,
        message: msg,
        durationMs: Date.now() - t0,
      });
      return { ok: false, steps, custCode };
    }
  }

  // 2) 판매전표
  {
    const t0 = Date.now();
    try {
      const r = await saveSaleOnEcount(ctx, order, custCode, customer.businessName, productCodeMap);
      steps.push({ step: "판매전표 등록", ok: r.ok, message: r.message });
      const items: OrderItem[] = JSON.parse(order.items);
      await recordLog({
        action: "sale",
        label: "판매전표 등록",
        refKind: "order",
        refId: order.orderNo,
        summary: `${customer.businessName} · ${items.length}건 · ${order.totalAmount.toLocaleString()}원`,
        ok: r.ok,
        message: r.message,
        response: r.res,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      steps.push({ step: "판매전표 등록", ok: false, message: msg });
      await recordLog({
        action: "sale",
        label: "판매전표 등록",
        refKind: "order",
        refId: order.orderNo,
        summary: customer.businessName,
        ok: false,
        message: msg,
        durationMs: Date.now() - t0,
      });
    }
  }

  return { ok: steps.every((s) => s.ok), steps, custCode };
}

export async function sendPaymentToEcount(paymentId: number): Promise<{
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; message: string }>;
}> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) throw new Error(`입금 기록 ${paymentId} 을 찾을 수 없습니다.`);
  const customer = await storage.getCustomer(payment.customerId);
  if (!customer) throw new Error(`입금 거래처를 찾을 수 없습니다.`);

  const steps: Array<{ step: string; ok: boolean; message: string }> = [];
  let ctx: { s: EcountSettings; sid: string; host: string };
  const loginT0 = Date.now();
  try {
    ctx = await ensureSession();
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "payment",
      refId: String(paymentId),
      ok: true,
      message: "OK",
      durationMs: Date.now() - loginT0,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    steps.push({ step: "세션발급", ok: false, message: msg });
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "payment",
      refId: String(paymentId),
      ok: false,
      message: msg,
      durationMs: Date.now() - loginT0,
    });
    return { ok: false, steps };
  }

  // 거래처 확인
  let custCode = "";
  {
    const t0 = Date.now();
    try {
      const r = await upsertCustomerOnEcount(ctx, customer);
      custCode = r.custCode;
      steps.push({ step: "거래처 등록", ok: r.ok, message: r.message });
      await recordLog({
        action: "customer",
        label: "거래처 등록",
        refKind: "payment",
        refId: String(paymentId),
        summary: customer.businessName,
        ok: r.ok,
        message: r.message,
        response: r.res,
        durationMs: Date.now() - t0,
      });
      if (!r.ok) return { ok: false, steps };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      steps.push({ step: "거래처 등록", ok: false, message: msg });
      await recordLog({
        action: "customer",
        label: "거래처 등록",
        refKind: "payment",
        refId: String(paymentId),
        summary: customer.businessName,
        ok: false,
        message: msg,
        durationMs: Date.now() - t0,
      });
      return { ok: false, steps };
    }
  }

  // 회계자동분개 (입금)
  const trxDate = payment.paidAt.replace(/-/g, "");
  const url = `${ctx.host}/OAPI/V2/InvoiceAuto/SaveInvoiceAuto?SESSION_ID=${ctx.sid}`;
  const body = {
    InvoiceAutoList: [
      {
        Line: "1",
        BulkDatas: {
          TRX_DATE: trxDate,
          ACCT_DOC_NO: "",
          TAX_GUBUN: "21", // 21 = 수금
          S_NO: "",
          CUST: custCode,
          CUST_DES: customer.businessName,
          SUPPLY_AMT: String(payment.amount),
          VAT_AMT: "0",
          DR_CODE: "10300", // 차변: 보통예금
          CR_CODE: "10800", // 대변: 외상매출금
          REMARKS: `입금 기록 #${payment.id} ${payment.memo || ""}`.trim(),
        },
      },
    ],
  };
  const t0 = Date.now();
  try {
    const res = await post(url, body);
    const { error: errStr } = extractRealError(res);
    const status = String(res?.Status) === "200";
    const ok = status && !errStr;
    const message = ok
      ? `입금 회계자동분개 ${payment.amount.toLocaleString()}원 등록 완료`
      : `실패: ${errStr ?? `Status ${res?.Status ?? "?"}`}`;
    steps.push({ step: "입금 자동분개", ok, message });
    await recordLog({
      action: "payment",
      label: "입금 자동분개",
      refKind: "payment",
      refId: String(paymentId),
      summary: `${customer.businessName} · ${payment.amount.toLocaleString()}원 · ${payment.paidAt}`,
      ok,
      message,
      response: res,
      durationMs: Date.now() - t0,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    steps.push({ step: "입금 자동분개", ok: false, message: msg });
    await recordLog({
      action: "payment",
      label: "입금 자동분개",
      refKind: "payment",
      refId: String(paymentId),
      summary: customer.businessName,
      ok: false,
      message: msg,
      durationMs: Date.now() - t0,
    });
  }

  return { ok: steps.every((s) => s.ok), steps };
}

// ============================================================
// 거래처 단독 등록 (거래처 생성/회원가입 시 자동 호출)
// ============================================================
export async function sendCustomerToEcount(customerId: number): Promise<{
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; message: string }>;
  custCode?: string;
}> {
  const customer = await storage.getCustomer(customerId);
  if (!customer) throw new Error(`거래처 ${customerId} 를 찾을 수 없습니다.`);

  const steps: Array<{ step: string; ok: boolean; message: string }> = [];
  let ctx: { s: EcountSettings; sid: string; host: string };
  const loginT0 = Date.now();
  try {
    ctx = await ensureSession();
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "customer",
      refId: String(customerId),
      ok: true,
      message: "OK",
      durationMs: Date.now() - loginT0,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    steps.push({ step: "세션발급", ok: false, message: msg });
    await recordLog({
      action: "login",
      label: "세션발급",
      refKind: "customer",
      refId: String(customerId),
      ok: false,
      message: msg,
      durationMs: Date.now() - loginT0,
    });
    return { ok: false, steps };
  }

  let custCode = "";
  const t0 = Date.now();
  try {
    const r = await upsertCustomerOnEcount(ctx, customer);
    custCode = r.custCode;
    steps.push({ step: "거래처 등록", ok: r.ok, message: r.message });
    await recordLog({
      action: "customer",
      label: "거래처 등록",
      refKind: "customer",
      refId: String(customerId),
      summary: `${customer.businessName} (${customer.bizRegNo || "사업자번호 없음"})`,
      ok: r.ok,
      message: r.message,
      response: r.res,
      durationMs: Date.now() - t0,
    });
    return { ok: r.ok, steps, custCode };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    steps.push({ step: "거래처 등록", ok: false, message: msg });
    await recordLog({
      action: "customer",
      label: "거래처 등록",
      refKind: "customer",
      refId: String(customerId),
      summary: customer.businessName,
      ok: false,
      message: msg,
      durationMs: Date.now() - t0,
    });
    return { ok: false, steps, custCode };
  }
}
