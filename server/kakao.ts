// ===== F: 카카오톡 "나에게 보내기" 알림 =====
// 사장님 본인 카카오톡으로 이벤트 알림을 보낸다. (memo/default/send API, 무료·심사 불필요)
// 환경변수(KAKAO_REST_API_KEY / KAKAO_CLIENT_SECRET / KAKAO_REDIRECT_URI)가 없으면 조용히 비활성.
// Node 18+ 내장 fetch 사용.

import { storage } from "./storage";

const AUTH_HOST = "https://kauth.kakao.com";
const API_HOST = "https://kapi.kakao.com";

function restApiKey(): string {
  return process.env.KAKAO_REST_API_KEY ?? "";
}
function clientSecret(): string {
  return process.env.KAKAO_CLIENT_SECRET ?? "";
}
function redirectUri(): string {
  return process.env.KAKAO_REDIRECT_URI ?? "https://wholesale.knitcoffee.co.kr/oauth/kakao/callback";
}

// 카카오 알림 기능 사용 가능 여부 (REST API 키 존재)
export function isKakaoConfigured(): boolean {
  return restApiKey().length > 0;
}

// OAuth 인가 URL — 사용자를 카카오 로그인으로 보낸다.
export function getKakaoAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: restApiKey(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "talk_message",
  });
  return `${AUTH_HOST}/oauth/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number; // 초
  refresh_token_expires_in?: number; // 초
  error?: string;
  error_description?: string;
};

// 인가 코드 → 토큰 발급 후 저장.
export async function exchangeCodeForToken(code: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: restApiKey(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: body.toString(),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(`카카오 토큰 발급 실패: ${data.error_description ?? data.error ?? res.status}`);
  }
  const now = Date.now();
  await storage.upsertKakaoTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    accessTokenExpiresAt: now + (data.expires_in ?? 0) * 1000,
    refreshTokenExpiresAt: now + (data.refresh_token_expires_in ?? 0) * 1000,
  });
}

// refresh_token 으로 access_token 재발급 후 저장. 성공 시 새 access_token 반환.
async function refreshAccessToken(): Promise<string | null> {
  const tokens = await storage.getKakaoTokens();
  if (!tokens || !tokens.refreshToken) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: restApiKey(),
    client_secret: clientSecret(),
    refresh_token: tokens.refreshToken,
  });
  const res = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: body.toString(),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    console.warn("[kakao] 토큰 갱신 실패:", data.error_description ?? data.error ?? res.status);
    return null;
  }
  const now = Date.now();
  await storage.upsertKakaoTokens({
    accessToken: data.access_token,
    accessTokenExpiresAt: now + (data.expires_in ?? 0) * 1000,
    // refresh_token 은 재발급될 때만 갱신
    ...(data.refresh_token
      ? {
          refreshToken: data.refresh_token,
          refreshTokenExpiresAt: now + (data.refresh_token_expires_in ?? 0) * 1000,
        }
      : {}),
  });
  return data.access_token;
}

// 유효한 access_token 확보 (만료 임박이면 refresh). 없으면 null.
async function getValidAccessToken(): Promise<string | null> {
  const tokens = await storage.getKakaoTokens();
  if (!tokens || !tokens.accessToken) return null;
  // 만료 1분 이내면 미리 갱신
  if (tokens.accessTokenExpiresAt - Date.now() < 60_000) {
    return (await refreshAccessToken()) ?? tokens.accessToken;
  }
  return tokens.accessToken;
}

// 연동 상태 조회용 (UI 표시)
export async function getKakaoStatus(): Promise<{
  configured: boolean;
  linked: boolean;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  updatedAt: number;
}> {
  const tokens = await storage.getKakaoTokens();
  return {
    configured: isKakaoConfigured(),
    linked: !!tokens?.accessToken,
    accessTokenExpiresAt: tokens?.accessTokenExpiresAt ?? 0,
    refreshTokenExpiresAt: tokens?.refreshTokenExpiresAt ?? 0,
    updatedAt: tokens?.updatedAt ?? 0,
  };
}

async function postMemo(accessToken: string, text: string, linkUrl?: string): Promise<Response> {
  const url = linkUrl || "https://wholesale.knitcoffee.co.kr/#/admin";
  const templateObject = {
    object_type: "text",
    text,
    link: { web_url: url, mobile_web_url: url },
    button_title: "확인",
  };
  const body = new URLSearchParams({ template_object: JSON.stringify(templateObject) });
  return fetch(`${API_HOST}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: body.toString(),
  });
}

// 나에게 보내기 발송. 실패해도 예외를 던지지 않고 false 반환(앱 흐름 방해 금지).
export async function sendKakaoMemo(text: string, linkUrl?: string): Promise<boolean> {
  try {
    if (!isKakaoConfigured()) return false; // 환경변수 미설정 → 조용히 skip
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      await logKakao("skip", `카카오 미연동으로 알림 skip: ${text.slice(0, 40)}`);
      return false;
    }
    let res = await postMemo(accessToken, text, linkUrl);
    if (res.status === 401) {
      // 토큰 만료 가능 → 1회 refresh 후 재시도
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        accessToken = refreshed;
        res = await postMemo(accessToken, text, linkUrl);
      }
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      await logKakao("fail", `카카오 발송 실패(${res.status}): ${detail.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    await logKakao("error", `카카오 발송 예외: ${e?.message ?? e}`);
    return false;
  }
}

// 카카오 관련 이벤트를 활동 로그로 남긴다 (system actor).
async function logKakao(kind: string, summary: string): Promise<void> {
  try {
    await storage.logActivity({
      actorUserId: 0,
      actorEmail: "system",
      actorRole: "system",
      action: `kakao.${kind}`,
      targetType: "system",
      summary,
    });
  } catch {
    // 로그 실패는 무시
  }
}
