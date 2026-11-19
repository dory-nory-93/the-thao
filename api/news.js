
const FEEDS = {
  home: [
    "Việt Nam tin tức mới nhất",
    "bóng đá thể thao mới nhất",
    "kinh tế tài chính chứng khoán Việt Nam",
    "tin tức xã hội pháp luật Việt Nam"
  ],

  football: [
    "bóng đá Việt Nam",
    "Ngoại hạng Anh Premier League",
    "La Liga Tây Ban Nha",
    "Serie A Italia",
    "Bundesliga Đức",
    "Ligue 1 Pháp",
    "Champions League",
    "Europa League",
    "Conference League",
    "World Cup bóng đá",
    "EURO bóng đá",
    "chuyển nhượng bóng đá"
  ],

  sports: [
    "tin thể thao mới nhất",
    "tennis",
    "bóng rổ",
    "cầu lông",
    "điền kinh",
    "thể thao Việt Nam"
  ],

  news: [
    "tin nóng Việt Nam",
    "chính trị Việt Nam",
    "tin tức xã hội Việt Nam",
    "pháp luật Việt Nam",
    "giáo dục Việt Nam",
    "y tế Việt Nam"
  ],

  finance: [
    "tài chính Việt Nam",
    "chứng khoán Việt Nam",
    "kinh tế Việt Nam",
    "ngân hàng Việt Nam",
    "bất động sản Việt Nam"
  ],

  vn: ["bóng đá Việt Nam"],
  epl: ["Ngoại hạng Anh Premier League"],
  laliga: ["La Liga Tây Ban Nha"],
  seriea: ["Serie A Italia"],
  bundesliga: ["Bundesliga Đức"],
  ligue1: ["Ligue 1 Pháp"],
  ucl: ["Champions League"],
  uel: ["Europa League"],
  uecl: ["Conference League"],
  worldcup: ["World Cup bóng đá"],
  euro: ["EURO bóng đá"],
  transfer: ["chuyển nhượng bóng đá"],
  tennis: ["tennis"],
  basketball: ["bóng rổ"],
  badminton: ["cầu lông"],
  economy: ["kinh tế Việt Nam"],
  stock: ["chứng khoán Việt Nam"],
  banking: ["ngân hàng Việt Nam"],
  realestate: ["bất động sản Việt Nam"]
};

const CACHE_TIME = 3 * 60 * 1000;
const cache = new Map();

function cleanText(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .trim();
}

function getTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function parseRSS(xml, category) {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];

  return blocks.map(item => {
    const title = getTag(item, "title");
    const link = getTag(item, "link");
    const pubDate = getTag(item, "pubDate");
    const description = getTag(item, "description");
    const source = getTag(item, "source");

    return {
      id: link || title,
      title,
      link,
      description,
      source: source || "Google News",
      pubDate,
      category,
      image: "",
      timestamp: Date.parse(pubDate) || 0
    };
  }).filter(item => item.title && item.link);
}

async function fetchFeed(query, category) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=vi&gl=VN&ceid=VN:vi";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "THETHAO24H/1.0 RSS Reader",
        "Accept": "application/rss+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) {
      throw new Error(`RSS HTTP ${response.status}`);
    }

    const xml = await response.text();

    if (!xml.includes("<item")) {
      throw new Error("RSS không có dữ liệu");
    }

    return parseRSS(xml, category);
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueArticles(articles) {
  const seen = new Set();

  return articles
    .filter(article => {
      const key = article.link || article.title;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=300");

  const category = String(req.query.category || "home").toLowerCase();
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || 60, 1),
    100
  );

  const queries = FEEDS[category];

  if (!queries) {
    return res.status(400).json({
      success: false,
      error: "Chuyên mục không tồn tại",
      availableCategories: Object.keys(FEEDS)
    });
  }

  const cached = cache.get(category);

  if (cached && Date.now() - cached.time < CACHE_TIME) {
    return res.status(200).json({
      success: true,
      category,
      total: cached.articles.length,
      failed: 0,
      cached: true,
      articles: cached.articles.slice(0, limit)
    });
  }

  const results = await Promise.allSettled(
    queries.map(query => fetchFeed(query, category))
  );

  const articles = [];
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      failed++;
    }
  }

  const unique = uniqueArticles(articles);

  if (unique.length > 0) {
    cache.set(category, {
      time: Date.now(),
      articles: unique
    });
  } else if (cached) {
    return res.status(200).json({
      success: true,
      category,
      total: cached.articles.length,
      failed,
      cached: true,
      warning: "RSS tạm thời không phản hồi, đang sử dụng dữ liệu đã lưu",
      articles: cached.articles.slice(0, limit)
    });
  }

  return res.status(200).json({
    success: unique.length > 0,
    category,
    total: unique.length,
    failed,
    cached: false,
    warning: unique.length === 0
      ? "Không lấy được dữ liệu RSS. Vui lòng thử lại sau."
      : null,
    articles: unique.slice(0, limit)
  });
}
