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
【NORIKAさんの得意分野・やりたいこと】
- 台本作成（YouTube・SNS・動画用のシナリオ、構成、原稿）
- GAS（Google Apps Script）による業務自動化
- Python（スクレイピング・自動化スクリプト）
- Web開発（HTML/CSS/JavaScript、LP制作、WordPress）
- Node.js（スクレイピング・API連携）
- Cursor などAIツールを活用した開発・自動化

【絶対にやりたくない・NGな条件（1つでも該当したら大きく減点）】
- 電話業務・テレアポ・対面必須の案件
- 翻訳案件（「翻訳」「英訳」「和訳」「English」などのキーワードを含む）
- 単純データ入力・コピペ作業（スキル不要の集計・入力のみの案件）

【単価の基準（payment_typeごとに判定）】
- fixed（固定）  : payment_max が 50000円以上なら加点 / 10000円以下なら大幅減点
- hourly（時給） : payment_max が 2000円以上なら加点 / 1000円以下なら大幅減点
- writing / task : payment_max が 1000円未満なら大幅減点
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
  const payType = job.payment?.type ?? "unknown";
  const payMax = getMaxPayment(job.payment);
  const skillText = job.skills?.length ? job.skills.join(", ") : "記載なし";

  const prompt = `
あなたはフリーランス「NORIKAさん」専属のキャリアアドバイザーです。
以下のプロフィールと判定ルールに厳密に従って、クラウドワークスの案件を評価してください。

${NORIKA_PROFILE}

---

【評価する案件】
タイトル: ${job.title}
payment_type: ${payType}
payment_max: ${payMax != null ? `${payMax}円` : "不明"}
単価（表示用）: ${payText}
スキル: ${skillText}
本文:
${job.description?.slice(0, 800) ?? "（本文なし）"}

---

【スコアリング方針】0〜10点で採点し、次のレンジに従うこと:
- 8〜10点: かなりおすすめ（得意分野に合致＆単価も良好）
- 5〜7点 : 検討の余地あり
- 3〜4点 : 優先度低め
- 0〜2点 : 明確に地雷／対象外

【絶対NG条件】次のいずれかに該当する場合は、内容に関わらず score を 0〜2、verdict を "bad" にすること:
- 「電話」「コール」「テレアポ」「対面」など、電話・対面コミュニケーションを強く要求する表現がある
- 「翻訳」「英訳」「和訳」「English」など、翻訳案件だと明確に分かるキーワードが含まれる
- 「簡単に稼げる」「誰でもできる」「未経験OKで高収入」「スキル不要」「副業で月収◯万円」等の誇大な表現がある
- LINE・メールなど、クラウドワークス外への連絡を最初から求めている
- SNSのフォロワー購入・水増し、口コミの虚偽投稿など、規約・法律に触れる可能性がある業務
- MLM・ネットワークビジネス・情報商材関連
- 業務内容の説明が極端に少なく、「採用後に詳細説明」等としか書かれていない
- 単価の大幅減点条件に該当する（fixed:10000円以下 / hourly:1000円以下 / writing・task:1000円未満）

【加点（得意分野とのマッチ度を強く反映）】
- 「台本」「シナリオ」「構成」「原稿」を含み、内容・単価が常識的であれば score を +2〜+3 ブーストする
- GAS / Python / Web開発 / Node.js 関連の開発案件で、単価が理にかなっていれば 7〜10点レンジに入りやすくする

---

以下のJSON形式のみで回答してください（他のテキストは一切不要）:
{
  "score": 0から10の整数,
  "verdict": "good"（8点以上）/ "neutral"（3〜7点）/ "bad"（0〜2点）,
  "reason": "なぜその点数か・どの条件に合致/違反したかを2〜3文の簡潔な日本語で",
  "tags": ["該当するスネークケースのラベル"]
  // 使えるタグ例: "scenario","gas","python","web-dev","node","ai-tool","low-pay","phone-required","translation","simple-data-entry"
}
`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
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

// payment_max 相当の金額を取り出す（task/writingは専用フィールドを使う）
function getMaxPayment(payment) {
  if (!payment) return null;
  if (payment.type === "task")    return payment.task_price ?? null;
  if (payment.type === "writing") return payment.article_price ?? null;
  return payment.max ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { judgeJob, judgeJobs };
