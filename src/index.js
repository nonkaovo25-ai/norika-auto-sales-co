/**
 * 株式会社NORIKA・自動営業システム
 * エントリーポイント
 *
 * ・Renderで `node src/index.js` で起動
 * ・node-cronで定期スクレイプを実行（デフォルト: 6時間ごと）
 */

require("dotenv").config();
const cron = require("node-cron");
const { scrapeMultipleKeywords } = require("./scrapers/crowdworks");
const { saveJobs } = require("./db/supabase");

// ─── スクレイプ対象キーワード ──────────────────────────────────
const KEYWORDS = [
  "コーディング",
  "マクロ",
  "Web開発",
  "LP制作",
  "GAS",
  "Python",
  "スクレイピング",
  "自動化",
];

// 1キーワードあたり何ページ取得するか（1ページ ≒ 30件）
const PAGES_PER_KEYWORD = parseInt(process.env.PAGES_PER_KEYWORD || "1", 10);

// ─── メイン処理 ────────────────────────────────────────────────
async function run() {
  console.log("========================================");
  console.log(`[NORIKA] スクレイプ開始: ${new Date().toLocaleString("ja-JP")}`);
  console.log(`[NORIKA] 対象キーワード: ${KEYWORDS.join(", ")}`);
  console.log("========================================");

  try {
    const jobs = await scrapeMultipleKeywords(KEYWORDS, PAGES_PER_KEYWORD);

    console.log("\n--- 取得結果サンプル（先頭3件）---");
    jobs.slice(0, 3).forEach((job, i) => {
      const pay = job.payment;
      const payStr =
        pay.type === "fixed"
          ? `固定: ${pay.min ?? "?"}〜${pay.max ?? "?"}円`
          : pay.type === "hourly"
          ? `時給: ${pay.min ?? "?"}〜${pay.max ?? "?"}円`
          : pay.type === "writing"
          ? `ライティング: ${pay.article_price}円/記事`
          : "金額未記載";

      console.log(`\n[${i + 1}] ${job.title}`);
      console.log(`    URL      : ${job.url}`);
      console.log(`    単価     : ${payStr}`);
      console.log(`    スキル   : ${job.skills.join(", ") || "なし"}`);
      console.log(`    期限     : ${job.expired_on}`);
      console.log(`    本文     : ${job.description.slice(0, 80)}...`);
    });

    // Supabaseへ保存（第2ステップで完成）
    const result = await saveJobs(jobs);
    console.log(`\n[NORIKA] 完了 - 取得: ${jobs.length}件`);

    return jobs;
  } catch (err) {
    console.error("[NORIKA] 致命的エラー:", err);
    throw err;
  }
}

// ─── 起動モード分岐 ────────────────────────────────────────────
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 */6 * * *"; // デフォルト: 6時間ごと
const RUN_ONCE = process.env.RUN_ONCE === "true";

if (RUN_ONCE) {
  // 手動実行・テスト用: 1回だけ実行して終了
  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  // Renderサーバー常駐モード: cronで定期実行
  console.log(`[NORIKA] cronスケジュール: ${CRON_SCHEDULE}`);
  console.log("[NORIKA] サーバー起動。定期スクレイプを待機中...\n");

  // 起動直後に1回実行
  run().catch(console.error);

  // 以降はcronで定期実行
  cron.schedule(CRON_SCHEDULE, () => {
    run().catch(console.error);
  });
}
