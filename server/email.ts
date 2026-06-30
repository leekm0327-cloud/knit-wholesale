import nodemailer from "nodemailer";
import path from "node:path";
import fs from "node:fs";

// 진단: 모듈 로드 시점에 환경변수 상태를 1회 출력
console.log("[email] 모듈 로드 시점 env 확인:", {
  SMTP_USER_set: !!process.env.SMTP_USER,
  SMTP_USER_len: (process.env.SMTP_USER || "").length,
  SMTP_PASS_set: !!process.env.SMTP_PASS,
  SMTP_PASS_len: (process.env.SMTP_PASS || "").length,
  NOTIFY_TO_set: !!process.env.NOTIFY_TO,
  NODE_ENV: process.env.NODE_ENV,
});

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  // 런타임에 매번 process.env에서 읽어 캐시 우회 (모듈 톱 레벨 캡처 회피)
  const SMTP_USER = process.env.SMTP_USER || "";
  const SMTP_PASS = process.env.SMTP_PASS || "";
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("[email] getTransporter() → null 반환. SMTP_USER 또는 SMTP_PASS 비어있음.");
    return null;
  }
  if (!transporter) {
    console.log("[email] transporter 최초 생성:", { user: SMTP_USER });
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// 런타임에서 NOTIFY_TO 동적 조회
function getNotifyTo() {
  return process.env.NOTIFY_TO || process.env.SMTP_USER || "";
}

// 기존 코드 호환을 위한 상수형 alias (런타임 값 readonly accessor)
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const NOTIFY_TO = process.env.NOTIFY_TO || SMTP_USER;

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

function fmtKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  // KST 보정
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// 로고 파일은 빌드 후 dist/public/ 또는 client/public/ 에 존재.
function findLogoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "dist", "public", "knit-logo-horizontal.png"),
    path.join(process.cwd(), "client", "public", "knit-logo-horizontal.png"),
    path.join(__dirname, "public", "knit-logo-horizontal.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* noop */
    }
  }
  return null;
}

export async function sendNewOrderEmail(payload: OrderEmailPayload) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP_USER/SMTP_PASS 미설정 — 메일 발송 건너뜀");
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

  const logoPath = findLogoPath();
  const logoHtml = logoPath
    ? `<img src="cid:knit-logo" alt="knit COFFEE" style="display:block;height:36px;width:auto;" />`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.02em;color:#111;">knit <span style="font-family:-apple-system,Arial,sans-serif;font-size:18px;letter-spacing:0.3em;font-weight:600;">COFFEE</span></div>`;

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
        <a href="https://knit-wholesale-v3.pplx.app/#/admin/orders" style="display:inline-block;padding:12px 28px;background:#111;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.06em;">관리자 페이지에서 보기</a>
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
    `\n\n관리자 페이지: https://knit-wholesale-v3.pplx.app/#/admin/orders\n`;

  try {
    await t.sendMail({
      from: `"니트커피 도매" <${SMTP_USER}>`,
      to: NOTIFY_TO,
      subject: `[니트커피] 신규 주문 ${payload.orderNo} · ${payload.businessName} · ${fmtKRW(payload.totalAmount)}`,
      text,
      html,
      attachments: logoPath
        ? [
            {
              filename: "knit-logo.png",
              path: logoPath,
              cid: "knit-logo",
            },
          ]
        : [],
    });
    console.log(`[email] 알림 메일 전송 완료 → ${NOTIFY_TO} (${payload.orderNo})`);
  } catch (err) {
    console.error("[email] 메일 발송 실패:", err);
  }
}

// ===== 처리완료 메일 (#7) =====
export async function sendOrderProcessedEmail(payload: OrderProcessedPayload) {
  if (!payload.taxEmail || payload.taxEmail.trim() === "") {
    console.log("[email] taxEmail 비어있음 — 발송 건너뜀", { orderNo: payload.orderNo });
    return;
  }
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP_USER/SMTP_PASS 미설정 — 처리완료 메일 건너뜀");
    return;
  }

  const itemLines = payload.items.map((i) => `  · ${escapeHtml(i.name)} × ${i.qty}`).join("<br>");
  const itemText = payload.items.map((i) => `  · ${i.name} × ${i.qty}`).join("\n");
  const invoiceUrl = `https://knit-wholesale-v3.pplx.app/#/invoice/${payload.orderId}`;

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ebebeb;overflow:hidden;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.02em;color:#111;">knit <span style="font-family:-apple-system,Arial,sans-serif;font-size:18px;letter-spacing:0.3em;font-weight:600;">COFFEE</span></div>
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

  try {
    await t.sendMail({
      from: `"니트커피" <${SMTP_USER}>`,
      to: payload.taxEmail,
      subject: `[니트커피] 주문 ${payload.orderNo} 처리완료 안내`,
      text,
      html,
    });
    console.log(`[email] 처리완료 메일 전송 완료 → ${payload.taxEmail} (${payload.orderNo})`);
  } catch (err) {
    console.error("[email] 처리완료 메일 발송 실패:", err);
  }
}

