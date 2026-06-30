import { Resend } from "resend";

// Resend SDK 게으른 초기화 — 실제 메일 발송 시점에만 생성
let _resend: Resend | null = null;
let _resendChecked = false;

function getResend(): Resend | null {
  if (_resendChecked) return _resend;
  _resendChecked = true;
  const key = process.env.RESEND_API_KEY;
  if (!key || key.trim() === "") {
    console.warn("[email] RESEND_API_KEY 없음 — 메일 발송 비활성화");
    return null;
  }
  try {
    _resend = new Resend(key.trim());
    console.log("[email] Resend SDK 초기화 완료");
    return _resend;
  } catch (e) {
    console.error("[email] Resend 초기화 실패:", e);
    return null;
  }
}

const MAIL_FROM = process.env.MAIL_FROM || "onboarding@resend.dev";
const NOTIFY_TO = process.env.NOTIFY_TO || "";

// 메일 헤더 로고 (PNG — Gmail 등 모든 메일 클라이언트 호환).
// PUBLIC_URL이 설정되어 있으면 그 도메인의 PNG를 사용.
const PUBLIC_BASE = (process.env.PUBLIC_URL || "https://wholesale.knitcoffee.co.kr").replace(/\/+$/, "");
const LOGO_URL = `${PUBLIC_BASE}/knit-logo-horizontal.png`;
const LOGO_HTML = `<img src="${LOGO_URL}" alt="knit COFFEE" width="112" height="28" style="display:block;border:0;outline:none;text-decoration:none;height:28px;width:112px;" />`;

// ===== 공통 유틸 =====
function fmtKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

// ===== 인터페이스 =====
export interface OrderEmailPayload {
  orderNo: string;
  businessName: string;
  managerName: string;
  phone: string;
  totalAmount: number;
  supplyAmount: number;
  vat: number;
  items: Array<{ name: string; qty: number; unitPrice: number; amount: number }>;
  desiredDate: string;
  note: string;
  createdAt: number;
}

export interface OrderProcessedPayload {
  orderId: number;
  orderNo: string;
  businessName: string;
  taxEmail: string;
  items: Array<{ name: string; qty: number; unitPrice?: number; amount?: number }>;
}

export interface OrderUpdatedPayload {
  orderId: number;
  orderNo: string;
  businessName: string;
  taxEmail: string;
}

export interface OrderMergedEmailPayload {
  orderNo: string;
  businessName: string;
  managerName: string;
  phone: string;
  addedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }>;
  newSupplyAmount: number;
  newVat: number;
  newTotalAmount: number;
}

// ===== 공통 메일 래퍼: RESEND_API_KEY 없으면 건너뜀, 실패해도 메인 흐름 불가 =====
async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY 미설정 — 메일 발송 건너뜀:", opts.subject);
    return;
  }
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] Resend 미초기화 — 메일 스킵");
      return;
    }
    const result = await resend.emails.send({
      from: MAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (result.error) {
      console.error("[email] Resend 발송 오류:", result.error);
    } else {
      console.log("[email] 발송 완료:", { id: result.data?.id, subject: opts.subject });
    }
  } catch (err) {
    console.error("[email] 발송 실패 (catch):", err);
  }
}

