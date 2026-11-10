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
