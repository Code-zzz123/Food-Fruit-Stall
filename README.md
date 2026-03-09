# Supabase Record Viewer

A simple web app to view records from a Supabase table.

## What it does
- Loads rows from your Supabase table
- Shows a clickable list of records
- Shows full field-by-field details for a selected record
- Lets you add new records from the webpage
- Includes separate `Food` and `Buyer` pages via clickable header tabs
- Supports email/password login and signup with Supabase Auth

## Requirements
- Node.js 18+
- A Supabase project with a table you want to view

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Set these in `.env`:

- `PORT` (optional): defaults to `3000`
- `SUPABASE_URL`: your Supabase project URL (e.g. `https://abcxyz.supabase.co`)
- `SUPABASE_ANON_KEY`: your Supabase anon/public key
- `SUPABASE_TABLE`: table name to read from
- `SUPABASE_ID_COLUMN` (optional): primary key column (default `id`)
- `SUPABASE_ORDER_COLUMN` (optional): sort column (default = `SUPABASE_ID_COLUMN`)
- `SUPABASE_BUYERS_TABLE` (optional): related buyers table (e.g. `Buyer`)
- `SUPABASE_FOOD_FRUIT_COLUMN` (optional): fruit-link column in food table (default `Fruit Name`)
- `SUPABASE_BUYERS_FRUIT_COLUMN` (optional): fruit-link column in buyers table (default `Fruit Name`)
- `SUPABASE_BUYERS_ORDER_COLUMN` (optional): sort column for buyers list

## API endpoints

- `GET /api/health`
- `GET /api/entries?limit=100`
- `GET /api/entries/:id`
- `GET /api/entries/:id/buyers`
- `GET /api/buyers?fruitName=Apple`
- `POST /api/entries`
- `POST /api/buyers`

## Notes

- Your tables should be readable with Supabase RLS policies for the `authenticated` role.
- To create records from the webpage, add INSERT policies for the `authenticated` role.
- To show buyers in the details pane, set `SUPABASE_BUYERS_TABLE` and ensure SELECT policy allows reading that table.
- If your ID column is not `id`, set `SUPABASE_ID_COLUMN`.
- Auth is now required for API calls. Log in from the header using Supabase Auth credentials.
