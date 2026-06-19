-- ============================================================
-- user_feedback テーブル作成
-- NORIKAさんの「良い/地雷」判定を蓄積してAIを育てる
-- Supabase > SQL Editor に貼り付けて実行
-- ============================================================

create table if not exists user_feedback (
  id         bigserial primary key,
  job_id     bigint references crowdworks_jobs(id) on delete cascade,
  verdict    text not null check (verdict in ('good', 'bad')),
  created_at timestamptz default now()
);

create index if not exists idx_feedback_job_id on user_feedback (job_id);
create index if not exists idx_feedback_verdict on user_feedback (verdict);

-- ─── RLS（Row Level Security）設定 ────────────────────────────
-- Webアプリ（ブラウザ）からの読み書きを許可する
alter table crowdworks_jobs enable row level security;
alter table user_feedback   enable row level security;

-- crowdworks_jobs: 誰でも読める（公開案件データなので問題なし）
create policy "public read jobs"
  on crowdworks_jobs for select
  using (true);

-- user_feedback: 誰でも追加・読める（個人ツールなので制限なし）
create policy "public insert feedback"
  on user_feedback for insert
  with check (true);

create policy "public read feedback"
  on user_feedback for select
  using (true);
