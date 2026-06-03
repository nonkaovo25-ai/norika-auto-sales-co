/**
 * クラウドワークス スクレイパー
 *
 * クラウドワークスはVue SPAだが、
 * <div id="vue-container" data="..."> に全案件データがHTML-encoded JSONで埋め込まれている。
 * Puppeteer不要・API叩き不要でaxios+cheerioだけで完全取得できる。
 */

const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const cheerio = require("cheerio");

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response && [429, 503].includes(error.response.status)),
});

const BASE_URL = "https://crowdworks.jp";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  Accept:
    "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * 指定キーワードの案件一覧を取得する
 * @param {string} keyword
 * @param {number} pages  取得ページ数（1ページ≒50件）
 * @returns {Promise<Array<Job>>}
 */
async function scrapeJobsByKeyword(keyword, pages = 1) {
  const jobs = [];

  for (let page = 1; page <= pages; page++) {
    const url = buildSearchUrl(keyword, page);
    console.log(`[CW] 「${keyword}」 ${page}ページ目: ${url}`);

    try {
      const html = await fetchHtml(url);
      const pageJobs = parseJobsFromHtml(html, keyword);
      jobs.push(...pageJobs);
      console.log(`[CW]   → ${pageJobs.length}件取得`);

      if (page < pages) await sleep(randomBetween(2000, 3500));
    } catch (err) {
      console.error(`[CW] エラー (${url}):`, err.message);
    }
  }

  return jobs;
}

/**
 * 複数キーワードをまとめてスクレイプし、重複URLを除去して返す
 * @param {string[]} keywords
 * @param {number} pages
 * @returns {Promise<Array<Job>>}
 */
async function scrapeMultipleKeywords(keywords, pages = 1) {
  const allJobs = [];

  for (const keyword of keywords) {
    const jobs = await scrapeJobsByKeyword(keyword, pages);
    allJobs.push(...jobs);
    console.log(`[CW] 「${keyword}」完了: ${jobs.length}件`);
    await sleep(randomBetween(3000, 5000));
  }

  const seen = new Set();
  const unique = allJobs.filter((job) => {
    if (seen.has(job.url)) return false;
    seen.add(job.url);
    return true;
  });

  console.log(`[CW] 合計: ${unique.length}件（重複除去後）`);
  return unique;
}

// ─── 内部ヘルパー ────────────────────────────────────────────

function buildSearchUrl(keyword, page = 1) {
  const params = new URLSearchParams({
    "public_job[keyword]": keyword,
    "public_job[order]": "score",
    "public_job[hide_expired]": "true",
    page: String(page),
  });
  return `${BASE_URL}/public/jobs/search?${params.toString()}`;
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: 15000,
  });
  return response.data;
}

/**
 * HTMLの <div id="vue-container" data="..."> からJSONを取り出して案件配列を返す
 *
 * クラウドワークスはVueアプリの初期データをこのdiv属性に
 * HTML-encoded JSONで埋め込んでいる（2026年6月時点）
 *
 * @param {string} html
 * @param {string} keyword
 * @returns {Array<Job>}
 */
function parseJobsFromHtml(html, keyword) {
  const $ = cheerio.load(html);
  const rawData = $("#vue-container").attr("data");

  if (!rawData) {
    console.warn("[CW] vue-containerのdataが見つかりません");
    return [];
  }

  let parsed;
  try {
    // HTML特殊文字をデコードしてJSONパース
    const decoded = rawData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'");
    parsed = JSON.parse(decoded);
  } catch (e) {
    console.error("[CW] JSONパースエラー:", e.message);
    return [];
  }

  const jobOffers = parsed?.searchResult?.job_offers ?? [];
  const scrapedAt = new Date().toISOString();

  return jobOffers.map((item) => {
    const jo = item.job_offer;
    const payment = item.payment ?? {};

    return {
      id: jo.id,
      title: jo.title ?? "",
      url: `${BASE_URL}/public/jobs/${jo.id}`,
      description: (jo.description_digest ?? "").replace(/\r\n/g, "\n").trim(),
      category_id: jo.category_id ?? null,
      skills: (jo.skills ?? []).map((s) => s.name),
      status: jo.status ?? "",
      expired_on: jo.expired_on ?? null,
      last_released_at: jo.last_released_at ?? null,
      payment: extractPayment(payment),
      keyword,
      scrapedAt,
    };
  });
}

/**
 * paymentオブジェクトから単価情報を読みやすい形に変換する
 */
function extractPayment(payment) {
  if (payment.fixed_price_payment) {
    const p = payment.fixed_price_payment;
    return {
      type: "fixed",
      min: p.min_budget,
      max: p.max_budget,
    };
  }
  if (payment.hourly_payment) {
    const p = payment.hourly_payment;
    return {
      type: "hourly",
      min: p.min_hourly_wage,
      max: p.max_hourly_wage,
    };
  }
  if (payment.fixed_price_writing_payment) {
    const p = payment.fixed_price_writing_payment;
    return {
      type: "writing",
      article_price: p.article_price,
    };
  }
  if (payment.task_payment) {
    return {
      type: "task",
      task_price: payment.task_payment.task_price,
    };
  }
  return { type: "unknown" };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { scrapeJobsByKeyword, scrapeMultipleKeywords };