// ===== 신규 주문 관리자 알림 =====
export async function sendNewOrderEmail(payload: OrderEmailPayload) {
  if (!NOTIFY_TO) {
    console.warn("[email] NOTIFY_TO 미설정 — 신규 주문 알림 건너뜀");
    return;
  }

  const itemRows = payload.items
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #ebebeb;color:#222;">${escapeHtml(i.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ebebeb;text-align:right;color:#222;">${i.qty}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ebebeb;text-align:right;color:#444;">${fmtKRW(i.unitPrice)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ebebeb;text-align:right;color:#222;font-weight:600;">${fmtKRW(i.amount)}</td>
        </tr>`,
    )
    .join("");

  const logoHtml = LOGO_HTML;

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ebebeb;overflow:hidden;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      ${logoHtml}
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;letter-spacing:-0.01em;">신규 도매 주문이 들어왔습니다.</div>
      <div style="margin-top:4px;font-size:12px;color:#888;letter-spacing:0.04em;">New wholesale order received</div>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#888;width:120px;">주문번호</td><td style="padding:6px 0;font-weight:600;color:#111;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(payload.orderNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">거래처</td><td style="padding:6px 0;color:#222;">${escapeHtml(payload.businessName)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">담당자</td><td style="padding:6px 0;color:#222;">${escapeHtml(payload.managerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">연락처</td><td style="padding:6px 0;color:#222;">${escapeHtml(payload.phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">주문 시각</td><td style="padding:6px 0;color:#222;">${fmtDate(payload.createdAt)} KST</td></tr>
      </table>

      <div style="margin-top:28px;font-size:11px;font-weight:600;color:#888;letter-spacing:0.14em;text-transform:uppercase;">주문 상품 · Order items</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px;border-top:2px solid #111;">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;font-weight:600;color:#666;font-size:12px;letter-spacing:0.06em;border-bottom:1px solid #ebebeb;">상품</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;color:#666;font-size:12px;letter-spacing:0.06em;width:60px;border-bottom:1px solid #ebebeb;">수량</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;color:#666;font-size:12px;letter-spacing:0.06em;width:110px;border-bottom:1px solid #ebebeb;">단가</th>
            <th style="padding:10px 12px;text-align:right;font-weight:600;color:#666;font-size:12px;letter-spacing:0.06em;width:120px;border-bottom:1px solid #ebebeb;">금액</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <table style="width:100%;margin-top:18px;font-size:14px;">
        <tr><td style="padding:4px 0;color:#888;text-align:right;">공급가액</td><td style="padding:4px 0;text-align:right;width:140px;color:#222;">${fmtKRW(payload.supplyAmount)}</td></tr>
        <tr><td style="padding:4px 0;color:#888;text-align:right;">부가세 (10%)</td><td style="padding:4px 0;text-align:right;color:#222;">${fmtKRW(payload.vat)}</td></tr>
        <tr><td style="padding:10px 0;color:#111;font-weight:600;text-align:right;border-top:2px solid #111;">총 합계</td><td style="padding:10px 0;text-align:right;font-weight:700;font-size:16px;border-top:2px solid #111;color:#111;">${fmtKRW(payload.totalAmount)}</td></tr>
      </table>

      ${payload.note ? `<div style="margin-top:24px;padding:14px 16px;background:#f6f6f6;border-left:3px solid #111;font-size:13px;color:#222;"><strong style="color:#666;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:6px;">요청사항</strong>${escapeHtml(payload.note)}</div>` : ""}

      <div style="margin-top:32px;text-align:center;">
        <a href="${process.env.PUBLIC_URL || "https://web-production-afb9f.up.railway.app"}/#/admin/orders" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.06em;">관리자 페이지에서 보기</a>
      </div>
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #ebebeb;text-align:center;font-size:11px;color:#999;letter-spacing:0.04em;">
      Knit Coffee Wholesale · 자동 발송 메일
    </div>
  </div>
</body></html>`;

  const text =
    `[니트커피] 신규 도매 주문\n\n` +
    `주문번호: ${payload.orderNo}\n` +
    `거래처: ${payload.businessName} (${payload.managerName})\n` +
    `연락처: ${payload.phone}\n` +
    `합계: ${fmtKRW(payload.totalAmount)} (공급 ${fmtKRW(payload.supplyAmount)} + VAT ${fmtKRW(payload.vat)})\n` +
    `주문 시각: ${fmtDate(payload.createdAt)} KST\n\n` +
    `상품:\n` +
    payload.items.map((i) => `  · ${i.name} × ${i.qty} = ${fmtKRW(i.amount)}`).join("\n") +
    (payload.note ? `\n\n요청사항: ${payload.note}` : "") +
    `\n\n— 니트커피\n`;

  await sendEmail({
    to: NOTIFY_TO,
    subject: `[니트커피] 신규 주문 ${payload.orderNo} · ${payload.businessName} · ${fmtKRW(payload.totalAmount)}`,
    html,
    text,
  });
}

