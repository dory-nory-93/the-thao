// Vercel Serverless Function: /api/news
// THETHAO24H - fetch Google News RSS directly, normalize XML, cache results.
const FEEDS = {
  football:{p:"football",n:"Tất cả bóng đá",q:'bóng đá'},
  vietnam:{p:"football",n:"Bóng đá Việt Nam",q:'("đội tuyển Việt Nam" OR V-League OR "bóng đá Việt Nam")'},
  epl:{p:"football",n:"Ngoại hạng Anh",q:'("Ngoại hạng Anh" OR "Premier League")'},
  laliga:{p:"football",n:"La Liga",q:'(LaLiga OR "La Liga" OR "bóng đá Tây Ban Nha")'},
  seriea:{p:"football",n:"Serie A",q:'("Serie A" OR "bóng đá Ý")'},
  bundesliga:{p:"football",n:"Bundesliga",q:'(Bundesliga OR "bóng đá Đức")'},
  ligue1:{p:"football",n:"Ligue 1",q:'("Ligue 1" OR "bóng đá Pháp")'},
  ucl:{p:"football",n:"Champions League – Cúp C1",q:'("Champions League" OR "Cúp C1")'},
  uel:{p:"football",n:"Europa League – Cúp C2",q:'("Europa League" OR "Cúp C2")'},
  uecl:{p:"football",n:"Conference League – Cúp C3",q:'("Conference League" OR "Cúp C3")'},
  worldcup:{p:"football",n:"World Cup",q:'("World Cup" OR "World Cup 2026") bóng đá'},
  euro:{p:"football",n:"EURO",q:'(EURO OR "European Championship") bóng đá'},
  national:{p:"football",n:"Đội tuyển quốc gia",q:'("đội tuyển quốc gia" OR "đội tuyển bóng đá")'},
  transfer:{p:"football",n:"Chuyển nhượng",q:'("chuyển nhượng bóng đá" OR "football transfer")'},
  fixtures:{p:"football",n:"Lịch thi đấu",q:'("lịch thi đấu bóng đá" OR "fixtures football")'},
  results:{p:"football",n:"Kết quả bóng đá",q:'("kết quả bóng đá" OR "football results")'},
  standings:{p:"football",n:"Bảng xếp hạng",q:'("bảng xếp hạng bóng đá" OR "football league table")'},

  volleyball:{p:"sports",n:"Bóng chuyền",q:'(bóng chuyền OR volleyball)'},
  basketball:{p:"sports",n:"Bóng rổ",q:'(bóng rổ OR basketball)'},
  tennis:{p:"sports",n:"Tennis",q:'(tennis OR quần vợt)'},
  badminton:{p:"sports",n:"Cầu lông",q:'(cầu lông OR badminton)'},
  athletics:{p:"sports",n:"Điền kinh",q:'(điền kinh OR athletics)'},
  f1:{p:"sports",n:"Đua xe F1",q:'("Formula 1" OR "đua xe F1" OR F1 racing)'},
  boxing:{p:"sports",n:"Boxing",q:'(boxing OR quyền anh)'},
  nba:{p:"sports",n:"NBA",q:'(NBA OR "bóng rổ Mỹ")'},
  olympics:{p:"sports",n:"Olympics",q:'(Olympics OR Olympic OR "Thế vận hội")'},
  esports:{p:"sports",n:"Thể thao điện tử",q:'("thể thao điện tử" OR esports)'},
  othersports:{p:"sports",n:"Các môn thể thao khác",q:'("thể thao" OR giải đấu thể thao) -bóng đá'},

  newsvn:{p:"news",n:"Tin trong nước",q:'(Việt Nam OR trong nước) (tin tức OR thời sự)'},
  newsworld:{p:"news",n:"Tin thế giới",q:'(thế giới OR quốc tế) (tin tức OR thời sự)'},
  politics:{p:"news",n:"Chính trị – Xã hội",q:'("chính trị" OR "xã hội" OR Quốc hội OR Chính phủ) Việt Nam'},
  economy:{p:"news",n:"Kinh tế",q:'(kinh tế OR doanh nghiệp OR thị trường OR tài chính) Việt Nam'},
  law:{p:"news",n:"Pháp luật",q:'("pháp luật" OR công an OR xét xử OR điều tra) Việt Nam'},
  education:{p:"news",n:"Giáo dục",q:'(giáo dục OR trường học OR giáo viên OR học sinh) Việt Nam'},
  life:{p:"news",n:"Đời sống",q:'("đời sống" OR dân sinh OR giao thông OR y tế) Việt Nam'},

  finance:{p:"finance",n:"Tài chính",q:'(tài chính OR thị trường tiền tệ OR lãi suất) Việt Nam'},
  stocks:{p:"finance",n:"Chứng khoán",q:'(chứng khoán OR VN-Index OR HOSE OR HNX) Việt Nam'},
  banking:{p:"finance",n:"Ngân hàng",q:'(ngân hàng OR tín dụng OR lãi suất ngân hàng) Việt Nam'},
  business:{p:"finance",n:"Doanh nghiệp",q:'(doanh nghiệp OR tập đoàn OR thị trường vốn) Việt Nam'},
  markets:{p:"finance",n:"Thị trường",q:'(thị trường tài chính OR thị trường chứng khoán OR giá vàng) Việt Nam'}
};

