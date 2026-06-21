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
  "The Coca-Cola Co.": "KO",
  "Coca-Cola Co.": "KO",
  "Johnson & Johnson": "JNJ",
  "Walmart Inc.": "WMT",
  "Sanofi S.A.": "SAN.PA",
  "Siemens Fin.": "SIE.DE",
  "Procter & Gamble Co.": "PG",
  "PepsiCo Inc.": "PEP",
  "Abbott Laboratories": "ABT",
  "Medtronic PLC": "MDT",
  "Colgate-Palmolive Co.": "CL",
  "NextEra Energy Inc.": "NEE",
  "Swisscom AG": "SCMN.SW",
  "Swiss Re Ltd.": "SREN.SW",
  "Deutsche Telekom": "DTE.DE",
  "BASF SE": "BAS.DE",
  "Prologis Inc.": "PLD",
  "Equinix Inc.": "EQIX",
  "Welltower Inc.": "WELL",
};

/** Yahoo tickers for holdings that lack `yahoo` in portfolio data (from seed workbook). */
const ISIN_TICKERS: Record<string, string> = {
  CH0008742519: "SCMN.SW",
  CH0010570759: "LISN.SW",
  CH0010645932: "GIVN.SW",
  CH0011075394: "ZURN.SW",
  CH0011484067: "SGKN.SW",
  CH0012005267: "NOVN.SW",
  CH0012032048: "RO.SW",
  CH0012214059: "HOLN.SW",
  CH0012221716: "ABBN.SW",
  CH0013841017: "LONN.SW",
  CH0024608827: "PGHN.SW",
  CH0025751329: "LOGN.SW",
  CH0030170408: "GEBN.SW",
  CH0038863350: "NESN.SW",
  CH0126881561: "SREN.SW",
  CH0130293662: "BKW.SW",
  CH0244767585: "UBSG.SW",
  CH0311864901: "VACN.SW",
  CH0418792922: "SIKA.SW",
  CH0531751755: "BCVN.SW",
  CH1175448666: "STMN.SW",
  CNE1000003G1: "1398.HK",
  DE0007164600: "SAP.DE",
  DE0007236101: "SIE.DE",
  DE0008404005: "ALV.DE",
  DE0008430026: "MUV2.DE",
  DE000A1EWWW0: "ADS.DE",
  DK0062498333: "NOVO-B.CO",
  ES0144580Y14: "IBE.MC",
  FR0000120321: "OR.PA",
  FR0000120578: "SAN.PA",
  FR0000121014: "MC.PA",
  FR0000121972: "SU.PA",
  GB0009895292: "AZN.L",
  GB00B10RZP78: "ULVR.L",
  HK0941009539: "0941.HK",
  IE000S9YS762: "LIN",
  IE00BTN1Y115: "MDT",
  LU1778762911: "SPOT",
  NL0010273215: "ASML.AS",
  NL0011585146: "RACE.MI",
  NL0012969182: "ADYEN.AS",
  US0028241000: "ABT",
  US00724F1012: "ADBE",
  US0126531013: "ALB",
  US02079K3059: "GOOGL",
  US0231351067: "AMZN",
  US0378331005: "AAPL",
  US0382221051: "AMAT",
  US0404131064: "ANET",
  US0605051046: "BAC",
  US0846701086: "BRK-B",
  US09062X1037: "BIIB",
  US09857L1089: "BKNG",
  US11135F1012: "AVGO",
  US1912161007: "KO",
  US1941621039: "CL",
  US22160K1051: "COST",
  US22788C1053: "CRWD",
  US23804L1035: "DDOG",
  US29362U1043: "ENTG",
  US30231G1022: "XOM",
  US30303M1027: "META",
  US4370761029: "HD",
  US4567881085: "INFY",
  US4581401001: "INTC",
  US4612021034: "INTU",
  US46625H1005: "JPM",
  US4781601046: "JNJ",
  US5324571083: "LLY",
  US57636Q1040: "MA",
  US58733R1023: "MELI",
  US5949181045: "MSFT",
  US6410694060: "NSRGY",
  US64110L1061: "NFLX",
  US65339F1012: "NEE",
  US67066G1040: "NVDA",
  US69608A1088: "PLTR",
  US6974351057: "PANW",
  US7134481081: "PEP",
  US7223041028: "PDD",
  US7427181091: "PG",
  US7475251036: "QCOM",
  US78409V1044: "SPGI",
  US79466L3024: "CRM",
  US81762P1021: "NOW",
  US8334451098: "SNOW",
  US8740391003: "TSM",
  US88160R1014: "TSLA",
  US9024941034: "TSN",
  US90353T1007: "UBER",
  US92826C8394: "V",
  US9311421039: "WMT",
  US2538681030: "DLR",
  US74340W1036: "PLD",
  US29444U7000: "EQIX",
  US95040Q1040: "WELL",
  US7960502018: "005930.KS",
  US7594701077: "RELIANCE.NS",
  CH1112455766: "SCMN.SW",
  US191216DP21: "KO",
  US478160CL64: "JNJ",
  US931142EE96: "WMT",
  FR0013409844: "SAN.PA",
  XS2118273601: "SIE.DE",
  CH1194355116: "NESN.SW",
  US037833CX61: "AAPL",
  XS1001749289: "MSFT",
  CH0014420878: "UBSG.SW",
  LU0196152788: "PGHN.SW",
  DE000A2TSDE2: "DTE.DE",
  XS2595418679: "BAS.DE",
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

function tickerLogoVariants(ticker: string): string[] {
  const t = ticker.trim();
  if (!t) return [];
  const out = [t];
  const base = t.split(".")[0];
  if (base && base !== t) out.push(base);
  return out;
}

function remoteLogoUrl(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
}

function parqetLogoUrl(ticker: string): string {
  return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}`;
}

const LOGO_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE === undefined
    ? "http://127.0.0.1:8000"
    : process.env.NEXT_PUBLIC_API_BASE;

function proxiedLogoUrl(ticker: string): string {
  return `${LOGO_API_BASE}/api/issuer-logo/${encodeURIComponent(ticker)}`;
}

function issuerRoot(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.startsWith("the ")) n = n.slice(4);
  n = n.split("(")[0].trim();
  n = n.replace(
    /\b(fin\.?|co\.?|corp\.?|inc\.?|plc|ag|sa|se|ltd\.?|n\.v\.?|a\/s|etf)\b/gi,
    "",
  );
  return n.replace(/\s+/g, " ").trim();
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

function isCashPosition(isin?: string | null): boolean {
  return !!isin?.startsWith("Cash-");
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
  if (issuer) {
    const root = issuerRoot(issuer);
    for (const [key, tick] of Object.entries(ISSUER_TICKERS)) {
      if (issuerRoot(key) === root) return tick;
    }
  }
  return null;
}

/** Local bundled logo path; only returns paths we ship under `public/logos/`. */
export function localIssuerLogo(input: {
  isin?: string | null;
  issuer?: string | null;
}): string | null {
  if (isCashPosition(input.isin)) return null;
  const isin = input.isin?.trim();
  if (isin && LOCAL_LOGO_KEYS.has(isin)) return `/logos/${isin}.png`;
  const issuer = input.issuer?.trim();
  if (!issuer) return null;
  const safe = `extra_${issuer}`.replace(/:/g, "_");
  if (!LOCAL_LOGO_KEYS.has(safe)) return null;
  return `/logos/${safe}.png`;
}

/** Prefer local logos; fall back to remote ticker images when online. */
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
  if (ticker) {
    const seen = new Set<string>();
    for (const variant of tickerLogoVariants(ticker)) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      sources.push(proxiedLogoUrl(variant));
      sources.push(remoteLogoUrl(variant));
      sources.push(parqetLogoUrl(variant));
      sources.push(
        `https://storage.googleapis.com/iexcloud-historical-data-production/images/${encodeURIComponent(variant)}.png`,
      );
    }
  }
  return sources;
}
