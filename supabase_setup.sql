-- ============================================================
-- 株式会社NORIKA・自動営業システム
-- Supabase テーブル作成SQL
-- Supabaseのダッシュボード > SQL Editor に貼り付けて実行
-- ============================================================

create table if not exists crowdworks_jobs (
  id               bigserial primary key,
  job_id           bigint unique not null,       -- クラウドワークスの案件ID
  title            text not null,
  url              text unique not null,          -- 重複排除キー
  description      text,
  category_id      integer,
  skills           text[],                        -- スキルタグの配列
  status           text,
  expired_on       date,
  last_released_at timestamptz,
  payment_type     text,                          -- fixed / hourly / writing / task
  payment_min      numeric,
  payment_max      numeric,
  keyword          text,                          -- ヒットしたキーワード
  scraped_at       timestamptz default now(),
  is_new           boolean default true,          -- LINE通知済みになったらfalseに更新
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- 検索・フィルター用インデックス
create index if not exists idx_cw_jobs_keyword     on crowdworks_jobs (keyword);
create index if not exists idx_cw_jobs_is_new      on crowdworks_jobs (is_new);
create index if not exists idx_cw_jobs_expired_on  on crowdworks_jobs (expired_on);
create index if not exists idx_cw_jobs_scraped_at  on crowdworks_jobs (scraped_at desc);

-- updated_at を自動更新するトリガー
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_cw_jobs_updated_at
  before update on crowdworks_jobs
  for each row execute function update_updated_at();
