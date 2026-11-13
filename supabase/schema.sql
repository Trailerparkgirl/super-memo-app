-- スーパーメモのテーブル定義。Supabase の SQL Editor に貼り付けて実行する。
-- 何度実行しても大丈夫なように書いてある。

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('note', 'qa', 'word')),
  -- 自由メモ: タイトル / 問題形式: 問題 / 単語: 単語
  title text not null,
  -- 自由メモ: 本文 / 問題形式: 答え / 単語: 意味
  body text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ts-fsrs の Card をそのまま保存する
  card jsonb not null,
  -- card.due と同じ値（検索・並び替え用）
  due timestamptz not null
);

-- 前のバージョンで作ったテーブルでも「単語」を保存できるようにする
alter table public.memos drop constraint if exists memos_type_check;
alter table public.memos add constraint memos_type_check check (type in ('note', 'qa', 'word'));

-- 勉強している言語（en: 英語 / de: ドイツ語 / ja: 日本語）。前のバージョンで作ったメモは英語にする
alter table public.memos add column if not exists lang text not null default 'en';
alter table public.memos drop constraint if exists memos_lang_check;
alter table public.memos add constraint memos_lang_check check (lang in ('en', 'de', 'ja'));

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

-- 毎日の復習リマインダー（Web Push）の送り先。通知を受け取る端末（ブラウザ）ごとに1行。
-- 送るのは supabase/functions/daily-reminder（毎時、supabase/cron.sql で呼ぶ）
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  -- 通知する時刻（その端末の時間帯で 0〜23 時）
  remind_hour smallint not null default 20 check (remind_hour between 0 and 23),
  time_zone text not null,
  -- 通知の言語（ja / en）
  lang text not null default 'ja',
  -- 最後に通知した日（その端末の時間帯の日付）。1日に1回だけ送るため
  last_sent_on date,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- 復習した日ごとの件数（連続日数とカレンダー用）。tz の時間帯で日付を区切る。
-- security invoker なので、上の行レベルセキュリティで本人の記録だけが数えられる。
create or replace function public.review_days(tz text)
returns table (day date, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select (reviewed_at at time zone tz)::date as day, count(*) as count
  from public.review_logs
  group by 1
  order by 1
$$;

-- 以前は Gemini の API キーをここに保存していた。例文は API キー不要の Tatoeba に変えたので消す。
drop table if exists public.user_settings;

-- ---- マインドマップ ----
-- 仕事やコーディングで学んだことを、テーマを中心に枝を伸ばしたマップとして持つ。

-- マップ。kind = inbox は「受信箱」（＋で書いた一言をためておく。1人に1つ）
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'map' check (kind in ('map', 'inbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_user_idx on public.maps (user_id);
create unique index if not exists maps_one_inbox_idx on public.maps (user_id) where kind = 'inbox';

-- マップの項目。parent_id が null のものがマップの中心（テーマ）で、マップに1つだけ
create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  map_id uuid not null references public.maps on delete cascade,
  parent_id uuid references public.nodes on delete cascade,
  -- 兄弟の中での順番（小さいほど先）
  position double precision not null default 0,
  title text not null,
  -- 定義。マップには出さず、項目を開いたときと復習のときに見る
  definition text not null default '',
  -- テーマから出る枝の色（indigo / sky など）。その先の枝は親の色を受け継ぐ
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nodes_map_idx on public.nodes (map_id);
create index if not exists nodes_parent_idx on public.nodes (parent_id);
create unique index if not exists nodes_one_center_idx on public.nodes (map_id) where parent_id is null;

-- 復習カード。explain: 定義を思い出す / children: 枝（子の項目）を思い出す。1つの項目に種類ごとに1枚
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  node_id uuid not null references public.nodes on delete cascade,
  kind text not null check (kind in ('explain', 'children')),
  -- ts-fsrs の Card をそのまま保存する（memos.card と同じ）
  card jsonb not null,
  -- card.due と同じ値（検索・並び替え用）
  due timestamptz not null,
  created_at timestamptz not null default now(),
  unique (node_id, kind)
);

create index if not exists cards_user_due_idx on public.cards (user_id, due);

-- 復習の記録は、単語なら memo_id、マップなら card_id のどちらか一方を持つ
alter table public.review_logs add column if not exists card_id uuid references public.cards on delete cascade;
alter table public.review_logs alter column memo_id drop not null;
alter table public.review_logs drop constraint if exists review_logs_target_check;
alter table public.review_logs add constraint review_logs_target_check check ((memo_id is null) <> (card_id is null));
create index if not exists review_logs_card_idx on public.review_logs (card_id);

alter table public.maps enable row level security;
alter table public.nodes enable row level security;
alter table public.cards enable row level security;

drop policy if exists "own maps" on public.maps;
create policy "own maps" on public.maps
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own nodes" on public.nodes;
create policy "own nodes" on public.nodes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 項目を枝ごと別の親の下へ移す（別のマップへも）。子孫の map_id もまとめて変える。
-- 中心は移さない。自分の枝の中へは移さない。security invoker なので本人の項目しか動かせない
create or replace function public.move_node(node uuid, new_parent uuid, new_position double precision)
returns void
language sql
security invoker
set search_path = ''
as $$
  with recursive subtree as (
    select id from public.nodes where id = node and parent_id is not null
    union all
    select n.id from public.nodes n join subtree s on n.parent_id = s.id
  )
  update public.nodes set
    map_id = (select map_id from public.nodes where id = new_parent),
    parent_id = case when id = node then new_parent else parent_id end,
    position = case when id = node then new_position else position end,
    updated_at = case when id = node then now() else updated_at end
  where id in (select id from subtree)
    and exists (select 1 from public.nodes where id = new_parent)
    and not exists (select 1 from subtree where id = new_parent)
$$;

-- 前のバージョンの「自由メモ」「問題と答え」を、受信箱の項目に移す（単語はそのまま）。何度実行しても大丈夫。
-- タイトル（問題）→ 項目、本文（答え）→ 定義。ID はそのまま使い、復習の状況と記録もカードに引き継ぐので、連続記録も途切れない
insert into public.maps (user_id, kind)
select distinct m.user_id, 'inbox' from public.memos m
where m.type in ('note', 'qa')
on conflict do nothing;

insert into public.nodes (user_id, map_id, title)
select i.user_id, i.id, '受信箱' from public.maps i
where i.kind = 'inbox'
on conflict do nothing;

insert into public.nodes (id, user_id, map_id, parent_id, position, title, definition, created_at, updated_at)
select m.id, m.user_id, c.map_id, c.id, extract(epoch from m.created_at), m.title, m.body, m.created_at, m.updated_at
from public.memos m
join public.maps i on i.user_id = m.user_id and i.kind = 'inbox'
join public.nodes c on c.map_id = i.id and c.parent_id is null
where m.type in ('note', 'qa')
on conflict do nothing;

insert into public.cards (id, user_id, node_id, kind, card, due, created_at)
select m.id, m.user_id, m.id, 'explain', m.card, m.due, m.created_at
from public.memos m
where m.type in ('note', 'qa') and exists (select 1 from public.nodes n where n.id = m.id)
on conflict do nothing;

update public.review_logs l set card_id = l.memo_id, memo_id = null
from public.memos m
where m.id = l.memo_id and m.type in ('note', 'qa')
  and exists (select 1 from public.cards c where c.id = m.id);

delete from public.memos m
where m.type in ('note', 'qa') and exists (select 1 from public.cards c where c.id = m.id);
