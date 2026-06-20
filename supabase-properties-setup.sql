create table if not exists property_items (
  id text primary key,
  title text not null,
  subtitle text not null,
  price_label text not null default 'Precio a consultar',
  price_usd numeric,
  type text not null default 'apartamento',
  category text not null default 'santo-domingo',
  city text not null,
  city_label text not null,
  zone text not null,
  zone_label text not null,
  beds integer,
  meters integer,
  status text not null default 'disponible' check (status in ('disponible', 'reservada', 'vendida')),
  status_label text not null default 'Disponible',
  notes text,
  tags text[] default '{}',
  image_url text not null,
  media_urls text[] default '{}',
  is_featured boolean default false,
  is_published boolean default true,
  created_at timestamptz default now()
);

alter table property_items enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.property_items to anon, authenticated;

drop policy if exists "Public can read published properties" on property_items;
drop policy if exists "Anon can read properties for portal" on property_items;
drop policy if exists "Anon can insert properties from portal" on property_items;
drop policy if exists "Anon can delete properties from portal" on property_items;

create policy "Public can read published properties"
on property_items for select
using (is_published = true);

create policy "Anon can read properties for portal"
on property_items for select
using (true);

create policy "Anon can insert properties from portal"
on property_items for insert
with check (true);

create policy "Anon can delete properties from portal"
on property_items for delete
using (true);
