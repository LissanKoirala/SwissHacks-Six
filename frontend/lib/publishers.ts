/** Publisher logo sources — source label → domain when article URLs are placeholders. */

const LOGO_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE === undefined
    ? "http://127.0.0.1:8000"
    : process.env.NEXT_PUBLIC_API_BASE;

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
]);

const SOURCE_DOMAINS: Record<string, string> = {
  bloomberg: "bloomberg.com",
  reuters: "reuters.com",
  "reuters health": "reuters.com",
  "neue zürcher zeitung": "nzz.ch",
  "neue zuricher zeitung": "nzz.ch",
  nzz: "nzz.ch",
  "financial times": "ft.com",
  "the financial times": "ft.com",
  ft: "ft.com",
  "economic times": "economictimes.indiatimes.com",
  "the economic times": "economictimes.indiatimes.com",
  "the good men project": "goodmenproject.com",
  "good men project": "goodmenproject.com",
  "yahoo finance": "finance.yahoo.com",
  "google news": "news.google.com",
  "bbc news": "bbc.co.uk",
  bbc: "bbc.co.uk",
  "the guardian": "theguardian.com",
  guardian: "theguardian.com",
  "wall street journal": "wsj.com",
  wsj: "wsj.com",
  cnbc: "cnbc.com",
  marketwatch: "marketwatch.com",
  "ap news": "apnews.com",
  "associated press": "apnews.com",
};

const DOMAIN_HINTS: [string, string][] = [
  ["bloomberg", "bloomberg.com"],
  ["reuters", "reuters.com"],
  ["financial times", "ft.com"],
  ["zürcher", "nzz.ch"],
  ["zurich", "nzz.ch"],
  [" nzz", "nzz.ch"],
  ["economic times", "economictimes.indiatimes.com"],
  ["good men project", "goodmenproject.com"],
  ["yahoo", "finance.yahoo.com"],
  ["wsj", "wsj.com"],
  ["wall street journal", "wsj.com"],
  ["cnbc", "cnbc.com"],
  ["bbc", "bbc.co.uk"],
  ["guardian", "theguardian.com"],
  ["marketwatch", "marketwatch.com"],
];

function normaliseHost(host: string): string {
  let h = host.trim().toLowerCase().replace(/\.$/, "");
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

export function resolvePublisherDomain(
  source: string,
  articleUrl?: string | null,
): string | null {
  const label = source.trim().toLowerCase();
  if (SOURCE_DOMAINS[label]) return SOURCE_DOMAINS[label];

  for (const [hint, domain] of DOMAIN_HINTS) {
    if (label.includes(hint)) return domain;
  }

  if (articleUrl) {
    try {
      const host = normaliseHost(new URL(articleUrl).hostname);
      if (host && !PLACEHOLDER_HOSTS.has(host)) return host;
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function publisherLogoSources(
  source: string,
  articleUrl?: string | null,
): string[] {
  const domain = resolvePublisherDomain(source, articleUrl);
  const q = new URLSearchParams({ source });
  if (articleUrl) q.set("url", articleUrl);

  const out = [`${LOGO_API_BASE}/api/publisher-logo?${q.toString()}`];
  if (!domain) return out;

  return [
    ...out,
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
}

export function publisherInitials(source: string): string {
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0]?.slice(0, 2) || "?").toUpperCase();
}
