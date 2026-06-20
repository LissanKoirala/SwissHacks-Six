// Client portraits and issuer logo resolution for the dashboard.

export const CLIENT_AVATARS: Record<string, string> = {
  schneider: "/faces/hubertus-schneider.jpg",
  huber: "/faces/marius-huber.jpg",
  raeber: "/faces/eugen-raeber.jpg",
  ammann: "/faces/julian-ammann.jpg",
};

/** Yahoo tickers for issuers referenced in alerts/swaps but not always in holdings. */
const ISSUER_TICKERS: Record<string, string> = {
  "Biogen Inc.": "BIIB",
  "Eli Lilly & Co.": "LLY",
  "Unilever PLC": "ULVR.L",
  "Costco Wholesale Corp.": "COST",
  "PDD Holdings Inc.": "PDD",
  "Cie Financière Richemont": "CFR.SW",
  "ASML Holding N.V.": "ASML.AS",
  "Nestlé S.A.": "NESN.SW",
  "Roche Holding AG": "RO.SW",
  "Novartis AG": "NOVN.SW",
  "Microsoft Corp.": "MSFT",
  "Apple Inc.": "AAPL",
  "NVIDIA Corp.": "NVDA",
  "Alphabet Inc.": "GOOGL",
  "Amazon.com Inc.": "AMZN",
  "Meta Platforms Inc.": "META",
  "Tesla Inc.": "TSLA",
  "Visa Inc.": "V",
  "Mastercard Inc.": "MA",
  "JPMorgan Chase & Co.": "JPM",
  "Bank of America Corp.": "BAC",
  "Home Depot Inc.": "HD",
  "Berkshire Hathaway": "BRK-B",
  "Broadcom Inc.": "AVGO",
  "Exxon Mobil Corp.": "XOM",
  "TSMC": "TSM",
  "Samsung Electronics": "005930.KS",
  "LVMH Moët Hennessy": "MC.PA",
  "SAP SE": "SAP.DE",
  "Siemens AG": "SIE.DE",
  "Allianz SE": "ALV.DE",
  "UBS Group AG": "UBSG.SW",
  "Zurich Insurance Group": "ZURN.SW",
  "ABB Ltd.": "ABBN.SW",
  "Sika AG": "SIKA.SW",
  "Holcim AG": "HOLN.SW",
  "Geberit AG": "GEBN.SW",
  "Givaudan SA": "GIVN.SW",
  "Schneider Electric SE": "SU.PA",
  "Novo Nordisk A/S": "NOVO-B.CO",
  "Linde PLC": "LIN",
  "Infosys Ltd.": "INFY",
  "Reliance Industries": "RELIANCE.NS",
};

/** Yahoo tickers for holdings that lack `yahoo` in portfolio data. */
const ISIN_TICKERS: Record<string, string> = {
  CH0047533523: "ZGLD.SW",
  CH0210483332: "CFR.SW",
  FR0000052292: "RMS.PA",
  ES0148396007: "ITX.MC",
  US7427181091: "PG",
  LU0196152788: "PGHN.SW",
  IE00BK7Y2R57: "IBTM.L",
};

/** Filenames (without `.png`) that exist under `public/logos/`. */
const LOCAL_LOGO_KEYS = new Set([
  "CH0010645932",
  "CH0011075394",
  "CH0012005267",
  "CH0012032048",
  "CH0012214059",
  "CH0012221716",
  "CH0030170408",
  "CH0038863350",
  "CH0244767585",
  "CH0418792922",
  "DE0007164600",
  "DE0007236101",
  "DE0008404005",
  "DK0062498333",
  "FR0000121014",
  "FR0000121972",
  "GB00B10RZP78",
  "IE000S9YS762",
  "NL0010273215",
  "US02079K3059",
  "US0231351067",
  "US0378331005",
  "US0605051046",
  "US0846701086",
  "US09062X1037",
  "US11135F1012",
  "US30231G1022",
  "US30303M1027",
  "US4370761029",
  "US4567881085",
  "US46625H1005",
  "US5324571083",
  "US57636Q1040",
  "US5949181045",
  "US67066G1040",
  "US7223041028",
  "US8740391003",
  "US88160R1014",
  "US92826C8394",
  "extra_Cie Financière Richemont",
  "extra_Costco Wholesale Corp.",
  "extra_Unilever PLC",
]);

function isCashPosition(isin?: string | null): boolean {
  return !!isin?.startsWith("Cash-");
}

export function getClientAvatar(clientId: string): string | null {
  return CLIENT_AVATARS[clientId] ?? null;
}

export function clientInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function issuerInitials(issuer: string): string {
  const cleaned = issuer
    .replace(/\b(Inc\.?|Corp\.?|PLC|AG|SA|SE|Ltd\.?|N\.V\.?|A\/S|ETF)\b/gi, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return issuer.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function logoFileKey(isin?: string | null, issuer?: string | null): string | null {
  if (isin) return isin;
  if (issuer) return `extra:${issuer}`;
  return null;
}

function remoteLogoUrl(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
}

export function resolveIssuerTicker(input: {
  isin?: string | null;
  issuer?: string | null;
  yahoo?: string | null;
}): string | null {
  const yahoo = input.yahoo?.trim();
  if (yahoo) return yahoo;
  const isin = input.isin?.trim();
  if (isin && ISIN_TICKERS[isin]) return ISIN_TICKERS[isin];
  const issuer = input.issuer?.trim();
  if (issuer && ISSUER_TICKERS[issuer]) return ISSUER_TICKERS[issuer];
  return null;
}

/** Local bundled logo path, only when the file exists under /public/logos. */
export function localIssuerLogo(input: {
  isin?: string | null;
  issuer?: string | null;
}): string | null {
  if (isCashPosition(input.isin)) return null;
  const key = logoFileKey(input.isin, input.issuer);
  if (!key) return null;
  const safe = key.replace(/:/g, "_");
  if (!LOCAL_LOGO_KEYS.has(safe)) return null;
  return `/logos/${safe}.png`;
}

/** Prefer local logos; fall back to FMP ticker image when online. */
export function issuerLogoSources(input: {
  isin?: string | null;
  issuer?: string | null;
  yahoo?: string | null;
}): string[] {
  if (isCashPosition(input.isin)) return [];
  const sources: string[] = [];
  const local = localIssuerLogo(input);
  if (local) sources.push(local);
  const ticker = resolveIssuerTicker(input);
  if (ticker) sources.push(remoteLogoUrl(ticker));
  return sources;
}