// ===== 주문 수정 안내 메일 (#11) =====
export interface OrderUpdatedPayload {
  orderId: number;
  orderNo: string;
  businessName: string;
  taxEmail: string;
}

export async function sendOrderUpdatedEmail(payload: OrderUpdatedPayload) {
  if (!payload.taxEmail || payload.taxEmail.trim() === "") {
    console.log("[email] taxEmail 비어있음 — 발송 건너뜀", { orderNo: payload.orderNo });
    return;
  }
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP_USER/SMTP_PASS 미설정 — 주문 수정 메일 건너뜀");
    return;
  }

  const orderUrl = `https://knit-wholesale-v3.pplx.app/#/orders/${payload.orderId}`;

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ebebeb;overflow:hidden;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.02em;color:#111;">knit <span style="font-family:-apple-system,Arial,sans-serif;font-size:18px;letter-spacing:0.3em;font-weight:600;">COFFEE</span></div>
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
        <p style="margin:0;">02-XXXX-XXXX</p>
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
    `문의: 02-XXXX-XXXX\n` +
    `니트커피\n`;

  try {
    await t.sendMail({
      from: `"니트커피" <${SMTP_USER}>`,
      to: payload.taxEmail,
      subject: `[니트커피] 주문이 수정되었습니다 (주문번호 ${payload.orderNo})`,
      text,
      html,
    });
    console.log(`[email] 주문 수정 메일 전송 완료 → ${payload.taxEmail} (${payload.orderNo})`);
  } catch (err) {
    console.error("[email] 주문 수정 메일 발송 실패:", err);
  }
}

// ===== V8 #26: 비밀번호 재설정 안내 메일 =====
export async function sendPasswordResetEmail(toEmail: string, resetUrl: string) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP_USER/SMTP_PASS 미설정 — 비밀번호 재설정 메일 발송 건너끨");
    return;
  }

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:32px 16px;background:#f6f6f6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ebebeb;">
    <div style="padding:28px 28px 24px;border-bottom:1px solid #ebebeb;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.02em;color:#111;">knit <span style="font-family:-apple-system,Arial,sans-serif;font-size:18px;letter-spacing:0.3em;font-weight:600;">COFFEE</span></div>
      <div style="margin-top:14px;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#111;">비밀번호 재설정 안내</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.9;color:#222;">
      <p>니트커피 도매 거래처 시스템에서 비밀번호 재설정이 요청되었습니다.</p>
      <p>아래 버튼을 클릭하여 1시간 이내에 비밀번호를 재설정해 주세요.<br>요청하지 않으셨다면 이 메일을 무시하셨도 됩니다.</p>
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

  try {
    await t.sendMail({
      from: `"니트커피" <${SMTP_USER}>`,
      to: toEmail,
      subject: `[니트커피 도매] 비밀번호 재설정 안내`,
      text,
      html,
    });
    console.log(`[email] 비밀번호 재설정 메일 전송 완료 → ${toEmail}`);
  } catch (err) {
    console.error("[email] 비밀번호 재설정 메일 발송 실패:", err);
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

// ===== V7 #23C: 주문 누적(추가) 관리자 알림 메일 =====
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

export async function sendOrderMergedEmail(payload: OrderMergedEmailPayload) {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP_USER/SMTP_PASS 미설정 — 주문 추가 메일 발송 건너뜀");
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
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.02em;color:#111;">knit <span style="font-family:-apple-system,Arial,sans-serif;font-size:18px;letter-spacing:0.3em;font-weight:600;">COFFEE</span></div>
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

  try {
    await t.sendMail({
      from: `"니트커피" <${SMTP_USER}>`,
      to: NOTIFY_TO,
      subject: `[니트커피] 주문 추가 - ${payload.businessName} (#${payload.orderNo})`,
      text,
      html,
    });
    console.log(`[email] 주문 추가 알림 메일 전송 완료 (${payload.orderNo})`);
  } catch (err) {
    console.error("[email] 주문 추가 알림 메일 발송 실패:", err);
  }
}
