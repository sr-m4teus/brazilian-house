create table clans (
  id bigint generated always as identity primary key,
  tag text not null unique,
  name text not null,
  slot int not null
);

create table seasons (
  id bigint generated always as identity primary key,
  key text not null unique,        -- "2026-06"
  label text not null
);

create table players (
  id bigint generated always as identity primary key,
  tag text not null unique,
  name text not null
);

create table season_clans (
  id bigint generated always as identity primary key,
  season_id bigint not null references seasons(id),
  clan_id bigint not null references clans(id),
  rank int,
  total_stars int not null default 0,
  total_destruction numeric not null default 0,
  total_attacks int not null default 0,
  fetched_at timestamptz not null default now(),
  unique (season_id, clan_id)
);

create table player_season_stats (
  id bigint generated always as identity primary key,
  season_clan_id bigint not null references season_clans(id) on delete cascade,
  player_id bigint not null references players(id),
  townhall_level int not null,
  map_position int not null,
  attacks_used int not null default 0,
  attacks_available int not null default 0,
  stars int not null default 0,
  destruction_avg numeric not null default 0,
  three_stars int not null default 0,
  two_stars int not null default 0,
  one_stars int not null default 0,
  zero_stars int not null default 0,
  missed int not null default 0,
  defenses int not null default 0,
  defensive_stars int not null default 0,
  defensive_destruction numeric not null default 0,
  unique (season_clan_id, player_id)
);

create table cron_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  season_key text,
  status text not null,            -- "ok" | "partial" | "error"
  detail jsonb
);

-- Public read-only access; writes happen with the service role key (bypasses RLS).
alter table clans enable row level security;
alter table seasons enable row level security;
alter table players enable row level security;
alter table season_clans enable row level security;
alter table player_season_stats enable row level security;
alter table cron_runs enable row level security;

create policy "public read clans" on clans for select using (true);
create policy "public read seasons" on seasons for select using (true);
create policy "public read players" on players for select using (true);
create policy "public read season_clans" on season_clans for select using (true);
create policy "public read pss" on player_season_stats for select using (true);
create policy "public read cron_runs" on cron_runs for select using (true);

insert into clans (tag, name, slot) values
  ('#90YVJJC8', 'Brazilian House 1', 1),
  ('#2JG0ULJQG', 'Brazilian House 2', 2),
  ('#2CPVJ088C', 'Brazilian House 3', 3);