const GROUPS = {
  sports:["volleyball","basketball","tennis","badminton","athletics","f1","boxing","nba","olympics","esports","othersports"],
  football:["football","vietnam","epl","laliga","seriea","bundesliga","ligue1","ucl","uel","uecl","worldcup","euro","national","transfer","fixtures","results","standings"],
  news:["newsvn","newsworld","politics","economy","law","education","life"],
  finance:["finance","stocks","banking","business","markets"]
};
// Trang chủ dùng các nguồn đại diện để tải nhanh, không yêu cầu hàng chục feed cùng lúc.
const HOME = ["football","vietnam","epl","tennis","newsvn","newsworld","stocks","finance"];
const memoryCache = new Map();
const TTL = 5 * 60 * 1000;

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n,16)));
}
function tag(block, name) {
  const re = new RegExp("<(?:[\\w.-]+:)?" + name + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" + name + "\\s*>", "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}
function stripHtml(value) {
  return decodeEntities(value).replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ").trim();
}
function safeUrl(value) {
  try { const u = new URL(value); return ["http:","https:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}
function parseRss(xml, id) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const c = FEEDS[id];
  return blocks.map(block => {
    const title = stripHtml(tag(block,"title"));
    const descriptionRaw = tag(block,"description") || tag(block,"encoded");
    const link = safeUrl(tag(block,"link"));
    const enclosure = block.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i);
    const media = block.match(/<(?:media:)?content\b[^>]*\burl=["']([^"']+)["']/i);
    const imageTag = descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
    const source = tag(block,"source") || c.n;
    const image = safeUrl(enclosure?.[1] || media?.[1] || imageTag?.[1] || "");
    return {title, description:stripHtml(descriptionRaw), link, image,
      date:tag(block,"pubDate"), category:id, parent:c.p, source};
  }).filter(x => x.title && x.link);
}
async function fetchFeed(id) {
  const c = FEEDS[id];
  const url = "https://news.google.com/rss/search?q=" +
    encodeURIComponent(c.q) + "&hl=vi&gl=VN&ceid=VN:vi";
  const response = await fetch(url, {headers:{"User-Agent":"THETHAO24H/1.0 RSS reader","Accept":"application/rss+xml, application/xml, text/xml"}, signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error("Nguồn " + c.n + " trả HTTP " + response.status);
  const xml = await response.text();
  if (!/<rss\b|<feed\b/i.test(xml)) throw new Error("Nguồn " + c.n + " không trả RSS/XML hợp lệ");
  return parseRss(xml,id);
}
async function fetchInBatches(ids, size=3) {
  const output = [];
  let failed = 0;
  for (let i=0; i<ids.length; i+=size) {
    const batch = ids.slice(i,i+size);
    const results = await Promise.allSettled(batch.map(fetchFeed));
    results.forEach((r,index) => {
      if (r.status === "fulfilled") {
        output.push(...r.value);
        memoryCache.set(batch[index], {time:Date.now(),items:r.value});
      } else {
        failed++;
        const old = memoryCache.get(batch[index]);
        if (old?.items) output.push(...old.items);
      }
    });
  }
  const unique = new Map();
  for (const item of output) {
    const key = item.link;
    if (key && !unique.has(key)) unique.set(key,item);
  }
  return {items:[...unique.values()].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)),failed};
}

module.exports = async (req,res) => {
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=900");
  if (req.method !== "GET") {
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Method not allowed"});
  }
  const category = String(req.query.category || "home").toLowerCase();
  let ids;
  if (category === "home") ids = HOME;
  else if (GROUPS[category]) ids = GROUPS[category];
  else if (FEEDS[category]) ids = [category];
  else return res.status(400).json({error:"Chuyên mục không hợp lệ",category});

  const key = "selection:" + category;
  const cached = memoryCache.get(key);
  if (cached && Date.now()-cached.time < TTL) {
    return res.status(200).json({...cached.payload,cached:true});
  }
  try {
    const result = await fetchInBatches(ids,3);
    if (!result.items.length && result.failed) {
      if (cached?.payload) return res.status(200).json({...cached.payload,cached:true,warning:"Đang hiển thị dữ liệu lưu trước đó"});
      return res.status(502).json({error:"Tất cả nguồn RSS tạm thời không phản hồi",category,failed:result.failed});
    }
    const payload = {category,items:result.items,failed:result.failed,cached:false,updatedAt:new Date().toISOString()};
    if (result.items.length) memoryCache.set(key,{time:Date.now(),payload});
    return res.status(200).json(payload);
  } catch (error) {
    if (cached?.payload) return res.status(200).json({...cached.payload,cached:true,warning:"Đang hiển thị dữ liệu lưu trước đó"});
    return res.status(502).json({error:"Không lấy được dữ liệu RSS",detail:error.message,category});
  }
};
