-- Polygon Showdown V1 — DRAFT / OWNER REVIEW.
--
-- 1. Registers the game in the trusted catalog as DRAFT. Draft entries are
--    never listed and the game's routes refuse to serve a draft outside an
--    explicit local owner preview, so applying this migration publishes nothing.
-- 2. Adds the permanent progress of signed-in MathNexa accounts: a wallet of
--    virtual Polygon Coins with an auditable ledger, owned cosmetics, a saved
--    avatar, Solo runs and achievements. Keyed by the internal user id.
-- 3. Adds Showdown rooms. A room is temporary: guests (room code or QR, no
--    account) exist only inside it, their names, scores and boards are deleted
--    with it, and no wallet, inventory, avatar or Solo run is ever created
--    from a room code or a school access code.
--
-- Authority model
--   * Browsers never touch these tables: RLS is forced, anon/authenticated hold
--     no grants, and every function is SECURITY DEFINER with EXECUTE for
--     service_role only. The application server is the only caller.
--   * A browser sends swaps, never results. The server replays every swap
--     through the shared game engine and stores what actually happened. Coins
--     reach a wallet only here, once, under a unique idempotency key.
--   * Every swap in a Showdown writes one participant row. No swap ever takes
--     the room row, so a full room never queues behind itself.

do $migration$
declare
  entry_id uuid;
  existing_slug_conflict bigint;
  next_order smallint;
begin
  select count(*) into existing_slug_conflict
  from public.game_catalog_entries
  where slug='polygon-showdown' and stable_key<>'polygon-showdown';
  if existing_slug_conflict<>0 then
    raise exception 'Polygon Showdown slug belongs to another catalog identity';
  end if;

  select coalesce(
    (select display_order from public.game_catalog_entries where stable_key='polygon-showdown'),
    (select max(display_order)+1 from public.game_catalog_entries),
    1
  ) into next_order;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'polygon-showdown','polygon-showdown','Polygon Showdown',
    'Match geometric shapes, build combos, earn coins, shop for avatar styles, or challenge friends in a live Showdown.',
    'internal','builtin:polygon-showdown',1,8,
    array['geometry','pattern-recognition','shape-recognition','strategy'],
    array['geometry','shapes'],
    array['classroom-game','free-game','geometry','live-multiplayer','match-three','smart-board'],
    'mixed','draft',next_order,'1.0.0',
    jsonb_build_object(
      'internal_registry_key','polygon-showdown',
      'internal_route','/games/polygon-showdown/play',
      'join_route','/join',
      'category','Geometry',
      'implementation_version','1.0.0',
      'access','free for signed-in accounts; Showdown guests join with a room code and display name only',
      'release_state','draft-owner-review'
    ),
    jsonb_build_object('strategy','keep draft; to withdraw after release set status to archived (routes then refuse new rooms and runs)')
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='polygon-showdown',
    title='Polygon Showdown',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:polygon-showdown',
    recommended_grade_min=1,
    recommended_grade_max=8,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=next_order,
    version='1.0.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into entry_id;

  perform private.record_game_catalog_version(entry_id,null,null);
end
$migration$;

-- ------------------------------------------------------------- shared checks

create or replace function private.polygon_ms(p timestamptz)
returns bigint language sql immutable set search_path=''
as $$ select floor(extract(epoch from p)*1000)::bigint $$;
revoke all on function private.polygon_ms(timestamptz) from public,anon,authenticated;

