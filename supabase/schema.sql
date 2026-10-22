-- スーパーメモのテーブル定義。Supabase の SQL Editor に貼り付けて実行する。
-- 何度実行しても大丈夫なように書いてある。

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('note', 'qa')),
  -- 自由メモ: タイトル / 問題形式: 問題
  title text not null,
  -- 自由メモ: 本文 / 問題形式: 答え
  body text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ts-fsrs の Card をそのまま保存する
  card jsonb not null,
  -- card.due と同じ値（検索・並び替え用）
  due timestamptz not null
);

create index if not exists memos_user_due_idx on public.memos (user_id, due);

create table if not exists public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  memo_id uuid not null references public.memos on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  -- 次の復習までの日数
  scheduled_days integer not null,
  -- ts-fsrs の ReviewLog 全体（取り消しやパラメータ最適化に使う）
  log jsonb,
  -- 評価する前のカード（取り消し用）
  card_before jsonb
);

create index if not exists review_logs_user_reviewed_idx on public.review_logs (user_id, reviewed_at);
create index if not exists review_logs_memo_idx on public.review_logs (memo_id);

-- ログインしている本人のデータだけ読み書きできるようにする
alter table public.memos enable row level security;
alter table public.review_logs enable row level security;

drop policy if exists "own memos" on public.memos;
create policy "own memos" on public.memos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own review logs" on public.review_logs;
create policy "own review logs" on public.review_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
