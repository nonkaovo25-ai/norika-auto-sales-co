/**
 * 判定プロンプトの動作確認スクリプト（読み取り専用）
 *
 * - Supabaseに保存済みの案件を5件サンプルとして取得
 * - ルール検証用の合成テストケースも判定
 * - 結果はコンソール出力のみ（Supabaseへの書き込みは一切しない）
 *
 * 実行:  node scripts/test-judge.js   （プロジェクト直下から実行）
 * 必要な環境変数(.env): OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY(またはSERVICE)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

// ルール検証用の合成テストケース（4つの観点を確実に確認するため）
const SYNTHETIC = [
  {
    label: "翻訳（badになるべき）",
    title: "英日翻訳のお仕事 English to Japanese（記事10本）",
    description:
      "英訳・和訳をお願いします。English の記事を自然な日本語へ翻訳してください。",
    skills: ["翻訳"],
    payment: { type: "fixed", min: 20000, max: 30000 },
  },
  {
    label: "電話・テレアポ（badになるべき）",
    title: "テレアポスタッフ募集（電話営業）",
    description:
      "お電話でのアポイント獲得業務です。対面での研修も実施します。コール中心。",
    skills: [],
    payment: { type: "hourly", min: 1200, max: 1500 },
  },
  {
    label: "台本・シナリオ（ブーストされるべき）",
    title: "YouTube動画の台本・シナリオ作成",
    description:
      "動画の構成・原稿・シナリオ作成をお願いします。企画段階から一緒に進めます。",
    skills: ["ライティング", "構成"],
    payment: { type: "fixed", min: 30000, max: 50000 },
  },
  {
    label: "極端に低単価＋単純入力（減点されるべき）",
    title: "簡単なデータ入力作業（スキル不要・誰でもできる）",
    description:
      "スプレッドシートへの単純な入力・コピペ作業です。未経験OK、誰でもできます。",
    skills: [],
    payment: { type: "fixed", min: 1000, max: 3000 },
  },
];

async function fetchSamples(judgeReadyMapper, n) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log(
      "（SUPABASE_URL / KEY が未設定のため、実案件サンプルの取得はスキップします）",
    );
    return [];
  }
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("crowdworks_jobs")
    .select("title, description, skills, payment_type, payment_min, payment_max")
    .order("created_at", { ascending: false })
    .limit(n);

  if (error) {
    console.error("Supabase取得エラー:", error.message);
    return [];
  }
  return (data ?? []).map(judgeReadyMapper);
}

// DBの行を judgeJob が扱える形に変換
function rowToJob(r) {
  return {
    title: r.title,
    description: r.description,
    skills: r.skills ?? [],
    payment: { type: r.payment_type, min: r.payment_min, max: r.payment_max },
  };
}

async function printResult(judgeJob, label, job) {
  const r = await judgeJob(job);
  console.log("────────────────────────────────────────");
  console.log(`【${label}】${job.title}`);
  console.log(`  ai_score  : ${r.score}`);
  console.log(`  ai_verdict: ${r.verdict}`);
  console.log(`  ai_reason : ${r.reason}`);
  console.log(`  ai_tags   : ${(r.tags ?? []).join(", ")}`);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "❌ OPENAI_API_KEY が未設定です。norika-auto-sales/.env に設定してから実行してください。",
    );
    process.exit(1);
  }

  // judge は読み込み時にOpenAIを初期化するため、キー確認後に require する
  const { judgeJob } = require("../src/ai/judge");

  console.log("========================================");
  console.log(" 判定プロンプト 動作確認（書き込みなし）");
  console.log("========================================");

  console.log("\n■ ルール検証用テストケース");
  for (const t of SYNTHETIC) {
    await printResult(judgeJob, t.label, t);
  }

  console.log("\n■ Supabaseの実案件サンプル（最新5件）");
  const samples = await fetchSamples(rowToJob, 5);
  for (const job of samples) {
    await printResult(judgeJob, "実案件", job);
  }

  console.log("\n※ 本スクリプトはコンソール出力のみ。Supabaseへの保存は行っていません。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
