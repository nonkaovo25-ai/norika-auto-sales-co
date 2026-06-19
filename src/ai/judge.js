/**
 * AI案件判定モジュール
 *
 * クラウドワークスの案件をAIが読んで
 * NORIKAさんに向いているか・地雷かを判定する
 *
 * 判定結果:
 *   score    : 0〜10（10が最高）
 *   verdict  : "good" | "neutral" | "bad"
 *   reason   : 判定理由（日本語）
 *   tags     : 特徴タグの配列
 */

const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── NORIKAさんのプロフィール（ここを育てていく）──────────────
const NORIKA_PROFILE = `
【NORIKAさんのスキル・得意なこと】
- GAS（Google Apps Script）: 業務自動化、スプレッドシート連携
- Python: スクレイピング、自動化スクリプト
- Web開発: HTML/CSS/JavaScript、LP制作、WordPress
- Excel/スプレッドシート マクロ
- Node.js: スクレイピング、API連携
- Cursor（AI）を使ったコーディング

【好きな案件の特徴】
- 技術系（コーディング、自動化、開発）
- 在宅・リモートで完結する
- 単価が明確で適切（固定5万円以上、時給2000円以上が理想）
- 依頼内容が具体的で明確
- スキルアップにつながる

【絶対避けたい地雷案件】
- 営業代行・テレアポ・飛び込み営業
- MLM・ネットワークビジネス的な曖昧な案件
- 「未経験OK」「誰でもできる」系の低単価量産作業
- 謝礼・インタビュー・アンケート系（数百〜数千円）
- 撮影・出演・モデル系
- 単価が極端に低い（固定1万円以下、時給1000円以下）
- 詳細が著しく少なくて怪しい案件
`;

/**
 * 1件の案件をAIに判定させる
 * @param {Object} job  scrapeMultipleKeywords()が返すオブジェクト
 * @returns {Promise<{score: number, verdict: string, reason: string, tags: string[]}>}
 */
async function judgeJob(job) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[AI] OPENAI_API_KEY未設定のためスキップ");
    return defaultJudge();
  }

  const payText = formatPayment(job.payment);
  const skillText = job.skills?.length ? job.skills.join(", ") : "記載なし";

  const prompt = `
あなたはフリーランスのキャリアアドバイザーです。
以下のフリーランサーのプロフィールをもとに、クラウドワークスの案件を評価してください。

${NORIKA_PROFILE}

---

【評価する案件】
タイトル: ${job.title}
単価: ${payText}
スキル: ${skillText}
本文:
${job.description?.slice(0, 800) ?? "（本文なし）"}

---

以下のJSON形式のみで回答してください（他のテキスト不要）:
{
  "score": 0から10の整数（10が最高・最もNORIKAさんに向いている）,
  "verdict": "good" または "neutral" または "bad",
  "reason": "判定理由を日本語で1〜2文で",
  "tags": ["特徴タグ1", "特徴タグ2"]  // 例: ["技術系", "高単価", "リモート可", "地雷疑い"]
}
`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content;
    const result = JSON.parse(text);

    return {
      score:   Math.min(10, Math.max(0, Number(result.score) || 0)),
      verdict: ["good", "neutral", "bad"].includes(result.verdict) ? result.verdict : "neutral",
      reason:  result.reason ?? "",
      tags:    Array.isArray(result.tags) ? result.tags : [],
    };
  } catch (e) {
    console.error(`[AI] 判定エラー (${job.title?.slice(0, 30)}):`, e.message);
    return defaultJudge();
  }
}

/**
 * 複数の案件をまとめて判定する
 * API負荷を考慮して1件ずつ処理（並列なし）
 * @param {Object[]} jobs
 * @returns {Promise<Object[]>}  jobs に ai_score / ai_verdict / ai_reason / ai_tags を付与して返す
 */
async function judgeJobs(jobs) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[AI] OPENAI_API_KEY未設定のためAI判定をスキップします");
    return jobs.map((j) => ({ ...j, ...defaultJudge() }));
  }

  console.log(`[AI] ${jobs.length}件の案件を判定開始...`);
  const results = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const judge = await judgeJob(job);

    results.push({
      ...job,
      ai_score:   judge.score,
      ai_verdict: judge.verdict,
      ai_reason:  judge.reason,
      ai_tags:    judge.tags,
    });

    // レート制限対策（30件ごとに1秒待つ）
    if ((i + 1) % 30 === 0) {
      await sleep(1000);
    }

    // 進捗表示
    if ((i + 1) % 10 === 0 || i + 1 === jobs.length) {
      console.log(`[AI] 判定中... ${i + 1}/${jobs.length}件完了`);
    }
  }

  const good    = results.filter((j) => j.ai_verdict === "good").length;
  const neutral = results.filter((j) => j.ai_verdict === "neutral").length;
  const bad     = results.filter((j) => j.ai_verdict === "bad").length;
  console.log(`[AI] 判定完了 → good:${good}件 / neutral:${neutral}件 / bad:${bad}件`);

  return results;
}

// ─── ヘルパー ──────────────────────────────────────────────────

function defaultJudge() {
  return { ai_score: null, ai_verdict: "neutral", ai_reason: "", ai_tags: [] };
}

function formatPayment(payment) {
  if (!payment) return "不明";
  if (payment.type === "fixed")   return `固定 ${payment.min ?? "?"}〜${payment.max ?? "?"}円`;
  if (payment.type === "hourly")  return `時給 ${payment.min ?? "?"}〜${payment.max ?? "?"}円`;
  if (payment.type === "writing") return `記事単価 ${payment.article_price}円`;
  if (payment.type === "task")    return `タスク単価 ${payment.task_price}円`;
  return "不明";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { judgeJob, judgeJobs };
