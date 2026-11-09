-- Polygon Showdown: make the table privileges what the first migration intended.
--
-- Hosted Supabase projects give service_role every privilege on a new table by
-- default, so the first migration's `grant select, insert` on the coin ledger
-- narrowed nothing there: the application role could still have rewritten or
-- emptied it. Local stacks have narrower defaults, which is why the local test
-- suite did not see this. These statements set the grants outright, whatever
-- defaults the project has.

revoke all on table public.polygon_shop_items from service_role;
grant select, insert, update, delete on table public.polygon_shop_items to service_role;

revoke all on table public.polygon_wallets from service_role;
grant select, insert, update, delete on table public.polygon_wallets to service_role;

revoke all on table public.polygon_inventory from service_role;
grant select, insert, update, delete on table public.polygon_inventory to service_role;

revoke all on table public.polygon_profiles from service_role;
grant select, insert, update, delete on table public.polygon_profiles to service_role;

revoke all on table public.polygon_solo_runs from service_role;
grant select, insert, update, delete on table public.polygon_solo_runs to service_role;

revoke all on table public.polygon_rooms from service_role;
grant select, insert, update, delete on table public.polygon_rooms to service_role;

revoke all on table public.polygon_participants from service_role;
grant select, insert, update, delete on table public.polygon_participants to service_role;

-- Every change to a balance stays forever: read and append only.
revoke all on table public.polygon_ledger from service_role;
grant select, insert on table public.polygon_ledger to service_role;

revoke all on sequence public.polygon_ledger_id_seq from public, anon, authenticated;