-- The shape of a stored game state (mirrors engine/game.js isGameState).
create or replace function private.polygon_state_valid(p jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(
    jsonb_typeof(p)='object'
    and p->>'board' ~ '^[0-8]{64}$'
    and jsonb_typeof(p->'cursors')='array' and jsonb_array_length(p->'cursors')=8
    and (p->>'moves') ~ '^[0-9]{1,9}$'
    and (p->>'coins') ~ '^[0-9]{1,9}$'
    and (p->>'score') ~ '^[0-9]{1,12}$'
    and (p->>'matches') ~ '^[0-9]{1,9}$'
    and (p->>'cascades') ~ '^[0-9]{1,9}$'
    and (p->>'largestClear') ~ '^[0-9]{1,4}$'
    and (p->>'bestCombo') ~ '^[0-9]{1,4}$',
    false)
$$;
revoke all on function private.polygon_state_valid(jsonb) from public,anon,authenticated;
-- A table check runs as whoever writes the row; the application server is the only such writer.
grant execute on function private.polygon_state_valid(jsonb) to service_role;

-- ------------------------------------------------------------ the shop's prices

create table public.polygon_shop_items (
  item_key text primary key check (item_key ~ '^[a-z0-9-]{2,48}$'),
  slot text not null check (slot in ('hair','hairColor','facialHair','lipstick','eyeShadow','blush','eyeliner','top','bottom','outfit','jacket','shoes','hat','glasses','jewelry')),
  name text not null check (name=btrim(name) and char_length(name) between 2 and 60),
  price integer not null check (price between 0 and 1000000),
  tier text not null check (tier in ('starter','basic','mid','premium','rare','luxury','legendary')),
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  check ((price=0)=(tier='starter'))
);
create index polygon_shop_items_slot_idx on public.polygon_shop_items(slot);
alter table public.polygon_shop_items enable row level security;
alter table public.polygon_shop_items force row level security;
revoke all on table public.polygon_shop_items from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_shop_items to service_role;

insert into public.polygon_shop_items(item_key,slot,name,price,tier) values
('top-everyday','top','Everyday Tee',0,'starter'),
('top-navy','top','Navy Basic Tee',0,'starter'),
('top-long-gray','top','Soft Long Sleeve',0,'starter'),
('top-sunrise','top','Sunrise Tee',25,'basic'),
('top-pink-pop','top','Pink Pop Tee',25,'basic'),
('top-breeze','top','Striped Breeze Tee',35,'basic'),
('top-bolt','top','Bolt Print Tee',50,'basic'),
('top-prism-polo','top','Prism Polo',60,'basic'),
('top-hex-hoodie','top','Hex Hoodie',180,'mid'),
('top-angle-knit','top','Angle Knit Sweater',240,'mid'),
('top-grid-flannel','top','Grid Flannel',300,'mid'),
('top-aurora-blouse','top','Aurora Silk Blouse',600,'premium'),
('top-comet-hoodie','top','Comet Trail Hoodie',1500,'rare'),
('top-starfield','top','Starfield Couture Top',4000,'luxury'),
('bottom-jeans','bottom','Classic Jeans',0,'starter'),
('bottom-joggers','bottom','Everyday Joggers',0,'starter'),
('bottom-simple-skirt','bottom','Simple Skirt',0,'starter'),
('bottom-trail-shorts','bottom','Trail Shorts',30,'basic'),
('bottom-denim-shorts','bottom','Denim Shorts',40,'basic'),
('bottom-pleated','bottom','Pleated Skirt',60,'basic'),
('bottom-cargo','bottom','Cargo Pants',75,'basic'),
('bottom-tristripe','bottom','Tri-Stripe Track Pants',150,'mid'),
('bottom-midnight-chinos','bottom','Midnight Chinos',200,'mid'),
('bottom-wave-skirt','bottom','Wave Skirt',260,'mid'),
('bottom-velvet','bottom','Velvet Trousers',650,'premium'),
('bottom-nebula','bottom','Nebula Joggers',1400,'rare'),
('bottom-gilded-pleat','bottom','Gilded Pleat Skirt',3500,'luxury'),
('outfit-sundress','outfit','Simple Sundress',0,'starter'),
('outfit-starter-suit','outfit','Starter Suit',0,'starter'),
('outfit-picnic','outfit','Picnic Dress',75,'basic'),
('outfit-garden-wrap','outfit','Garden Wrap Dress',320,'mid'),
('outfit-smart-suit','outfit','Smart Casual Suit',380,'mid'),
('outfit-evening-gala','outfit','Evening Gala Dress',750,'premium'),
('outfit-midnight-suit','outfit','Midnight Tailored Suit',750,'premium'),
('outfit-emerald-three','outfit','Emerald Three-Piece',2500,'rare'),
('outfit-prism-gown','outfit','Prism Ball Gown',3000,'rare'),
('outfit-moonlight','outfit','Moonlight Couture Gown',8000,'luxury'),
('outfit-golden-regalia','outfit','Golden Ratio Regalia',15000,'legendary'),
('outfit-celestial','outfit','Celestial Gown',20000,'legendary'),
('jacket-windbreaker','jacket','Light Windbreaker',70,'basic'),
('jacket-denim-trucker','jacket','Denim Trucker',220,'mid'),
('jacket-varsity','jacket','Varsity Vector',350,'mid'),
('jacket-neon-bomber','jacket','Neon Bomber',500,'premium'),
('jacket-moto','jacket','Midnight Moto',720,'premium'),
('jacket-galaxy-puffer','jacket','Galaxy Puffer',2200,'rare'),
('jacket-silver-frost','jacket','Silver Frost Parka',5000,'luxury'),
('jacket-phoenix','jacket','Phoenix Flame Coat',12000,'legendary'),
('shoes-everyday','shoes','Everyday Sneakers',0,'starter'),
('shoes-simple-flats','shoes','Simple Flats',0,'starter'),
('shoes-canvas','shoes','Canvas Lows',40,'basic'),
('shoes-slipons','shoes','Trail Slip-Ons',45,'basic'),
('shoes-bright-laces','shoes','Bright Lace Sneakers',60,'basic'),
('shoes-comet','shoes','Comet Runners',250,'mid'),
('shoes-urban-boots','shoes','Urban Boots',300,'mid'),
('shoes-nova-high','shoes','Nova High-Top Sneakers',350,'mid'),
('shoes-cloudstep','shoes','Cloudstep Platforms',600,'premium'),
('shoes-lightning','shoes','Lightning Kicks',1800,'rare'),
('shoes-stardust-heels','shoes','Stardust Heels',4000,'luxury'),
('shoes-golden-apex','shoes','Golden Apex Sneakers',10000,'legendary'),
('hat-plain-cap','hat','Plain Cap',0,'starter'),
('hat-beanie','hat','Cozy Beanie',60,'basic'),
('hat-bucket','hat','Sun Bucket Hat',70,'basic'),
('hat-snapback','hat','Snapback Cap',75,'basic'),
('hat-neon-visor','hat','Neon Visor',150,'mid'),
('hat-fedora','hat','Explorer Fedora',200,'mid'),
('hat-wide-sunhat','hat','Wide Brim Sunhat',550,'premium'),
('hat-wizard','hat','Wizard Cone',1600,'rare'),
('hat-polygon-crown','hat','Polygon Crown',6000,'luxury'),
('hat-supernova-halo','hat','Supernova Halo',25000,'legendary'),
('glasses-round','glasses','Round Readers',0,'starter'),
('glasses-retro','glasses','Retro Squares',50,'basic'),
('glasses-shades','glasses','Classic Shades',60,'basic'),
('glasses-aviator','glasses','Aviator Frames',180,'mid'),
('glasses-neon','glasses','Neon Edge Frames',260,'mid'),
('glasses-hex','glasses','Hex Frames',520,'premium'),
('glasses-starlight','glasses','Starlight Shades',1200,'rare'),
('glasses-diamond','glasses','Diamond-Cut Frames',3000,'luxury'),
('jewelry-studs','jewelry','Stud Earrings',0,'starter'),
('jewelry-bead-bracelet','jewelry','Bead Bracelet',30,'basic'),
('jewelry-hoops','jewelry','Hoop Earrings',45,'basic'),
('jewelry-simple-chain','jewelry','Simple Chain',55,'basic'),
('jewelry-turquoise-pendant','jewelry','Turquoise Pendant',190,'mid'),
('jewelry-sport-watch','jewelry','Sport Watch',230,'mid'),
('jewelry-layered-chain','jewelry','Layered Chain',300,'mid'),
('jewelry-pearls','jewelry','Pearl Necklace',700,'premium'),
('jewelry-prism-pendant','jewelry','Prism Pendant',2000,'rare'),
('jewelry-golden-hoops','jewelry','Golden Hoops Deluxe',3200,'luxury'),
('jewelry-platinum-chrono','jewelry','Platinum Chrono',4500,'luxury'),
('jewelry-infinity','jewelry','Infinity Medallion',8000,'legendary'),
('hair-bald','hair','Shaved',0,'starter'),
('hair-short','hair','Short Crop',0,'starter'),
('hair-long','hair','Long Layers',0,'starter'),
('hair-curly','hair','Natural Curls',0,'starter'),
('hair-straight','hair','Straight Cut',0,'starter'),
('hair-braids','hair','Braids',0,'starter'),
('hair-locs','hair','Locs',0,'starter'),
('hair-afro','hair','Afro',0,'starter'),
('hair-fade','hair','Fade',0,'starter'),
('hair-bun','hair','Top Bun',0,'starter'),
('hair-ponytail','hair','Ponytail',0,'starter'),
('hair-twin-buns','hair','Twin Buns',160,'mid'),
('hair-high-puff','hair','High Puff',180,'mid'),
('hair-long-twists','hair','Long Twists',220,'mid'),
('hair-crown-braids','hair','Crown Braids',650,'premium'),
('hair-waterfall-locs','hair','Waterfall Locs',700,'premium'),
('hair-cosmic-coils','hair','Cosmic Coils',1000,'rare'),
('hair-starlight-mohawk','hair','Starlight Mohawk',1500,'rare'),
('hair-aurora-waves','hair','Aurora Waves',2000,'rare'),
('hair-regal-updo','hair','Regal Updo',2500,'luxury'),
('hair-supernova-afro','hair','Supernova Afro',6000,'legendary'),
('hc-black','hairColor','Black',0,'starter'),
('hc-dark-brown','hairColor','Dark Brown',0,'starter'),
('hc-brown','hairColor','Brown',0,'starter'),
('hc-auburn','hairColor','Auburn',0,'starter'),
('hc-dark-blonde','hairColor','Dark Blonde',0,'starter'),
('hc-blonde','hairColor','Blonde',0,'starter'),
('hc-gray','hairColor','Silver Gray',0,'starter'),
('hc-white','hairColor','White',0,'starter'),
('hc-turquoise','hairColor','Turquoise Tide',80,'basic'),
('hc-pink','hairColor','Bubblegum Pink',80,'basic'),
('hc-violet','hairColor','Violet Haze',120,'mid'),
('hc-copper','hairColor','Sunset Copper',150,'mid'),
('hc-prism-silver','hairColor','Prism Silver',500,'premium'),
('hc-molten-gold','hairColor','Molten Gold',1000,'rare'),
('fh-none','facialHair','Clean-Shaven',0,'starter'),
('fh-mustache','facialHair','Mustache',0,'starter'),
('fh-short-beard','facialHair','Short Beard',0,'starter'),
('fh-goatee','facialHair','Goatee',40,'basic'),
('fh-full-beard','facialHair','Full Beard',60,'basic'),
('fh-curled-mustache','facialHair','Curled Mustache',140,'mid'),
('fh-sculpted-goatee','facialHair','Sculpted Goatee',170,'mid'),
('fh-royal-beard','facialHair','Royal Beard',520,'premium'),
('lip-none','lipstick','No Lipstick',0,'starter'),
('lip-natural','lipstick','Natural Tint',0,'starter'),
('lip-rose','lipstick','Rose Petal',25,'basic'),
('lip-berry','lipstick','Berry Crush',30,'basic'),
('lip-coral','lipstick','Coral Reef',30,'basic'),
('lip-crimson','lipstick','Crimson Velvet',120,'mid'),
('lip-galaxy','lipstick','Galaxy Gloss',500,'premium'),
('shadow-none','eyeShadow','No Eye Shadow',0,'starter'),
('shadow-peach','eyeShadow','Soft Peach',30,'basic'),
('shadow-sky','eyeShadow','Sky Shimmer',40,'basic'),
('shadow-emerald','eyeShadow','Emerald Smoke',150,'mid'),
('shadow-aurora','eyeShadow','Aurora Glow',520,'premium'),
('shadow-diamond','eyeShadow','Diamond Dust',2500,'luxury'),
('blush-none','blush','No Blush',0,'starter'),
('blush-peony','blush','Peony Blush',25,'basic'),
('blush-apricot','blush','Apricot Blush',25,'basic'),
('blush-sunset','blush','Sunset Glow',120,'mid'),
('liner-none','eyeliner','No Eyeliner',0,'starter'),
('liner-soft','eyeliner','Soft Black Liner',25,'basic'),
('liner-winged','eyeliner','Winged Liner',130,'mid'),
('liner-electric','eyeliner','Electric Blue Wing',500,'premium')
;

-- ------------------------------------------------- permanent account progress

create table public.polygon_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  earned_day date,
  earned_today integer not null default 0 check (earned_today >= 0),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.polygon_wallets enable row level security;
alter table public.polygon_wallets force row level security;
revoke all on table public.polygon_wallets from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_wallets to service_role;

-- Every change to a balance, forever: earned here, spent there.
create table public.polygon_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('EARN_SOLO','EARN_SHOWDOWN','PURCHASE_ITEM')),
  amount integer not null check ((event='PURCHASE_ITEM' and amount<0) or (event<>'PURCHASE_ITEM' and amount>0)),
  balance_after integer not null check (balance_after >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  item_key text references public.polygon_shop_items(item_key) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default statement_timestamp(),
  unique (user_id, idempotency_key),
  check ((event='PURCHASE_ITEM')=(item_key is not null))
);
create index polygon_ledger_user_idx on public.polygon_ledger(user_id,id desc);
alter table public.polygon_ledger enable row level security;
alter table public.polygon_ledger force row level security;
revoke all on table public.polygon_ledger from public,anon,authenticated;
grant select,insert on table public.polygon_ledger to service_role;

