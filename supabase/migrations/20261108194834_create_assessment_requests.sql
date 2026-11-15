-- Solicitudes de evaluación técnica (formulario público de la landing).
-- Solo escribe el route handler con la clave secreta; RLS activa y sin políticas.
create table public.assessment_requests (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique default (
                         'NX-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
                         upper(substr(md5(gen_random_uuid()::text), 1, 5))
                       ),
  industry             text not null,
  services             text[] not null check (
                         cardinality(services) between 1 and 4
                         and services <@ array['dji_app', 'project_platform', 'website', 'undecided']
                       ),
  project_summary      text not null check (char_length(project_summary) between 20 and 2000),
  fleet_size           text not null check (fleet_size in ('none', '1-3', '4-10', '11-30', '30+')),
  aircraft_models      text check (char_length(aircraft_models) <= 300),
  hosting              text not null check (hosting in ('cloud', 'on_premise', 'undecided')),
  objectives           text[] not null check (cardinality(objectives) between 1 and 10),
  timeline             text not null check (timeline in ('lt_3m', '3_6m', '6_12m', 'exploratory')),
  full_name            text not null check (char_length(full_name) between 3 and 120),
  role_title           text not null check (char_length(role_title) between 2 and 120),
  company              text not null check (char_length(company) between 2 and 160),
  email                text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  country              text not null check (char_length(country) between 2 and 80),
  consent_at           timestamptz not null,
  trace_id             text,
  source_ip_hash       text check (source_ip_hash ~ '^[0-9a-f]{64}$'),
  triage_status        text not null default 'new' check (triage_status in ('new', 'qualified', 'contacted', 'closed')),
  created_at           timestamptz not null default now()
);
create index assessment_requests_created_idx on public.assessment_requests (created_at desc);
create index assessment_requests_ip_idx on public.assessment_requests (source_ip_hash, created_at desc);

alter table public.assessment_requests enable row level security;
