# Database

## Standing up a NEW instance

On a brand-new, empty Supabase project, run these in the SQL editor **in order**:

1. `00_schema.sql` — types, tables, keys, indexes, helper and trigger functions
2. `01_functions.sql` — pricing, booking, tracking, cash, reporting; triggers; row-level security
3. `2026-09-15_external_bookings.sql` — adds `create_external_booking()`

That's it. `00` and `01` are a full snapshot of the database as it stood on
2026-09-23, so the other dated files below are already folded into them — you do
not need to run them on a fresh project (they are idempotent, so running them
does no harm either).

Then, before the app will work:

- Create the first admin: sign the user up through Supabase Auth, then
  `insert into profiles (id, full_name, email, role) values ('<auth user id>', 'Admin', 'you@example.com', 'admin');`
- Add at least one row to `websites` (the widget sends its `api_key`)
- Add `vehicle_categories` and their `pricing_bands`, or nothing can be priced
- Seed `app_settings` — at minimum the `company` (timezone) and
  `child_seat_price` keys, which the pricing functions read

## Why 00_schema.sql exists

The repo only ever carried incremental changes, so the actual shape of the
database lived nowhere but inside one Supabase project. Spinning up a second
instance was impossible from the repo alone. These two files fix that.

Regenerate them if the schema drifts a long way from what is here.

## Dated migrations

Applied to the original project in this order. Kept for history; already
included in `00`/`01` except where noted.

| File | What it did |
|---|---|
| `2026-09-05_pricing_base_plus_bands.sql` | Base fare + tapered distance bands; dropped per-minute and minimum fare |
| `2026-09-12_stripe_hardening.sql` | `payments` review columns, unique index on `stripe_payment_intent_id`, `stripe_events` |
| `2026-09-12_external_driver.sql` | Hand one ride to an outside driver, with their car |
| `2026-09-12_stripe_checkout.sql` | `checkout_drafts` — trips parked while the customer pays on Stripe |
| `2026-09-15_external_bookings.sql` | Off-platform bookings — **also defines `create_external_booking()`, so run this one** |
