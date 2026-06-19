/**
 * Supabase クライアント & 保存処理
 */

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws, params: { eventsPerSecond: 0 } },
    });
  } catch (e) {
    console.error("[DB] クライアント初期化エラー:", e.message);
    return null;
  }
}

/**
 * 案件を保存し、新規案件だけを返す
 * @returns {{ newJobs: Array }}
 */
async function saveJobs(jobs) {
  const supabase = getClient();
  if (!supabase) {
    console.log("[DB] ⚠️  Supabase未設定のためスキップ");
    return { newJobs: jobs }; // 全件をnewJobsとして返す（ローカルテスト用）
  }

  // 既存のURLを取得して新規案件を検出
  const existingUrls = await getExistingUrls(supabase, jobs.map((j) => j.url));

  const newJobs    = jobs.filter((j) => !existingUrls.has(j.url));
  const updateJobs = jobs.filter((j) =>  existingUrls.has(j.url));

  // 新規案件を挿入
  if (newJobs.length > 0) {
    const rows = newJobs.map(toRow);
    const { error } = await supabase.from("crowdworks_jobs").insert(rows);
    if (error) console.error("[DB] 挿入エラー:", error.message);
    else console.log(`[DB] ✅ 新規 ${newJobs.length}件を保存`);
  }

  // 既存案件はscraped_atだけ更新
  if (updateJobs.length > 0) {
    for (const job of updateJobs) {
      await supabase
        .from("crowdworks_jobs")
        .update({ scraped_at: job.scrapedAt })
        .eq("url", job.url);
    }
    console.log(`[DB] 🔄 既存 ${updateJobs.length}件を更新`);
  }

  return { newJobs };
}

/**
 * AI判定結果をSupabaseに保存する
 * @param {Array} judgedJobs  ai_score / ai_verdict / ai_reason / ai_tags を持つ配列
 */
async function updateAiScores(judgedJobs) {
  const supabase = getClient();
  if (!supabase) return;

  let successCount = 0;
  for (const job of judgedJobs) {
    if (job.ai_verdict == null) continue;
    const { error } = await supabase
      .from("crowdworks_jobs")
      .update({
        ai_score:   job.ai_score,
        ai_verdict: job.ai_verdict,
        ai_reason:  job.ai_reason,
        ai_tags:    job.ai_tags,
      })
      .eq("url", job.url);
    if (!error) successCount++;
  }
  console.log(`[DB] ✅ AI判定 ${successCount}件を保存`);
}

// ─── ヘルパー ──────────────────────────────────────────────────

async function getExistingUrls(supabase, urls) {
  const { data, error } = await supabase
    .from("crowdworks_jobs")
    .select("url")
    .in("url", urls);
  if (error) {
    console.error("[DB] URL確認エラー:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.url));
}

function toRow(job) {
  return {
    job_id:           job.id,
    title:            job.title,
    url:              job.url,
    description:      job.description,
    category_id:      job.category_id,
    skills:           job.skills,
    status:           job.status,
    expired_on:       job.expired_on,
    last_released_at: job.last_released_at,
    payment_type:     job.payment?.type ?? null,
    payment_min:      job.payment?.min ?? null,
    payment_max:      job.payment?.max ?? null,
    keyword:          job.keyword,
    scraped_at:       job.scrapedAt,
    is_new:           true,
  };
}

module.exports = { saveJobs, updateAiScores };
