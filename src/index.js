/**
 * 株式会社NORIKA・自動営業システム
 * エントリーポイント
 */

require("dotenv").config();
const cron = require("node-cron");
const { scrapeMultipleKeywords } = require("./scrapers/crowdworks");
const { saveJobs, updateAiScores } = require("./db/supabase");
const { judgeJobs } = require("./ai/judge");

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

const PAGES_PER_KEYWORD = parseInt(process.env.PAGES_PER_KEYWORD || "1", 10);

// ─── メイン処理 ────────────────────────────────────────────────
async function run() {
  console.log("========================================");
  console.log(`[NORIKA] 開始: ${new Date().toLocaleString("ja-JP")}`);
  console.log(`[NORIKA] キーワード: ${KEYWORDS.join(", ")}`);
  console.log("========================================");

  try {
    // 1. スクレイプ
    const jobs = await scrapeMultipleKeywords(KEYWORDS, PAGES_PER_KEYWORD);
    console.log(`\n[NORIKA] スクレイプ完了: ${jobs.length}件`);

    // 2. Supabaseに保存（新規のみ追加・既存はスキップ）
    const { newJobs } = await saveJobs(jobs);
    console.log(`[NORIKA] 新規案件: ${newJobs.length}件`);

    // 3. 新規案件だけAIに判定させる
    if (newJobs.length > 0) {
      console.log(`\n[NORIKA] AI判定を開始します...`);
      const judged = await judgeJobs(newJobs);

      // 4. AI判定結果をSupabaseに保存
      await updateAiScores(judged);

      // 5. good判定の案件だけログに出す
      const goodJobs = judged.filter((j) => j.ai_verdict === "good");
      if (goodJobs.length > 0) {
        console.log(`\n🎯 NORIKAさん向き案件（good: ${goodJobs.length}件）`);
        goodJobs.forEach((job, i) => {
          console.log(`\n[${i + 1}] ${job.title}`);
          console.log(`    スコア  : ${job.ai_score}/10`);
          console.log(`    理由    : ${job.ai_reason}`);
          console.log(`    タグ    : ${job.ai_tags?.join(", ")}`);
          console.log(`    URL     : ${job.url}`);
        });
      }
    }

    console.log(`\n[NORIKA] 完了`);
    return jobs;
  } catch (err) {
    console.error("[NORIKA] エラー:", err);
    throw err;
  }
}

// ─── 起動モード分岐 ────────────────────────────────────────────
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 */6 * * *";
const RUN_ONCE = process.env.RUN_ONCE === "true";

if (RUN_ONCE) {
  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  console.log(`[NORIKA] cronスケジュール: ${CRON_SCHEDULE}`);
  run().catch(console.error);
  cron.schedule(CRON_SCHEDULE, () => {
    run().catch(console.error);
  });
}