// ===== 처리완료 메일 =====
export async function sendOrderProcessedEmail(payload: OrderProcessedPayload, baseUrl?: string) {
  if (!payload.taxEmail || payload.taxEmail.trim() === "") {
    console.log("[email] taxEmail 비어있음 — 처리완료 메일 건너뜀", { orderNo: payload.orderNo });
    return;
  }

  const invoiceUrl = `${baseUrl || process.env.PUBLIC_URL || "https://web-production-afb9f.up.railway.app"}/#/invoice/${payload.orderId}`;
  const itemLines = payload.items.map((i) => `  · ${escapeHtml(i.name)} × ${i.qty}`).join("<br>");
  const itemText = payload.items.map((i) => `  · ${i.name} × ${i.qty}`).join("\n");

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ebebeb;overflow:hidden;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      ${LOGO_HTML}
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;">주문 처리완료 안내</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.8;color:#222;">
      <p>안녕하세요, ${escapeHtml(payload.businessName)}님.</p>
      <p>주문하신 <strong>${escapeHtml(payload.orderNo)}</strong>이(가) 처리완료되었습니다.<br>감사합니다.</p>

      <div style="margin-top:20px;padding:16px;background:#f9f9f9;border:1px solid #ebebeb;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:10px;">▣ 주문 항목</div>
        <div>${itemLines}</div>
      </div>

      <div style="margin-top:20px;padding:16px;background:#f9f9f9;border:1px solid #ebebeb;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:10px;">▣ 배송 안내</div>
        <p style="margin:0;">평일 오후 12시 이후 접수된 주문은 다음 영업일에 택배로 출고됩니다.<br>(주말·공휴일 접수 건은 다음 영업일 기준으로 처리됩니다.)</p>
      </div>

      <div style="margin-top:20px;padding:16px;background:#f9f9f9;border:1px solid #ebebeb;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:10px;">▣ 인보이스</div>
        <a href="${invoiceUrl}" style="color:#111;font-weight:600;">${invoiceUrl}</a>
      </div>

      <div style="margin-top:20px;padding:16px;background:#f9f9f9;border:1px solid #ebebeb;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:10px;">문의</div>
        <p style="margin:0;">
          · 카카오톡 채널: <a href="http://pf.kakao.com/_xiLQFG/chat" style="color:#111;">http://pf.kakao.com/_xiLQFG/chat</a><br>
          · 이메일: knitcoffee00@gmail.com
        </p>
      </div>
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #ebebeb;text-align:center;font-size:11px;color:#999;">
      — 니트커피
    </div>
  </div>
</body></html>`;

  const text =
    `안녕하세요, ${payload.businessName}님.\n\n` +
    `주문하신 ${payload.orderNo}이(가) 처리완료되었습니다.\n감사합니다.\n\n` +
    `▣ 주문 항목\n${itemText}\n\n` +
    `▣ 배송 안내\n  평일 오후 12시 이후 접수된 주문은 다음 영업일에 택배로 출고됩니다.\n  (주말·공휴일 접수 건은 다음 영업일 기준으로 처리됩니다.)\n\n` +
    `▣ 인보이스\n  ${invoiceUrl}\n\n` +
    `문의는 아래로 부탁드립니다.\n` +
    `  · 카카오톡 채널: http://pf.kakao.com/_xiLQFG/chat\n` +
    `  · 이메일: knitcoffee00@gmail.com\n\n` +
    `— 니트커피\n`;

  await sendEmail({
    to: payload.taxEmail,
    subject: `[니트커피] 주문 ${payload.orderNo} 처리완료 안내`,
    html,
    text,
  });
}

// ===== 주문 수정 안내 메일 =====
export async function sendOrderUpdatedEmail(payload: OrderUpdatedPayload, baseUrl?: string) {
  if (!payload.taxEmail || payload.taxEmail.trim() === "") {
    console.log("[email] taxEmail 비어있음 — 주문 수정 메일 건너뜀", { orderNo: payload.orderNo });
    return;
  }

  const orderUrl = `${baseUrl || process.env.PUBLIC_URL || "https://web-production-afb9f.up.railway.app"}/#/orders/${payload.orderId}`;

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ebebeb;overflow:hidden;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      ${LOGO_HTML}
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;">주문 수정 안내</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.8;color:#222;">
      <p>안녕하세요, ${escapeHtml(payload.businessName)} 담당자님.</p>
      <p>니트커피 주문 <strong>#${escapeHtml(payload.orderNo)}</strong> 가 관리자에 의해 수정되었습니다.<br>변경된 내용은 사이트에서 확인해 주세요.</p>

      <div style="margin-top:24px;text-align:center;">
        <a href="${orderUrl}" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.06em;">주문 확인</a>
      </div>

      <div style="margin-top:24px;padding:16px;background:#f9f9f9;border:1px solid #ebebeb;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-bottom:10px;">문의</div>
        <p style="margin:0;">knitcoffee00@gmail.com</p>
      </div>
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #ebebeb;text-align:center;font-size:11px;color:#999;">
      — 니트커피
    </div>
  </div>
</body></html>`;

  const text =
    `안녕하세요, ${payload.businessName} 담당자님.\n\n` +
    `니트커피 주문 #${payload.orderNo} 가 관리자에 의해 수정되었습니다.\n` +
    `변경된 내용은 사이트에서 확인해 주세요.\n\n` +
    `[주문 확인] ${orderUrl}\n\n` +
    `문의: knitcoffee00@gmail.com\n` +
    `니트커피\n`;

  await sendEmail({
    to: payload.taxEmail,
    subject: `[니트커피] 주문이 수정되었습니다 (주문번호 ${payload.orderNo})`,
    html,
    text,
  });
}