create table public.polygon_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.polygon_shop_items(item_key) on delete restrict,
  acquired_at timestamptz not null default statement_timestamp(),
  primary key (user_id, item_key)
);
alter table public.polygon_inventory enable row level security;
alter table public.polygon_inventory force row level security;
revoke all on table public.polygon_inventory from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_inventory to service_role;

create table public.polygon_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or (display_name=btrim(display_name) and char_length(display_name) between 2 and 20)),
  emoji text check (private.bingo_emoji_valid(emoji)),
  avatar jsonb check (avatar is null or (jsonb_typeof(avatar)='object' and octet_length(avatar::text) <= 2048)),
  best_score bigint not null default 0 check (best_score >= 0),
  best_combo integer not null default 0 check (best_combo >= 0),
  largest_clear integer not null default 0 check (largest_clear >= 0),
  total_matches bigint not null default 0 check (total_matches >= 0),
  total_cascades bigint not null default 0 check (total_cascades >= 0),
  total_runs integer not null default 0 check (total_runs >= 0),
  showdowns_played integer not null default 0 check (showdowns_played >= 0),
  showdowns_won integer not null default 0 check (showdowns_won >= 0),
  achievements jsonb not null default '{}'::jsonb check (jsonb_typeof(achievements)='object'),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.polygon_profiles enable row level security;
alter table public.polygon_profiles force row level security;
revoke all on table public.polygon_profiles from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_profiles to service_role;

create table public.polygon_solo_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  state jsonb not null check (private.polygon_state_valid(state)),
  version integer not null default 1,
  -- Which open window owns the run; `session_started_at` is its timeline's zero.
  epoch integer not null default 1,
  session_started_at timestamptz not null default statement_timestamp(),
  next_t integer not null default 0 check (next_t >= 0),
  banked integer not null default 0 check (banked >= 0),
  bank_seq integer not null default 0 check (bank_seq >= 0),
  last_bank_at timestamptz not null default statement_timestamp(),
  started_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  check ((status='ended')=(ended_at is not null))
);
create unique index polygon_solo_one_active_idx on public.polygon_solo_runs(user_id) where status='active';
create index polygon_solo_user_idx on public.polygon_solo_runs(user_id,started_at desc);
alter table public.polygon_solo_runs enable row level security;
alter table public.polygon_solo_runs force row level security;
revoke all on table public.polygon_solo_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_solo_runs to service_role;

-- ------------------------------------------------------------ temporary rooms

create table public.polygon_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[1-9][0-9]{5}$'),
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  host_token_hash text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open','closed')),
  phase text not null default 'LOBBY' check (phase in ('LOBBY','RUNNING','ENDED')),
  duration_seconds integer not null check (duration_seconds in (300,420,600,900,1200,1800)),
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  start_state jsonb not null check (private.polygon_state_valid(start_state)),
  starts_at timestamptz,
  ends_at timestamptz,
  join_locked boolean not null default false,
  version bigint not null default 1,
  standings jsonb not null default '[]'::jsonb check (jsonb_typeof(standings)='array'),
  standings_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check (phase='LOBBY' or (starts_at is not null and ends_at is not null))
);
create unique index polygon_rooms_open_code_idx on public.polygon_rooms(code) where status='open';
create unique index polygon_rooms_host_token_idx on public.polygon_rooms(host_token_hash);
create index polygon_rooms_owner_idx on public.polygon_rooms(owner_hash,created_at);
create index polygon_rooms_expires_idx on public.polygon_rooms(expires_at);
alter table public.polygon_rooms enable row level security;
alter table public.polygon_rooms force row level security;
revoke all on table public.polygon_rooms from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_rooms to service_role;

