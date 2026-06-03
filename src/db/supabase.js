/**
 * Supabase クライアント & 保存処理
 *
 * テーブル: crowdworks_jobs
 * - 同じURLの案件が再スクレイプされたら上書き（upsert）
 * - 新規案件だけ is_new = true になる
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }
  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: { eventsPerSecond: 0 },
      },
    });
  } catch (e) {
    console.error("[DB] Supabaseクライアント初期化エラー:", e.message);
    return null;
  }
}

/**
 * 案件データをSupabaseに保存する
 * @param {Array} jobs  scrapeMultipleKeywords() が返すオブジェクト配列
 * @returns {{ saved: number, skipped: number }}
 */
async function saveJobs(jobs) {
  let supabase;
  try {
    supabase = getClient();
  } catch (e) {
    console.error("[DB] クライアント取得エラー:", e.message);
    return { saved: 0, skipped: jobs.length };
  }

  if (!supabase) {
    console.log("[DB] ⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY が未設定のためスキップ");
    return { saved: 0, skipped: jobs.length };
  }

  // Supabaseのテーブルカラム名に合わせて整形
  const rows = jobs.map((job) => ({
    job_id:          job.id,
    title:           job.title,
    url:             job.url,
    description:     job.description,
    category_id:     job.category_id,
    skills:          job.skills,            // text[] 配列
    status:          job.status,
    expired_on:      job.expired_on,
    last_released_at: job.last_released_at,
    payment_type:    job.payment?.type ?? null,
    payment_min:     job.payment?.min ?? null,
    payment_max:     job.payment?.max ?? null,
    keyword:         job.keyword,
    scraped_at:      job.scrapedAt,
    is_new:          true,                  // あとでLINE通知フィルターに使う
  }));

  // urlを一意キーにしてupsert（同じ案件は上書き、新規は追加）
  const { data, error } = await supabase
    .from("crowdworks_jobs")
    .upsert(rows, {
      onConflict: "url",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("[DB] ❌ 保存エラー:", error.message);
    return { saved: 0, skipped: jobs.length };
  }

  console.log(`[DB] ✅ ${rows.length}件をSupabaseに保存しました`);
  return { saved: rows.length, skipped: 0 };
}

module.exports = { saveJobs };
