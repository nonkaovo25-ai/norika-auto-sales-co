-- ============================================================
-- AI判定カラムを crowdworks_jobs テーブルに追加
-- Supabase > SQL Editor に貼り付けて実行
-- ============================================================

alter table crowdworks_jobs
  add column if not exists ai_score   integer,        -- 0〜10（10が最良）
  add column if not exists ai_verdict text,           -- good / neutral / bad
  add column if not exists ai_reason  text,           -- 判定理由
  add column if not exists ai_tags    text[];         -- 特徴タグ配列

-- AI判定済みかどうかを素早く検索するためのインデックス
create index if not exists idx_cw_jobs_ai_verdict on crowdworks_jobs (ai_verdict);
create index if not exists idx_cw_jobs_ai_score   on crowdworks_jobs (ai_score desc);
