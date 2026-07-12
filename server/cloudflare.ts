// Cloudflare Web Analytics (RUM) 조회 — GraphQL Analytics API
// 필요한 환경변수:
//   CLOUDFLARE_API_TOKEN            (필수) — Account Analytics: Read 권한의 읽기 전용 토큰
//   CLOUDFLARE_ACCOUNT_ID           (선택) — 기본값 사용
//   CLOUDFLARE_WEB_ANALYTICS_SITE_TAG (선택) — 기본값(beacon 토큰) 사용

const CF_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const DEFAULT_ACCOUNT = "d6885cf3ab98a928851a65f36609a095";
const DEFAULT_SITE_TAG = "ec801d4f33184bd9b4c2b93384fc6417";

export function isWebAnalyticsConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_API_TOKEN.trim());
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type WebAnalytics = {
  configured: boolean;
  error?: string;
  range?: { start: string; end: string; days: number };
  totals?: { visits: number; pageviews: number };
  daily?: { date: string; visits: number; pageviews: number }[];
  referers?: { name: string; count: number }[];
  countries?: { name: string; count: number }[];
};

export async function fetchWebAnalytics(days: number): Promise<WebAnalytics> {
  const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!token) return { configured: false };

  const accountTag = (process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT).trim();
  const siteTag = (process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG ?? DEFAULT_SITE_TAG).trim();

  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const startStr = ymd(start);
  const endStr = ymd(end);

  const siteFilter = siteTag ? `, siteTag: "${siteTag}"` : "";
  const f = `date_geq: "${startStr}", date_leq: "${endStr}"${siteFilter}`;

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountTag}" }) {
        totals: rumPageloadEventsAdaptiveGroups(filter: { ${f} }, limit: 1) {
          count
          sum { visits }
        }
        daily: rumPageloadEventsAdaptiveGroups(filter: { ${f} }, limit: 100, orderBy: [date_ASC]) {
          count
          sum { visits }
          dimensions { date }
        }
        referers: rumPageloadEventsAdaptiveGroups(filter: { ${f} }, limit: 8, orderBy: [count_DESC]) {
          count
          dimensions { refererHost }
        }
        countries: rumPageloadEventsAdaptiveGroups(filter: { ${f} }, limit: 8, orderBy: [count_DESC]) {
          count
          dimensions { countryName }
        }
      }
    }
  }`;

  const res = await fetch(CF_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json: any = await res.json();

  if (json?.errors && json.errors.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }
  if (!res.ok) {
    throw new Error(`Cloudflare 응답 오류 (HTTP ${res.status})`);
  }

  const acct = json?.data?.viewer?.accounts?.[0];
  const base: WebAnalytics = {
    configured: true,
    range: { start: startStr, end: endStr, days },
    totals: { visits: 0, pageviews: 0 },
    daily: [],
    referers: [],
    countries: [],
  };
  if (!acct) return base;

  const totalsRow = acct.totals?.[0];
  base.totals = {
    pageviews: totalsRow?.count ?? 0,
    visits: totalsRow?.sum?.visits ?? 0,
  };
  base.daily = (acct.daily ?? []).map((r: any) => ({
    date: r.dimensions?.date ?? "",
    pageviews: r.count ?? 0,
    visits: r.sum?.visits ?? 0,
  }));
  base.referers = (acct.referers ?? []).map((r: any) => ({
    name: (r.dimensions?.refererHost && r.dimensions.refererHost.trim()) || "직접 방문/북마크",
    count: r.count ?? 0,
  }));
  base.countries = (acct.countries ?? []).map((r: any) => ({
    name: (r.dimensions?.countryName && r.dimensions.countryName.trim()) || "(알 수 없음)",
    count: r.count ?? 0,
  }));

  return base;
}
