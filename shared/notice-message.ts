import { z } from "zod";

export const NOTICE_MESSAGE_URL = "https://wholesale.knitcoffee.co.kr/#/catalog";
export const NOTICE_MESSAGE_BUTTON = "주문 사이트로 이동";
export const NOTICE_MESSAGE_LIMIT = 500;
export const prepareNoticeMessageSchema = z.object({
  noticeId: z.number().int().positive(),
  text: z.string().trim().min(1, "메시지 내용을 입력해 주세요.").max(1300),
  includeImage: z.boolean(),
  customerIds: z.array(z.number().int().positive()).max(NOTICE_MESSAGE_LIMIT),
  mode: z.enum(["test", "live"]),
}).strict().superRefine((v, ctx) => {
  const limit = v.includeImage ? 400 : 1300;
  const lines = v.includeImage ? 29 : 99;
  if (v.text.length > limit || (v.text.match(/\n/g) || []).length > lines)
    ctx.addIssue({ code: "custom", message: `메시지는 ${limit}자, 줄바꿈 ${lines}개 이내로 작성해 주세요.` });
  if (v.mode === "live" && !v.customerIds.length)
    ctx.addIssue({ code: "custom", message: "받을 거래처를 선택해 주세요." });
  if (v.mode === "test" && v.customerIds.length)
    ctx.addIssue({ code: "custom", message: "테스트는 설정된 테스트 번호로만 보냅니다." });
});

export function normalizeNoticePhone(value: string): string {
  const trimmed = value.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) return "";
  let phone = trimmed.replace(/[^\d]/g, "");
  if (phone.startsWith("82")) phone = "0" + phone.slice(2);
  return /^(010\d{8}|01[16789]\d{7,8})$/.test(phone) ? phone : "";
}

export type NoticeRecipient = {
  id: number; name: string; phone: string; recent: boolean; reason: string;
};
export type NoticeMessageStatus = "queued" | "accepted" | "delivered" | "failed" | "unknown";
export type NoticeMessageRecipientResult = {
  customerId: number; name: string; phone: string; status: NoticeMessageStatus; detail: string;
};
export type NoticeMessageBatch = {
  id: string; noticeId: number; title: string; mode: "test" | "live";
  text: string; imageUrl: string; buttonUrl: string; channelName: string;
  status: string; createdAt: number; expiresAt: number; unitPrice: number; total: number;
  recipients: NoticeMessageRecipientResult[]; exclusions: { name: string; reason: string }[];
};
export type NoticeMessageContext = {
  ready: boolean; reasons: string[]; channelName: string; testPhone: string;
  recipients: NoticeRecipient[]; history: Omit<NoticeMessageBatch, "imageUrl" | "text">[];
};
