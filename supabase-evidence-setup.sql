create table if not exists evidence_items (
  id text primary key,
  title text not null,
  category text not null check (category in ('Entrega', 'Cierre', 'Feria', 'Recorrido', 'Testimonio', 'Cliente', 'Llaves', 'Firma')),
  city text,
  event_date date,
  description text,
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null,
  poster_url text,
  is_featured boolean default false,
  is_published boolean default true,
  created_at timestamptz default now()
);

alter table evidence_items enable row level security;

drop policy if exists "Public can read published evidence" on evidence_items;
drop policy if exists "Anon can read evidence for portal" on evidence_items;
drop policy if exists "Anon can insert evidence from admin panel" on evidence_items;
drop policy if exists "Anon can delete evidence from admin panel" on evidence_items;

create policy "Public can read published evidence"
on evidence_items for select
using (is_published = true);

create policy "Anon can read evidence for portal"
on evidence_items for select
using (true);

create policy "Anon can insert evidence from admin panel"
on evidence_items for insert
with check (true);

create policy "Anon can delete evidence from admin panel"
on evidence_items for delete
using (true);

insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read evidence files" on storage.objects;
drop policy if exists "Anon can upload evidence files" on storage.objects;
drop policy if exists "Anon can update evidence files" on storage.objects;
drop policy if exists "Anon can delete evidence files" on storage.objects;

create policy "Public can read evidence files"
on storage.objects for select
using (bucket_id = 'evidencias');

create policy "Anon can upload evidence files"
on storage.objects for insert
with check (bucket_id = 'evidencias');

create policy "Anon can update evidence files"
on storage.objects for update
using (bucket_id = 'evidencias')
with check (bucket_id = 'evidencias');

create policy "Anon can delete evidence files"
on storage.objects for delete
using (bucket_id = 'evidencias');
