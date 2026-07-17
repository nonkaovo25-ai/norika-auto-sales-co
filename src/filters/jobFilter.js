/**
 * 案件の除外フィルタ
 *
 * 保存対象から外すべき「地雷案件」を判定する。
 * キーワードリスト・単価しきい値は、あとから調整しやすいよう
 * このファイルの先頭に定数として切り出している。
 */

// ─── 調整用の定数 ─────────────────────────────────────────────

// タイトル・本文に含まれていたら除外するNGキーワード
const EXCLUDE_KEYWORDS = [
  "テレアポ",
  "営業電話",
  "MLM",
  "ネットワークビジネス",
  "アンケート",
  "モニター",
  "出演",
  "撮影",
  "モデル",
  "いいね",
  "フォロワー",
  "口コミ投稿",
  "レビュー投稿",
];

// 単価しきい値（この金額「未満」なら除外）
const PAYMENT_THRESHOLDS = {
  taskWriting: 1000, // payment_type が task / writing のとき
  fixed: 3000, // payment_type が fixed のとき
};

// ─── 判定ロジック ─────────────────────────────────────────────

/**
 * payment_max 相当の金額を取り出す。
 * task は task_price、writing は article_price に金額が入るため、
 * それぞれを payment_max とみなして評価する。
 * @returns {number|null}
 */
function getMaxPayment(job) {
  const p = job.payment ?? {};
  if (p.type === "task") return p.task_price ?? null;
  if (p.type === "writing") return p.article_price ?? null;
  return p.max ?? null;
}

/**
 * 案件1件の除外理由を返す。除外不要なら null。
 * @returns {string|null}
 */
function getExclusionReason(job) {
  // 1. NGキーワード（タイトル or 本文）
  const text = `${job.title ?? ""}\n${job.description ?? ""}`;
  const hitKeyword = EXCLUDE_KEYWORDS.find((kw) => text.includes(kw));
  if (hitKeyword) return `NGキーワード「${hitKeyword}」を含む`;

  // 2. 単価しきい値
  const type = job.payment?.type;
  const max = getMaxPayment(job);

  if (
    (type === "task" || type === "writing") &&
    max != null &&
    max < PAYMENT_THRESHOLDS.taskWriting
  ) {
    return `${type}単価が${PAYMENT_THRESHOLDS.taskWriting}円未満（${max}円）`;
  }

  if (type === "fixed" && max != null && max < PAYMENT_THRESHOLDS.fixed) {
    return `固定単価が${PAYMENT_THRESHOLDS.fixed}円未満（${max}円）`;
  }

  return null;
}

/**
 * 除外対象を取り除いた案件配列を返す。
 * 除外した案件はログに出力する。
 * @param {Array} jobs
 * @returns {Array} 保存対象として残った案件
 */
function filterJobs(jobs) {
  const kept = [];
  let excluded = 0;

  for (const job of jobs) {
    const reason = getExclusionReason(job);
    if (reason) {
      excluded++;
      console.log(`[除外] タイトル：${job.title} / 理由：${reason}`);
    } else {
      kept.push(job);
    }
  }

  if (excluded > 0) {
    console.log(`[除外] 合計 ${excluded}件をスキップ（残り ${kept.length}件）`);
  }

  return kept;
}

module.exports = {
  filterJobs,
  getExclusionReason,
  EXCLUDE_KEYWORDS,
  PAYMENT_THRESHOLDS,
};
