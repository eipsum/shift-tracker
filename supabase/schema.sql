-- Shift sharing schema. Run this in the Supabase SQL editor once.
-- Model: a space the owner creates and invites a partner (Kang) to join.
-- Activity is the shared feed; reactions and comments hang off activity.

create extension if not exists pgcrypto;

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  invite_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists space_members (
  space_id uuid references spaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'partner',
  created_at timestamptz default now(),
  primary key (space_id, user_id)
);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  author uuid not null references auth.users on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activity on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  unique (activity_id, user_id, emoji)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activity on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Security definer helpers avoid recursive RLS on space_members.
create or replace function is_space_member(sid uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid());
$$;

create or replace function can_touch_activity(aid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from activity a
    join space_members m on m.space_id = a.space_id
    where a.id = aid and m.user_id = auth.uid());
$$;

-- Create a space and add the caller as owner, atomically.
create or replace function create_space(code text)
returns uuid language plpgsql security definer as $$
declare sid uuid;
begin
  insert into spaces(owner, invite_code) values (auth.uid(), code) returning id into sid;
  insert into space_members(space_id, user_id, role) values (sid, auth.uid(), 'owner');
  return sid;
end; $$;

-- Join a space by invite code.
create or replace function join_space(code text)
returns uuid language plpgsql security definer as $$
declare sid uuid;
begin
  select id into sid from spaces where invite_code = code;
  if sid is null then raise exception 'invalid code'; end if;
  insert into space_members(space_id, user_id, role)
    values (sid, auth.uid(), 'partner') on conflict do nothing;
  return sid;
end; $$;

alter table spaces enable row level security;
alter table space_members enable row level security;
alter table activity enable row level security;
alter table reactions enable row level security;
alter table comments enable row level security;

create policy spaces_read on spaces for select using (owner = auth.uid() or is_space_member(id));
create policy members_read on space_members for select using (user_id = auth.uid() or is_space_member(space_id));

create policy activity_read on activity for select using (is_space_member(space_id));
create policy activity_write on activity for insert with check (is_space_member(space_id) and author = auth.uid());
create policy activity_update on activity for update using (is_space_member(space_id));

create policy reactions_read on reactions for select using (can_touch_activity(activity_id));
create policy reactions_write on reactions for insert with check (can_touch_activity(activity_id) and user_id = auth.uid());
create policy reactions_del on reactions for delete using (user_id = auth.uid());

create policy comments_read on comments for select using (can_touch_activity(activity_id));
create policy comments_write on comments for insert with check (can_touch_activity(activity_id) and user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table activity;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table comments;
