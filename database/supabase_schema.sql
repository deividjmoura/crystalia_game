-- Crystalia — schema inicial (Fase 1 / MVP)
-- Rodar no SQL Editor do Supabase.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Aventureiro',
  home_island text not null default 'ignara', -- MVP: só 'ignara' por enquanto
  dom text not null default 'sangue_quente',
  level integer not null default 1,
  xp integer not null default 0,
  hp integer not null default 100,
  max_hp integer not null default 100,
  pos_x real not null default 0,
  pos_y real not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quest_progress (
  id bigint generated always as identity primary key,
  player_id uuid not null references profiles(id) on delete cascade,
  quest_id text not null, -- ex: 'ignara_01_primeira_chama'
  status text not null default 'in_progress', -- in_progress | completed
  updated_at timestamptz not null default now(),
  unique (player_id, quest_id)
);

create table if not exists inventory_items (
  id bigint generated always as identity primary key,
  player_id uuid not null references profiles(id) on delete cascade,
  item_id text not null, -- ex: 'cristal_comum_fogo'
  quantity integer not null default 1,
  equipped boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security: cada jogador só lê/escreve os próprios dados.
-- O servidor de jogo usa a service_role key e ignora essas políticas.
alter table profiles enable row level security;
alter table quest_progress enable row level security;
alter table inventory_items enable row level security;

create policy "profiles: read own" on profiles
  for select using (auth.uid() = id);

create policy "quest_progress: read own" on quest_progress
  for select using (auth.uid() = player_id);

create policy "inventory_items: read own" on inventory_items
  for select using (auth.uid() = player_id);

-- Nenhuma policy de INSERT/UPDATE/DELETE pro client direto:
-- toda escrita de progresso passa pelo servidor autoritativo (service_role).
