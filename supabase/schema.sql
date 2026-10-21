create extension if not exists pgcrypto;

create table if not exists public.tracking_invites (
  id uuid primary key default gen_random_uuid(),

  share_token text unique not null,
  admin_token text unique not null,

  name text not null,
  phone text not null,
  email text not null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'agreed',
        'disagreed',
        'revoked'
      )
    ),

  expires_at timestamptz
    not null
    default (now() + interval '7 days'),

  created_at timestamptz
    not null
    default now(),

  consented_at timestamptz
);

create table if not exists public.location_updates (
  id bigint generated always as identity primary key,

  invite_id uuid not null
    references public.tracking_invites(id)
    on delete cascade,

  latitude double precision not null,
  longitude double precision not null,

  accuracy_m double precision,
  speed_mps double precision,
  heading double precision,

  captured_at timestamptz
    not null
    default now()
);

create index if not exists location_updates_invite_time_idx
on public.location_updates(
  invite_id,
  captured_at desc
);

alter table public.tracking_invites
enable row level security;

alter table public.location_updates
enable row level security;