create table public.polygon_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.polygon_rooms(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null check (display_name=btrim(display_name) and char_length(display_name) between 2 and 40),
  name_key text not null,
  emoji text check (private.bingo_emoji_valid(emoji)),
  is_creator boolean not null default false,
  -- Set only when the player was signed in to a MathNexa account at join. It
  -- makes the player eligible for a validated reward; it changes nothing in play.
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','removed')),
  state jsonb not null check (private.polygon_state_valid(state)),
  coins integer not null default 0 check (coins >= 0),
  score bigint not null default 0 check (score >= 0),
  best_combo integer not null default 0 check (best_combo >= 0),
  largest_clear integer not null default 0 check (largest_clear >= 0),
  moves integer not null default 0 check (moves >= 0),
  next_t integer not null default 0 check (next_t >= 0),
  version integer not null default 1,
  reward integer,
  joined_at timestamptz not null default statement_timestamp(),
  seen_at timestamptz not null default statement_timestamp(),
  check (not (is_creator and status='removed'))
);
create unique index polygon_participants_token_idx on public.polygon_participants(token_hash);
create unique index polygon_participants_active_name_idx on public.polygon_participants(room_id,name_key) where status='active';
create unique index polygon_participants_one_creator_idx on public.polygon_participants(room_id) where is_creator;
create index polygon_participants_room_idx on public.polygon_participants(room_id);
alter table public.polygon_participants enable row level security;
alter table public.polygon_participants force row level security;
revoke all on table public.polygon_participants from public,anon,authenticated;
grant select,insert,update,delete on table public.polygon_participants to service_role;

-- --------------------------------------------- one code space for every live game

-- A six-digit code identifies exactly one open room across all live games.
-- Math Bingo Live's own functions need no change: a code held by a Polygon
-- Showdown room looks to them like one more taken code.
create or replace function private.live_room_code_guard()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status='open' then
    perform pg_advisory_xact_lock(hashtext('live-room-code:'||new.code));
    if exists (select 1 from public.polygon_rooms p where p.code=new.code and p.status='open') then
      raise unique_violation using message='This room code belongs to another live game.';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.live_room_code_guard() from public,anon,authenticated;
create trigger bingo_rooms_live_code_guard before insert or update of code on public.bingo_rooms
  for each row execute function private.live_room_code_guard();

-- Which game owns an open code: null, 'polygon_showdown' or 'math_bingo_live'.
create or replace function public.live_room_game_for_code(p_code text)
returns text language sql stable security definer set search_path=''
as $$
  select case
    when exists (select 1 from public.polygon_rooms p where p.code=p_code and p.status='open' and p.expires_at > statement_timestamp()) then 'polygon_showdown'
    when exists (select 1 from public.bingo_rooms b where b.code=p_code and b.status='open' and b.expires_at > statement_timestamp()) then 'math_bingo_live'
    else null
  end
$$;
revoke all on function public.live_room_game_for_code(text) from public,anon,authenticated;
grant execute on function public.live_room_game_for_code(text) to service_role;

-- --------------------------------------------------------------------- wallet

-- The only way coins are earned. One credit per idempotency key, whatever is
-- retried. The daily limit (engine/economy.js DAILY_EARN_CAP) stops a modified
-- client from farming the shop; the run itself keeps counting.
create or replace function private.polygon_credit(p_user uuid, p_event text, p_amount integer, p_key text, p_meta jsonb)
returns jsonb language plpgsql set search_path=''
as $$
declare
  w public.polygon_wallets;
  today date := (statement_timestamp() at time zone 'utc')::date;
  so_far integer;
  credited integer;
begin
  insert into public.polygon_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.polygon_wallets where user_id=p_user for update;
  if p_amount <= 0 then
    return jsonb_build_object('credited',0,'balance',w.balance,'capped',false);
  end if;
  if exists (select 1 from public.polygon_ledger l where l.user_id=p_user and l.idempotency_key=p_key) then
    return jsonb_build_object('credited',0,'balance',w.balance,'capped',false,'duplicate',true);
  end if;
  so_far := case when w.earned_day=today then w.earned_today else 0 end;
  credited := least(p_amount, greatest(0, 15000-so_far));
  if credited = 0 then
    return jsonb_build_object('credited',0,'balance',w.balance,'capped',true);
  end if;
  update public.polygon_wallets set
    balance=balance+credited,
    lifetime_earned=lifetime_earned+credited,
    earned_day=today,
    earned_today=so_far+credited,
    updated_at=statement_timestamp()
    where user_id=p_user returning * into w;
  insert into public.polygon_ledger(user_id,event,amount,balance_after,idempotency_key,metadata)
    values(p_user,p_event,credited,w.balance,p_key,coalesce(p_meta,'{}'::jsonb));
  return jsonb_build_object('credited',credited,'balance',w.balance,'capped',credited<p_amount);
end
$$;
revoke all on function private.polygon_credit(uuid,text,integer,text,jsonb) from public,anon,authenticated;

-- Puts whatever a run has earned since it last banked into the wallet.
create or replace function private.polygon_bank_run(p_run public.polygon_solo_runs)
returns jsonb language plpgsql set search_path=''
as $$
declare
  delta integer := (p_run.state->>'coins')::integer - p_run.banked;
  outcome jsonb;
begin
  if delta <= 0 then
    insert into public.polygon_wallets(user_id) values(p_run.user_id) on conflict (user_id) do nothing;
    return jsonb_build_object('credited',0,'balance',(select balance from public.polygon_wallets where user_id=p_run.user_id),'capped',false);
  end if;
  outcome := private.polygon_credit(p_run.user_id,'EARN_SOLO',delta,'solo:'||p_run.id::text||':'||(p_run.bank_seq+1)::text,
    jsonb_build_object('run',p_run.id,'coins',(p_run.state->>'coins')::integer));
  update public.polygon_solo_runs set banked=(p_run.state->>'coins')::integer, bank_seq=bank_seq+1, last_bank_at=statement_timestamp()
    where id=p_run.id;
  return outcome;
end
$$;
revoke all on function private.polygon_bank_run(public.polygon_solo_runs) from public,anon,authenticated;

