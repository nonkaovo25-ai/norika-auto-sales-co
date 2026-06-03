/**
 * Supabase クライアント（後で実装）
 * 現時点ではプレースホルダー。第2ステップで完成させる。
 */

// npm install @supabase/supabase-js を実行後に有効化
// const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// let supabase = null;
// if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
//   supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// }

/**
 * 案件データをSupabaseのcrowdworks_jobsテーブルに保存する
 * @param {Array} jobs  scrapeMultipleKeywords() が返すオブジェクト配列
 */
async function saveJobs(jobs) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log("[DB] Supabase未設定のためスキップ（.envを確認してください）");
    return { saved: 0, skipped: jobs.length };
  }

  // TODO: 第2ステップで実装
  // const { data, error } = await supabase
  //   .from("crowdworks_jobs")
  //   .upsert(jobs, { onConflict: "url" });

  console.log(`[DB] ${jobs.length}件をSupabaseに保存予定（未実装）`);
  return { saved: 0, skipped: jobs.length };
}

module.exports = { saveJobs };
