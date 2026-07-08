# Writing Desk — Design

## Purpose

A private, login-gated web workspace to help write more consistently. Supports two kinds
of projects — **creative** (books/fiction) and **research** (investigative/research
writing) — each with a planning side and a writing side, plus session-based word count
goals to build a writing habit.

Single user (just Jake). Accessible from any device (work Mac + personal computer), so
it must be deployed, not run locally.

## Architecture

- **Next.js (App Router)** — single codebase for frontend + backend API routes.
- **Postgres via Neon** — hosted Postgres, integrates directly with Vercel.
- **Deployed to Vercel** — one deploy target, free/cheap at single-user scale.
- **Auth**: single hardcoded user, password hashed with bcrypt, stored in the DB.
  Login sets a signed httpOnly session cookie; middleware protects every route except
  `/login`.
- **Editor**: TipTap (rich text), content stored as TipTap JSON.

This was chosen over (a) a separate frontend/backend deployment and (b) a
Supabase-backed stack, both of which add operational complexity with no benefit at
single-user scale.

## Data Model

- **Project** — id, type (`creative` | `research`), title, created_at
- **Section** — belongs to a Project; ordered; title; outline notes; content (rich
  text, TipTap JSON); status (not started / drafting / done)
- **CreativeDetails** — belongs to a creative Project: overview, logline, characters
  (freeform list)
- **ResearchDetails** — belongs to a research Project: topic & angle, thesis
- **Source** — belongs to a research Project: name, notes/link (simple running list,
  no status workflow)
- **WritingSession** — project_id, section_id (nullable), date, session_size
  (small/medium/big), target_words, words_written, started_at, ended_at
- **Settings** — the three global word count targets (small/medium/big), editable once
  and reused across all projects

## Core Flows

**Dashboard**: lists all projects, grouped Creative / Research. Shows a streak/calendar
view of days on which at least one session was completed. "New Project" button to
create either type.

**Planning tab** (per project):
- Creative: overview, logline, characters, section list (add/reorder/edit).
- Research: topic & angle, thesis, sources (running list of name + notes/link),
  section list (same mechanic as creative).
- Editable at any time, including mid-session.

**Writing tab** (per project): rich text editor for the current section's content,
autosaving as you type (debounced). A slide-out overlay panel lists all sections from
the planning side so you can jump between them without leaving the writing view — the
document is organized by section, but navigating sections doesn't leave the writing
screen.

**Sessions**: before writing, pick small/medium/big, which sets a target word count for
this sitting (targets come from global Settings). While writing, a progress bar tracks
words typed *this session* against the target — a soft nudge, not a hard lock; you can
end the session at any point. Ending the session logs a `WritingSession` row (date,
words written, target, project/section), which feeds the dashboard's streak calendar.

## Out of Scope (for this version)

- Multi-user support / signup flow.
- Per-project (vs global) session word-count targets.
- Status workflow/tags on research sources.
- Export/publishing features.