create or replace function private.polygon_grant_achievements(p_user uuid, p_keys text[])
returns text[] language plpgsql set search_path=''
as $$
declare
  fresh text[];
  now_text text := to_char(statement_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if p_keys is null or cardinality(p_keys)=0 then return '{}'::text[]; end if;
  insert into public.polygon_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  select coalesce(array_agg(k),'{}'::text[]) into fresh
    from unnest(p_keys) k
    where not ((select achievements from public.polygon_profiles where user_id=p_user) ? k);
  if cardinality(fresh)>0 then
    update public.polygon_profiles set
      achievements=achievements || (select jsonb_object_agg(k,now_text) from unnest(fresh) k),
      updated_at=statement_timestamp()
      where user_id=p_user;
  end if;
  return fresh;
end
$$;
revoke all on function private.polygon_grant_achievements(uuid,text[]) from public,anon,authenticated;

-- ------------------------------------------------------------ account surface

create or replace function public.polygon_bootstrap(p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  run public.polygon_solo_runs;
  w public.polygon_wallets;
  p public.polygon_profiles;
begin
  -- Coins a run earned before the player left reach the wallet on return.
  select * into run from public.polygon_solo_runs where user_id=p_user and status='active' for update;
  if run.id is not null then perform private.polygon_bank_run(run); end if;
  insert into public.polygon_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  insert into public.polygon_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.polygon_wallets where user_id=p_user;
  select * into p from public.polygon_profiles where user_id=p_user;
  select * into run from public.polygon_solo_runs where user_id=p_user and status='active';
  return jsonb_build_object(
    'result','ok',
    'wallet',jsonb_build_object('balance',w.balance,'lifetimeEarned',w.lifetime_earned),
    'profile',jsonb_build_object(
      'displayName',p.display_name,'emoji',p.emoji,'avatar',p.avatar,
      'bestScore',p.best_score,'bestCombo',p.best_combo,'largestClear',p.largest_clear,
      'totalMatches',p.total_matches,'totalCascades',p.total_cascades,'totalRuns',p.total_runs,
      'showdownsPlayed',p.showdowns_played,'showdownsWon',p.showdowns_won,'achievements',p.achievements),
    'inventory',(select coalesce(jsonb_agg(i.item_key order by i.item_key),'[]'::jsonb) from public.polygon_inventory i where i.user_id=p_user),
    'activeRun',case when run.id is null then null else jsonb_build_object(
      'id',run.id,'coins',(run.state->>'coins')::integer,'score',(run.state->>'score')::bigint,
      'matches',(run.state->>'matches')::integer,'bestCombo',(run.state->>'bestCombo')::integer,
      'startedAtMs',private.polygon_ms(run.started_at),'updatedAtMs',private.polygon_ms(run.updated_at)) end
  );
end
$$;

create or replace function private.polygon_run_view(p_run public.polygon_solo_runs, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'result',p_result,'id',p_run.id,'seed',p_run.seed,'state',p_run.state,'version',p_run.version,'epoch',p_run.epoch,
    'nextT',p_run.next_t,'nowMs',private.polygon_ms(statement_timestamp()),'sessionStartMs',private.polygon_ms(p_run.session_started_at),
    'banked',p_run.banked,'lastBankMs',private.polygon_ms(p_run.last_bank_at),
    'totals',(select jsonb_build_object(
        'matches',coalesce(pr.total_matches,0),'bestCombo',coalesce(pr.best_combo,0),'largestClear',coalesce(pr.largest_clear,0),
        'bestScore',coalesce(pr.best_score,0),
        'lifetimeCoins',coalesce((select w.lifetime_earned from public.polygon_wallets w where w.user_id=p_run.user_id),0),
        'achievements',coalesce(pr.achievements,'{}'::jsonb))
      from (select 1) one left join public.polygon_profiles pr on pr.user_id=p_run.user_id),
    'balance',coalesce((select w.balance from public.polygon_wallets w where w.user_id=p_run.user_id),0)
  )
$$;
revoke all on function private.polygon_run_view(public.polygon_solo_runs,text) from public,anon,authenticated;

create or replace function private.polygon_end_run(p_run public.polygon_solo_runs)
returns void language plpgsql set search_path=''
as $$
begin
  perform private.polygon_bank_run(p_run);
  update public.polygon_solo_runs set status='ended', ended_at=statement_timestamp(), updated_at=statement_timestamp() where id=p_run.id;
  insert into public.polygon_profiles(user_id) values(p_run.user_id) on conflict (user_id) do nothing;
  update public.polygon_profiles set total_runs=total_runs+1, updated_at=statement_timestamp() where user_id=p_run.user_id;
end
$$;
revoke all on function private.polygon_end_run(public.polygon_solo_runs) from public,anon,authenticated;

-- A new Solo run. One active run per account: asking for another while one is
-- open ends the old one (its coins are banked first) only when `p_replace`.
create or replace function public.polygon_solo_start(p_user uuid, p_seed text, p_state jsonb, p_replace boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  existing public.polygon_solo_runs;
  run public.polygon_solo_runs;
begin
  if not private.polygon_state_valid(p_state) then return jsonb_build_object('result','invalid-request'); end if;
  insert into public.polygon_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  insert into public.polygon_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into existing from public.polygon_solo_runs where user_id=p_user and status='active' for update;
  if existing.id is not null then
    if not p_replace then return jsonb_build_object('result','run-active','id',existing.id); end if;
    perform private.polygon_end_run(existing);
  end if;
  delete from public.polygon_solo_runs where id in (
    select id from public.polygon_solo_runs where user_id=p_user and status='ended' order by started_at desc offset 5);
  insert into public.polygon_solo_runs(user_id,seed,state) values(p_user,p_seed,p_state) returning * into run;
  return private.polygon_run_view(run,'started');
end
$$;

-- This window takes over the run. Any other window's next save is refused.
create or replace function public.polygon_solo_open(p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  run public.polygon_solo_runs;
begin
  select * into run from public.polygon_solo_runs where user_id=p_user and status='active' for update;
  if run.id is null then return jsonb_build_object('result','no-active-run'); end if;
  perform private.polygon_bank_run(run);
  update public.polygon_solo_runs set epoch=epoch+1, session_started_at=statement_timestamp(), next_t=0, updated_at=statement_timestamp()
    where id=run.id returning * into run;
  return private.polygon_run_view(run,'opened');
end
$$;

create or replace function public.polygon_solo_load(p_user uuid, p_run uuid, p_epoch integer)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  run public.polygon_solo_runs;
begin
  select * into run from public.polygon_solo_runs where id=p_run and user_id=p_user;
  if run.id is null then return jsonb_build_object('result','not-found'); end if;
  if run.status<>'active' then return jsonb_build_object('result','ended'); end if;
  if run.epoch<>p_epoch then return jsonb_build_object('result','superseded'); end if;
  return private.polygon_run_view(run,'ok');
end
$$;

-- Stores a replayed state. `p_bank` forces coins into the wallet now; otherwise
-- they go in batches (engine/economy.js BANK_EVERY_COINS / BANK_EVERY_MS).
create or replace function public.polygon_solo_commit(p_user uuid, p_run uuid, p_epoch integer, p_version integer, p_state jsonb, p_next_t integer, p_bank boolean, p_achievements text[], p_end boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  run public.polygon_solo_runs;
  previous jsonb;
  bank jsonb;
  fresh text[];
  balance integer;
  should_bank boolean;
begin
  select * into run from public.polygon_solo_runs where id=p_run and user_id=p_user for update;
  if run.id is null then return jsonb_build_object('result','not-found'); end if;
  if run.status<>'active' then return jsonb_build_object('result','ended'); end if;
  if run.epoch<>p_epoch then return jsonb_build_object('result','superseded'); end if;
  if run.version<>p_version then return jsonb_build_object('result','conflict'); end if;
  if not private.polygon_state_valid(p_state)
     or (p_state->>'moves')::integer < (run.state->>'moves')::integer
     or (p_state->>'coins')::integer < (run.state->>'coins')::integer then
    return jsonb_build_object('result','invalid-request');
  end if;
  previous := run.state;
  update public.polygon_solo_runs set state=p_state, version=version+1, next_t=p_next_t, updated_at=statement_timestamp()
    where id=run.id returning * into run;
  insert into public.polygon_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  update public.polygon_profiles set
    best_score=greatest(best_score,(p_state->>'score')::bigint),
    best_combo=greatest(best_combo,(p_state->>'bestCombo')::integer),
    largest_clear=greatest(largest_clear,(p_state->>'largestClear')::integer),
    total_matches=total_matches+greatest(0,(p_state->>'matches')::integer-(previous->>'matches')::integer),
    total_cascades=total_cascades+greatest(0,(p_state->>'cascades')::integer-(previous->>'cascades')::integer),
    updated_at=statement_timestamp()
    where user_id=p_user;
  should_bank := p_bank or p_end
    or ((p_state->>'coins')::integer - run.banked) >= 25
    or run.last_bank_at < statement_timestamp() - interval '30 seconds';
  if should_bank then
    bank := private.polygon_bank_run(run);
    select * into run from public.polygon_solo_runs where id=run.id;
  end if;
  fresh := private.polygon_grant_achievements(p_user, p_achievements);
  if p_end then perform private.polygon_end_run(run); end if;
  select w.balance into balance from public.polygon_wallets w where w.user_id=p_user;
  return jsonb_build_object('result',case when p_end then 'ended' else 'ok' end,
    'version',run.version,'balance',coalesce(balance,0),'banked',run.banked,
    'capped',coalesce((bank->>'capped')::boolean,false),'achievements',to_jsonb(fresh));
end
$$;

-- Atomic: the charge, the ledger line and the ownership happen together or not
-- at all. Retrying with the same key returns the first answer and charges
-- nothing; the price is read here, never taken from a browser.
create or replace function public.polygon_purchase(p_user uuid, p_item text, p_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  w public.polygon_wallets;
  item public.polygon_shop_items;
  fresh text[];
begin
  if p_key is null or char_length(p_key) not between 8 and 120 then return jsonb_build_object('result','invalid-request'); end if;
  insert into public.polygon_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.polygon_wallets where user_id=p_user for update;
  select * into item from public.polygon_shop_items where item_key=p_item and active;
  if item.item_key is null then return jsonb_build_object('result','item-not-found','balance',w.balance); end if;
  if item.price=0 then return jsonb_build_object('result','free-item','balance',w.balance); end if;
  if exists (select 1 from public.polygon_ledger l where l.user_id=p_user and l.idempotency_key='buy:'||p_key) then
    return jsonb_build_object('result','ok','idempotent',true,'balance',w.balance,'item',item.item_key);
  end if;
  if exists (select 1 from public.polygon_inventory i where i.user_id=p_user and i.item_key=item.item_key) then
    return jsonb_build_object('result','owned','balance',w.balance,'item',item.item_key);
  end if;
  if w.balance < item.price then
    return jsonb_build_object('result','insufficient','balance',w.balance,'price',item.price,'item',item.item_key);
  end if;
  update public.polygon_wallets set balance=balance-item.price, updated_at=statement_timestamp() where user_id=p_user returning * into w;
  insert into public.polygon_ledger(user_id,event,amount,balance_after,idempotency_key,item_key)
    values(p_user,'PURCHASE_ITEM',-item.price,w.balance,'buy:'||p_key,item.item_key);
  insert into public.polygon_inventory(user_id,item_key) values(p_user,item.item_key);
  fresh := private.polygon_grant_achievements(p_user, array['first-purchase']);
  return jsonb_build_object('result','ok','balance',w.balance,'item',item.item_key,'price',item.price,'achievements',to_jsonb(fresh));
end
$$;

-- Wearing something requires owning it (or it being free); checked against the
-- inventory here whatever the application sent.
create or replace function public.polygon_avatar_save(p_user uuid, p_avatar jsonb, p_display_name text, p_emoji text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  key text;
  value text;
  item public.polygon_shop_items;
begin
  if jsonb_typeof(p_avatar)<>'object' or octet_length(p_avatar::text)>2048 then return jsonb_build_object('result','invalid-request'); end if;
  if p_display_name is not null and (p_display_name<>btrim(p_display_name) or char_length(p_display_name) not between 2 and 20) then
    return jsonb_build_object('result','invalid-name');
  end if;
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;
  for key, value in select k, v from jsonb_each_text(p_avatar) as t(k,v) loop
    if key in ('base','skin') or value is null then continue; end if;
    select * into item from public.polygon_shop_items where item_key=value and slot=key;
    if item.item_key is null then return jsonb_build_object('result','avatar-invalid'); end if;
    if item.price>0 and not exists (select 1 from public.polygon_inventory i where i.user_id=p_user and i.item_key=value) then
      return jsonb_build_object('result','item-not-owned','item',value);
    end if;
  end loop;
  insert into public.polygon_profiles(user_id,avatar,display_name,emoji) values(p_user,p_avatar,p_display_name,p_emoji)
    on conflict (user_id) do update set
      avatar=excluded.avatar,
      display_name=coalesce(excluded.display_name,public.polygon_profiles.display_name),
      emoji=coalesce(excluded.emoji,public.polygon_profiles.emoji),
      updated_at=statement_timestamp();
  return jsonb_build_object('result','ok');
end
$$;

-- ------------------------------------------------------------------ the rooms

create or replace function private.polygon_cleanup()
returns void language sql set search_path=''
as $$
  delete from public.polygon_rooms
    where expires_at < statement_timestamp() - interval '5 minutes'
       or (status='closed' and updated_at < statement_timestamp() - interval '5 minutes');
$$;
revoke all on function private.polygon_cleanup() from public,anon,authenticated;

-- Derived from the clock on every read, so the buzzer needs no background job.
create or replace function private.polygon_phase(r public.polygon_rooms)
returns text language sql stable set search_path=''
as $$
  select case
    when r.phase='LOBBY' then 'LOBBY'
    when r.phase='ENDED' then 'COMPLETE'
    when statement_timestamp() < r.starts_at then 'COUNTDOWN'
    when statement_timestamp() < r.ends_at then 'ACTIVE'
    else 'COMPLETE'
  end
$$;
revoke all on function private.polygon_phase(public.polygon_rooms) from public,anon,authenticated;

-- Ties share a place. Tiebreakers are things a player did, never who came first.
create or replace function private.polygon_standings(p_room uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'emoji',s.emoji,'coins',s.coins,'score',s.score,'combo',s.best_combo,'clear',s.largest_clear,'moves',s.moves,'creator',s.is_creator,'rank',s.place) order by s.place, s.display_name, s.id),'[]'::jsonb)
  from (
    select p.*, rank() over (order by p.coins desc, p.score desc, p.best_combo desc, p.largest_clear desc) as place
    from public.polygon_participants p where p.room_id=p_room and p.status='active'
  ) s
$$;
revoke all on function private.polygon_standings(uuid) from public,anon,authenticated;

create or replace function private.polygon_room_core(r public.polygon_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'result',p_result,'id',r.id,'code',r.code,'phase',private.polygon_phase(r),'durationSeconds',r.duration_seconds,
    'locked',r.join_locked,'version',r.version,'seed',r.seed,'startState',r.start_state,
    'nowMs',private.polygon_ms(statement_timestamp()),'startsAtMs',private.polygon_ms(r.starts_at),'endsAtMs',private.polygon_ms(r.ends_at),
    'finalized',r.finalized_at is not null,'standings',r.standings
  )
$$;
revoke all on function private.polygon_room_core(public.polygon_rooms,text) from public,anon,authenticated;

create or replace function private.polygon_participant_view(p public.polygon_participants)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object('id',p.id,'name',p.display_name,'emoji',p.emoji,'isCreator',p.is_creator,'state',p.state,'version',p.version,'nextT',p.next_t,'reward',p.reward,'signedIn',p.user_id is not null)
$$;
revoke all on function private.polygon_participant_view(public.polygon_participants) from public,anon,authenticated;

-- Shares out the permanent rewards, once, after the buzzer and the grace for
-- moves still in flight. Guests have no user_id and are skipped by construction.
create or replace function private.polygon_finalize(p_room uuid)
returns void language plpgsql set search_path=''
as $$
declare
  r public.polygon_rooms;
  p record;
  amount integer;
  top_rank bigint;
  payout jsonb;
begin
  select * into r from public.polygon_rooms where id=p_room and finalized_at is null for update skip locked;
  if r.id is null or r.phase='LOBBY' or statement_timestamp() < r.ends_at + interval '2500 milliseconds' then return; end if;
  update public.polygon_rooms set standings=private.polygon_standings(r.id), standings_at=statement_timestamp(), finalized_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  for p in
    select q.*, rank() over (order by q.coins desc, q.score desc, q.best_combo desc, q.largest_clear desc) as place
    from public.polygon_participants q where q.room_id=r.id and q.status='active'
  loop
    if p.user_id is null then continue; end if;
    amount := least(floor((r.duration_seconds/60.0)*40)::integer, floor(p.coins*0.5)::integer);
    payout := private.polygon_credit(p.user_id,'EARN_SHOWDOWN',amount,'showdown:'||r.id::text||':'||p.id::text,jsonb_build_object('room',r.id,'coins',p.coins,'place',p.place));
    update public.polygon_participants set reward=coalesce((payout->>'credited')::integer,0) where id=p.id;
    insert into public.polygon_profiles(user_id) values(p.user_id) on conflict (user_id) do nothing;
    update public.polygon_profiles set
      showdowns_played=showdowns_played+1,
      showdowns_won=showdowns_won+case when p.place=1 and p.coins>0 then 1 else 0 end,
      best_combo=greatest(best_combo,p.best_combo),
      largest_clear=greatest(largest_clear,p.largest_clear),
      updated_at=statement_timestamp()
      where user_id=p.user_id;
    perform private.polygon_grant_achievements(p.user_id, case when p.place=1 and p.coins>0 then array['first-showdown','showdown-win'] else array['first-showdown'] end);
  end loop;
end
$$;
revoke all on function private.polygon_finalize(uuid) from public,anon,authenticated;

-- A reader refreshes the shared standings at most about once a second; everyone
-- else skips the row and reads what is there, so no poll waits behind another.
create or replace function private.polygon_refresh(p_room public.polygon_rooms)
returns public.polygon_rooms language plpgsql set search_path=''
as $$
declare
  r public.polygon_rooms := p_room;
begin
  if r.finalized_at is not null then return r; end if;
  if private.polygon_phase(r)='COMPLETE' and statement_timestamp() >= r.ends_at + interval '2500 milliseconds' then
    perform private.polygon_finalize(r.id);
    select * into r from public.polygon_rooms where id=r.id;
    return r;
  end if;
  if r.standings_at is null or r.standings_at < statement_timestamp() - interval '900 milliseconds' then
    perform 1 from public.polygon_rooms where id=r.id for update skip locked;
    if found then
      update public.polygon_rooms set standings=private.polygon_standings(r.id), standings_at=statement_timestamp() where id=r.id returning * into r;
    end if;
  end if;
  return r;
end
$$;
revoke all on function private.polygon_refresh(public.polygon_rooms) from public,anon,authenticated;

create or replace function public.polygon_create_room(
  p_code text, p_owner_hash text, p_host_token_hash text, p_player_token_hash text, p_user uuid,
  p_name text, p_emoji text, p_duration integer, p_seed text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.polygon_rooms;
  me public.polygon_participants;
  recent bigint;
begin
  perform private.polygon_cleanup();
  if p_duration not in (300,420,600,900,1200,1800) or not private.polygon_state_valid(p_state) then
    return jsonb_build_object('result','invalid-request');
  end if;
  if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 2 and 20 then return jsonb_build_object('result','invalid-name'); end if;
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;
  select count(*) into recent from public.polygon_rooms where owner_hash=p_owner_hash and created_at > statement_timestamp() - interval '10 minutes';
  if recent >= 12 then return jsonb_build_object('result','rate-limited'); end if;
  perform pg_advisory_xact_lock(hashtext('live-room-code:'||p_code));
  if exists (select 1 from public.polygon_rooms x where x.code=p_code and x.status='open')
     or exists (select 1 from public.bingo_rooms x where x.code=p_code and x.status='open') then
    return jsonb_build_object('result','code-taken');
  end if;
  -- One live room per creator: an older one closes and its players are removed.
  perform 1 from public.polygon_rooms where owner_hash=p_owner_hash and status='open' order by id for update;
  delete from public.polygon_participants where room_id in (select id from public.polygon_rooms where owner_hash=p_owner_hash and status='open');
  update public.polygon_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where owner_hash=p_owner_hash and status='open';
  begin
    insert into public.polygon_rooms(code,owner_hash,host_token_hash,duration_seconds,seed,start_state,expires_at)
      values(p_code,p_owner_hash,p_host_token_hash,p_duration,p_seed,p_state,statement_timestamp()+interval '3 hours')
      returning * into r;
  exception when unique_violation then
    return jsonb_build_object('result','code-taken');
  end;
  insert into public.polygon_participants(room_id,token_hash,display_name,name_key,emoji,is_creator,user_id,state)
    values(r.id,p_player_token_hash,p_name,lower(p_name),p_emoji,true,p_user,p_state) returning * into me;
  update public.polygon_rooms set standings=private.polygon_standings(r.id), standings_at=statement_timestamp() where id=r.id returning * into r;
  return private.polygon_room_core(r,'created') || jsonb_build_object('me',private.polygon_participant_view(me));
end
$$;

-- The creator, back after a refresh or on another device: needs the signed-in
-- owner hash, so a room code alone can never take over a room. Mints fresh
-- host and seat tokens; the old ones stop working.
create or replace function public.polygon_host_resume(p_owner_hash text, p_new_host_hash text, p_new_player_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.polygon_rooms;
  me public.polygon_participants;
begin
  select * into r from public.polygon_rooms
    where owner_hash=p_owner_hash and status='open' and expires_at > statement_timestamp()
    order by created_at desc limit 1 for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  update public.polygon_rooms set host_token_hash=p_new_host_hash, updated_at=statement_timestamp() where id=r.id returning * into r;
  update public.polygon_participants set token_hash=p_new_player_hash where room_id=r.id and is_creator returning * into me;
  r := private.polygon_refresh(r);
  return private.polygon_room_core(r,'resumed') || jsonb_build_object('me',private.polygon_participant_view(me));
end
$$;

create or replace function public.polygon_host_command(p_owner_hash text, p_token_hash text, p_command text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.polygon_rooms;
  target uuid;
  phase text;
begin
  select * into r from public.polygon_rooms where host_token_hash=p_token_hash and owner_hash=p_owner_hash and status='open' for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  phase := private.polygon_phase(r);

  if p_command='start' then
    if phase<>'LOBBY' then return private.polygon_room_core(r,'already-started'); end if;
    update public.polygon_rooms set phase='RUNNING',
      starts_at=statement_timestamp()+interval '5 seconds',
      ends_at=statement_timestamp()+interval '5 seconds'+make_interval(secs => r.duration_seconds),
      expires_at=statement_timestamp()+interval '5 seconds'+make_interval(secs => r.duration_seconds)+interval '30 minutes',
      version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
  elsif p_command in ('lock','unlock') then
    update public.polygon_rooms set join_locked=(p_command='lock'), version=version+1, updated_at=statement_timestamp() where id=r.id returning * into r;
  elsif p_command='remove' then
    begin
      target := (p_args->>'participant')::uuid;
    exception when others then
      return jsonb_build_object('result','invalid-request');
    end;
    update public.polygon_participants set status='removed', display_name='Removed player', name_key='removed:'||id::text, emoji=null, user_id=null
      where id=target and room_id=r.id and status='active' and not is_creator;
    if not found then return private.polygon_room_core(r,'not-removable'); end if;
    update public.polygon_rooms set standings=private.polygon_standings(r.id), standings_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp() where id=r.id returning * into r;
  elsif p_command='end' then
    if phase='COMPLETE' then return private.polygon_room_core(r,'already-ended'); end if;
    if phase='LOBBY' then
      delete from public.polygon_participants where room_id=r.id;
      update public.polygon_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where id=r.id;
      return jsonb_build_object('result','closed');
    end if;
    update public.polygon_rooms set phase='ENDED', ends_at=least(ends_at,statement_timestamp()), starts_at=least(starts_at,statement_timestamp()),
      expires_at=statement_timestamp()+interval '30 minutes', version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
  elsif p_command='players' then
    return private.polygon_room_core(r,'ok') || jsonb_build_object('players',(
      select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'emoji',p.emoji,'creator',p.is_creator,'coins',p.coins,
        'connected',p.seen_at > statement_timestamp() - interval '15 seconds') order by p.joined_at,p.id),'[]'::jsonb)
      from public.polygon_participants p where p.room_id=r.id and p.status='active'));
  elsif p_command='close' then
    delete from public.polygon_participants where room_id=r.id;
    update public.polygon_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where id=r.id;
    return jsonb_build_object('result','closed');
  else
    return jsonb_build_object('result','invalid-request');
  end if;
  return private.polygon_room_core(r,'ok');
end
$$;

create or replace function public.polygon_join_room(p_code text, p_name text, p_emoji text, p_token_hash text, p_subject_hash text, p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.polygon_rooms;
  me public.polygon_participants;
  failure_row public.bingo_join_failures;
  outcome text;
  candidate text := p_name;
  suffix integer := 1;
begin
  perform private.polygon_cleanup();
  -- One limiter for code guessing across every live game.
  select * into failure_row from public.bingo_join_failures where subject_hash=p_subject_hash for update;
  if failure_row.subject_hash is not null and failure_row.window_started_at > statement_timestamp() - interval '10 minutes'
     and failure_row.failures >= 40 then
    return jsonb_build_object('result','rate-limited');
  end if;
  if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 2 and 20 then return jsonb_build_object('result','invalid-name'); end if;
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;

  select * into r from public.polygon_rooms where code=p_code and status='open' for update;
  if r.id is null then
    outcome := 'not-found';
  elsif r.expires_at <= statement_timestamp() then
    outcome := 'expired';
  elsif private.polygon_phase(r)='COMPLETE' then
    return jsonb_build_object('result','finished');
  elsif r.join_locked then
    return jsonb_build_object('result','locked');
  elsif (select count(*) from public.polygon_participants p where p.room_id=r.id and p.status='active') >= 60 then
    return jsonb_build_object('result','full');
  else
    while exists (select 1 from public.polygon_participants p where p.room_id=r.id and p.status='active' and p.name_key=lower(candidate)) loop
      suffix := suffix + 1;
      candidate := btrim(left(p_name, 20 - char_length(' ' || suffix::text))) || ' ' || suffix::text;
    end loop;
    -- A late arrival gets the room's opening board, no coins, and the time left.
    insert into public.polygon_participants(room_id,token_hash,display_name,name_key,emoji,user_id,state)
      values(r.id,p_token_hash,candidate,lower(candidate),p_emoji,p_user,r.start_state) returning * into me;
    update public.polygon_rooms set standings=private.polygon_standings(r.id), standings_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    return private.polygon_room_core(r,'joined') || jsonb_build_object('me',private.polygon_participant_view(me));
  end if;

  insert into public.bingo_join_failures(subject_hash,window_started_at,failures) values(p_subject_hash,statement_timestamp(),1)
    on conflict(subject_hash) do update set
      failures=case when public.bingo_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.bingo_join_failures.failures+1 else 1 end,
      window_started_at=case when public.bingo_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.bingo_join_failures.window_started_at else statement_timestamp() end;
  return jsonb_build_object('result',outcome);
end
$$;

-- Everything one poll needs. Takes no lock on the room except the brief
-- skip-locked standings refresh.
create or replace function public.polygon_player_load(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me public.polygon_participants;
  r public.polygon_rooms;
begin
  select * into me from public.polygon_participants where token_hash=p_token_hash;
  if me.id is null then return jsonb_build_object('result','not-found'); end if;
  select * into r from public.polygon_rooms where id=me.room_id;
  if me.status='removed' then return jsonb_build_object('result','removed'); end if;
  if r.status='closed' or r.expires_at <= statement_timestamp() then return jsonb_build_object('result','closed'); end if;
  if me.seen_at < statement_timestamp() - interval '5 seconds' then
    update public.polygon_participants set seen_at=statement_timestamp() where id=me.id;
  end if;
  r := private.polygon_refresh(r);
  if r.finalized_at is not null and me.user_id is not null and me.reward is null then
    select * into me from public.polygon_participants where id=me.id;
  end if;
  return private.polygon_room_core(r,'ok') || jsonb_build_object('me',private.polygon_participant_view(me));
end
$$;

-- One player's row, compare-and-swapped. The room row is only read.
create or replace function public.polygon_player_commit(p_token_hash text, p_version integer, p_state jsonb, p_next_t integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  new_version integer;
begin
  if not private.polygon_state_valid(p_state) or p_next_t < 0 then return jsonb_build_object('result','invalid-request'); end if;
  update public.polygon_participants p set
    state=p_state,
    coins=(p_state->>'coins')::integer,
    score=(p_state->>'score')::bigint,
    best_combo=(p_state->>'bestCombo')::integer,
    largest_clear=(p_state->>'largestClear')::integer,
    moves=(p_state->>'moves')::integer,
    next_t=p_next_t,
    version=p.version+1,
    seen_at=statement_timestamp()
  from public.polygon_rooms r
  where p.token_hash=p_token_hash and p.version=p_version and p.status='active'
    and r.id=p.room_id and r.status='open' and r.finalized_at is null and r.phase in ('RUNNING','ENDED')
    and statement_timestamp() >= r.starts_at
    and statement_timestamp() <= r.ends_at + interval '2500 milliseconds'
    and (p_state->>'moves')::integer >= p.moves and (p_state->>'coins')::integer >= p.coins
  returning p.version into new_version;
  if new_version is null then return jsonb_build_object('result','conflict'); end if;
  return jsonb_build_object('result','ok','version',new_version);
end
$$;

create or replace function public.polygon_leave(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me public.polygon_participants;
begin
  select * into me from public.polygon_participants where token_hash=p_token_hash;
  if me.id is null then return jsonb_build_object('result','not-found'); end if;
  if me.is_creator then return jsonb_build_object('result','creator-stays'); end if;
  update public.polygon_participants set status='removed', display_name='Removed player', name_key='removed:'||id::text, emoji=null, user_id=null where id=me.id;
  return jsonb_build_object('result','left');
end
$$;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.polygon_bootstrap(uuid)',
    'public.polygon_solo_start(uuid,text,jsonb,boolean)',
    'public.polygon_solo_open(uuid)',
    'public.polygon_solo_load(uuid,uuid,integer)',
    'public.polygon_solo_commit(uuid,uuid,integer,integer,jsonb,integer,boolean,text[],boolean)',
    'public.polygon_purchase(uuid,text,text)',
    'public.polygon_avatar_save(uuid,jsonb,text,text)',
    'public.polygon_create_room(text,text,text,text,uuid,text,text,integer,text,jsonb)',
    'public.polygon_host_resume(text,text,text)',
    'public.polygon_host_command(text,text,text,jsonb)',
    'public.polygon_join_room(text,text,text,text,text,uuid)',
    'public.polygon_player_load(text)',
    'public.polygon_player_commit(text,integer,jsonb,integer)',
    'public.polygon_leave(text)'
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$grants$;
