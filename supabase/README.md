# Word Monument - Supabase schema

This directory contains the full Postgres schema for the 1,000,000-cell monument:
base tables, RLS lockdown, the public `cells_public` view, and the six
`service_role`-only RPCs that do all mutation (`reserve_cells_atomic`,
`complete_purchase_atomic`, `release_reservation`, `sweep_expired_reservations`,
`remove_cell_atomic`, `report_cell`).

## Applying migrations

1. Install the Supabase CLI if you haven't already (`brew install supabase/tap/supabase`).
2. Link this project directory to your Supabase project:

   ```bash
   supabase link --project-ref <ref>
   ```

   `<ref>` is the project ref from the Supabase dashboard URL
   (`https://supabase.com/dashboard/project/<ref>`).

3. Push the migrations:

   ```bash
   supabase db push
   ```

   This runs `migrations/0001_init_schema.sql` then `migrations/0002_rpcs.sql`
   in order. `0001` seeds all 1,000,000 `cells` rows plus the 400
   `tile_summary` rows, so the first push will take a bit longer than a
   typical migration - that's expected.

## Notes

- Every RPC is `security definer` with a locked `search_path` and is revoked
  from `PUBLIC`/`anon`/`authenticated`, granted to `service_role` only. Call
  them from server code via `supabase.rpc(...)` using the service-role key -
  never from the browser.
- `anon`/`authenticated` only ever see data through `cells_public`,
  `tile_summary`, and `monument_stats` - all other tables
  are RLS-enabled with no policies (deny-all).
- Re-running `supabase db push` after the initial push is a no-op unless you
  add new migration files; it does not re-run `0001`/`0002`.
