# Grok Clone

A Grok-style AI chat application built with Next.js, Supabase, and Vercel AI SDK.

## Features

- 🎨 Grok-inspired dark theme UI
- 💬 Streaming AI responses via OpenAI-compatible API
- 📝 Chat session history with CRUD operations
- 💾 Persistent storage with Supabase PostgreSQL
- 🔐 Supabase Auth (email/password)
- 🚀 Deploy to Vercel

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend**: Vercel AI SDK, OpenAI-compatible API
- **Database**: Supabase (PostgreSQL + Auth)
- **Deployment**: Vercel

## Setup

### 1. Supabase

Create a new project at [supabase.com](https://supabase.com), then run the schema:

```sql
-- Copy and execute the contents of supabase/schema.sql in the Supabase SQL Editor
```

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | Your OpenAI-compatible API key |
| `OPENAI_API_BASE_URL` | API base URL (default: `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Default model (default: `gpt-4o`) |

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com/new)
3. Add environment variables in Vercel project settings
4. Deploy

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & Register pages
│   ├── chat/[id]/       # Chat session page
│   ├── api/
│   │   ├── chat/        # Streaming chat endpoint
│   │   └── sessions/    # Session CRUD endpoints
│   ├── auth/callback/   # Supabase auth callback
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home (new chat)
├── components/
│   ├── sidebar.tsx      # Chat history sidebar
│   ├── chat-input.tsx   # Message input with model picker
│   └── chat-messages.tsx # Message list with markdown
└── lib/
    ├── supabase/        # Supabase client configs
    ├── db/queries.ts    # Database operations
    └── types.ts         # TypeScript types
```
