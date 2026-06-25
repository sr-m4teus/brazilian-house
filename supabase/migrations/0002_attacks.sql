-- Replace pre-aggregated tables with a single raw attacks table.
drop table if exists player_season_stats;
drop table if exists season_clans;
drop table if exists cron_runs;
drop table if exists players;
drop table if exists seasons;

create table attacks (
  id bigint generated always as identity primary key,
  war_id bigint not null,
  order_ int not null,
  attacker_tag text not null,
  attacker_name text not null,
  attacker_rank int not null,
  attacker_th int not null,
  defender_tag text not null,
  defender_name text not null,
  defender_rank int not null,
  defender_th int not null,
  stars int not null,
  new_stars int not null,
  destruction numeric not null,
  attacker_is_home_clan boolean not null,
  home_clan_tag text not null,
  war_start_time text not null,   -- "YYYY-MM-DD HH:MM:SS"
  type text not null,             -- "league" | "normal"
  unique (war_id, order_)
);

create index attacks_home_clan_idx on attacks (home_clan_tag);

alter table attacks enable row level security;
create policy "public read attacks" on attacks for select using (true);