// ===== 비밀번호 재설정 안내 메일 =====
export async function sendPasswordResetEmail(toEmail: string, resetUrl: string) {
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ebebeb;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      ${LOGO_HTML}
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;">비밀번호 재설정 안내</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.9;color:#222;">
      <p>니트커피 도매 거래처 시스템에서 비밀번호 재설정이 요청되었습니다.</p>
      <p>아래 버튼을 클릭하여 1시간 이내에 비밀번호를 재설정해 주세요.<br>요청하지 않으셨다면 이 메일을 무시하셔도 됩니다.</p>
      <div style="margin:28px 0;text-align:center;">
        <a href="${resetUrl}" style="display:inline-block;padding:13px 32px;background:#111;color:#fff;text-decoration:none;font-size:14px;letter-spacing:0.06em;">비밀번호 재설정하기</a>
      </div>
      <p style="font-size:12px;color:#888;">또는 아래 링크를 브라우저에 직접 입력하세요:<br>
        <a href="${resetUrl}" style="color:#111;word-break:break-all;">${resetUrl}</a>
      </p>
      <p style="font-size:12px;color:#aaa;">이 링크는 발송 후 1시간 동안만 유효합니다.</p>
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #ebebeb;text-align:center;font-size:11px;color:#999;">
      Knit Coffee Wholesale &middot; 자동 발송 메일
    </div>
  </div>
</body></html>`;

  const text =
    `[니트커피 도매] 비밀번호 재설정 안내\n\n` +
    `비밀번호 재설정을 위해 아래 링크를 클릭하세요 (1시간 유효).\n\n` +
    `${resetUrl}\n\n` +
    `요청하지 않으셨다면 이 메일을 무시하세요.\n\n` +
    `— 니트커피\n`;

  await sendEmail({
    to: toEmail,
    subject: `[니트커피 도매] 비밀번호 재설정 안내`,
    html,
    text,
  });
}

// ===== 주문 추가(머지) 관리자 알림 메일 =====
export async function sendOrderMergedEmail(payload: OrderMergedEmailPayload) {
  if (!NOTIFY_TO) {
    console.warn("[email] NOTIFY_TO 미설정 — 주문 추가 알림 건너뜀");
    return;
  }

  const itemRows = payload.addedItems
    .map(
      (i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #ebebeb;">${escapeHtml(i.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ebebeb;text-align:center;">${i.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ebebeb;text-align:right;">${fmtKRW(i.unitPrice)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ebebeb;text-align:right;">${fmtKRW(i.amount)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #ddd;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      ${LOGO_HTML}
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;">주문 항목 추가됨</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.8;color:#222;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr><th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;border-bottom:2px solid #111;">거래처</th><td style="padding:6px 12px;border-bottom:2px solid #111;">${escapeHtml(payload.businessName)}</td></tr>
        <tr><th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;border-bottom:1px solid #ebebeb;">담당자</th><td style="padding:6px 12px;border-bottom:1px solid #ebebeb;">${escapeHtml(payload.managerName)}</td></tr>
        <tr><th style="text-align:left;padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;border-bottom:1px solid #ebebeb;">주문번호</th><td style="padding:6px 12px;border-bottom:1px solid #ebebeb;">${escapeHtml(payload.orderNo)}</td></tr>
      </table>
      <div style="margin:20px 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#888;">추가된 항목</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9f9f9;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #111;">상품명</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #111;">수량</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #111;">단가</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #111;">금액</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr><td style="padding:6px 12px;text-align:right;color:#888;font-size:13px;">갱신된 공급가액</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${fmtKRW(payload.newSupplyAmount)}</td></tr>
        <tr><td style="padding:6px 12px;text-align:right;color:#888;font-size:13px;">부가세 (10%)</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${fmtKRW(payload.newVat)}</td></tr>
        <tr style="border-top:2px solid #111;"><td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;">총 합계</td><td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;">${fmtKRW(payload.newTotalAmount)}</td></tr>
      </table>
    </div>
    <div style="padding:16px 28px;background:#fafafa;border-top:1px solid #ebebeb;text-align:center;font-size:11px;color:#999;">
      — 니트커피
    </div>
  </div>
</body></html>`;

  const text =
    `[주문 항목 추가]\n` +
    `거래처: ${payload.businessName} (${payload.managerName})\n` +
    `주문번호: ${payload.orderNo}\n\n` +
    `추가된 항목:\n` +
    payload.addedItems.map((i) => `  - ${i.name} × ${i.qty} = ${fmtKRW(i.amount)}`).join("\n") +
    `\n\n갱신된 공급가액: ${fmtKRW(payload.newSupplyAmount)}\n` +
    `부가세: ${fmtKRW(payload.newVat)}\n` +
    `총 합계: ${fmtKRW(payload.newTotalAmount)}\n\n` +
    `니트커피\n`;

  await sendEmail({
    to: NOTIFY_TO,
    subject: `[니트커피] 주문 추가 - ${payload.businessName} (#${payload.orderNo})`,
    html,
    text,
  });
}
