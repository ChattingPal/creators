# NovaX Creators

Minimal Next.js Pages Router project connected to Supabase.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The home page reads `id` and `name` from the Supabase `todos` table. Ensure that the table exists and that Row Level Security policies allow the intended users to select its rows.

The committed client configuration contains a Supabase publishable key, which is designed for browser use. Never add a Supabase secret key or service-role key to a `NEXT_PUBLIC_` variable or commit one to this repository.

`proxy.ts` and `utils/supabase-proxy.ts` refresh cookie-based Supabase Auth sessions using the Next.js 16 proxy convention.

## Creator profile onboarding

The static dashboard implementation uses the `creator_profiles` table, the
`create_creator_profile` and `get_public_creator_profile` database functions,
and the `creator-avatars` Storage bucket defined in:

`supabase/migrations/20261110213000_create_creator_profiles.sql`

Apply and review that additive migration in the Supabase project before enabling
the production onboarding flow. The migration creates the table, case-insensitive
handle uniqueness, server-generated ownership and timestamps, Row Level Security,
idempotent profile creation, safe public profile reads and owner-scoped Storage
policies. It does not create a payment integration or paid subscriptions.
