-- Antony Real Estate CRM - configuracion PostgreSQL/Supabase para produccion
--
-- Objetivos de seguridad:
--   * La sesion anon solo puede leer property_items/evidence_items publicados.
--   * Solo authenticated puede mutar contenido y objetos del bucket evidencias.
--   * Cada fila CRM pertenece a auth.uid() y todas las relaciones incluyen owner_id.
--   * Las invariantes financieras se validan en el servidor y bajo bloqueo de la venta.
--   * El historial de auditoria se escribe exclusivamente desde triggers.
--
-- La migracion es reejecutable, autocontenida y se ejecuta en una unica transaccion.
-- En proyectos nuevos crea tambien las tablas publicas que consume el frontend.

begin;

set local lock_timeout = '15s';
set local idle_in_transaction_session_timeout = '5min';

-- -----------------------------------------------------------------------------
-- 1. Contenido publico: esquema autocontenido y precondicion de Storage
-- -----------------------------------------------------------------------------

-- Contrato REST consumido por admin.js/app.js. Los IDs los aporta el frontend.
-- is_published=false es el valor seguro por defecto: una alta incompleta nunca se
-- vuelve publica por accidente.
create table if not exists public.evidence_items (
  id text not null,
  title text not null,
  category text not null,
  city text,
  event_date date,
  description text,
  media_type text not null default 'image',
  media_url text not null,
  poster_url text,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),

  constraint evidence_items_pkey primary key (id),
  constraint evidence_items_id_check check (
    id = btrim(id)
    and id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
  ),
  constraint evidence_items_title_check check (
    char_length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'
  ),
  constraint evidence_items_category_check check (
    char_length(btrim(category)) between 1 and 60 and category !~ '[[:cntrl:]]'
  ),
  constraint evidence_items_city_check check (
    city is null
    or (char_length(btrim(city)) between 1 and 120 and city !~ '[[:cntrl:]]')
  ),
  constraint evidence_items_description_check check (
    description is null or char_length(description) <= 3000
  ),
  constraint evidence_items_media_type_check check (media_type in ('image', 'video')),
  constraint evidence_items_media_url_check check (
    char_length(btrim(media_url)) between 1 and 4096
    and media_url !~ '[[:cntrl:]]'
  ),
  constraint evidence_items_poster_url_check check (
    poster_url is null
    or (char_length(btrim(poster_url)) between 1 and 4096 and poster_url !~ '[[:cntrl:]]')
  )
);

create table if not exists public.property_items (
  id text not null,
  title text not null,
  subtitle text,
  price_label text not null default 'Precio a consultar',
  price_usd numeric(14,2),
  type text not null default 'apartamento',
  category text not null default 'santo-domingo',
  city text not null,
  city_label text,
  zone text not null,
  zone_label text,
  beds integer,
  meters numeric(12,2),
  status text not null default 'disponible',
  status_label text not null default 'Disponible',
  notes text,
  tags text[] not null default '{}'::text[],
  image_url text not null default '',
  media_urls text[] not null default '{}'::text[],
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),

  constraint property_items_pkey primary key (id),
  constraint property_items_id_check check (
    id = btrim(id)
    and id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
  ),
  constraint property_items_title_check check (
    char_length(btrim(title)) between 1 and 160 and title !~ '[[:cntrl:]]'
  ),
  constraint property_items_subtitle_check check (
    subtitle is null or char_length(btrim(subtitle)) between 1 and 200
  ),
  constraint property_items_price_label_check check (
    char_length(btrim(price_label)) between 1 and 80
  ),
  constraint property_items_price_usd_check check (
    price_usd is null or price_usd between 0 and 1000000000
  ),
  constraint property_items_type_check check (
    type in ('apartamento', 'proyecto', 'villa', 'penthouse', 'inversion')
  ),
  constraint property_items_category_check check (
    category in ('santo-domingo', 'turisticas')
  ),
  constraint property_items_city_check check (
    char_length(city) between 1 and 60 and city ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint property_items_city_label_check check (
    city_label is null or char_length(btrim(city_label)) between 1 and 100
  ),
  constraint property_items_zone_check check (
    char_length(zone) between 1 and 60 and zone ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint property_items_zone_label_check check (
    zone_label is null or char_length(btrim(zone_label)) between 1 and 100
  ),
  constraint property_items_beds_check check (beds is null or beds between 0 and 100),
  constraint property_items_meters_check check (
    meters is null or meters between 0 and 10000000
  ),
  constraint property_items_status_check check (
    status in ('disponible', 'reservada', 'vendida')
  ),
  constraint property_items_status_label_check check (
    char_length(btrim(status_label)) between 1 and 40
  ),
  constraint property_items_notes_check check (notes is null or char_length(notes) <= 3000),
  constraint property_items_tags_check check (cardinality(tags) <= 12),
  constraint property_items_image_url_check check (
    char_length(image_url) <= 4096 and image_url !~ '[[:cntrl:]]'
  ),
  constraint property_items_media_urls_check check (cardinality(media_urls) <= 20)
);

-- Compatibilidad aditiva: si las tablas ya existian se conservan sus datos y se
-- agregan solamente columnas faltantes del contrato actual. Los tipos existentes
-- no se fuerzan ni se convierten silenciosamente.
alter table public.evidence_items
  add column if not exists title text,
  add column if not exists category text,
  add column if not exists city text,
  add column if not exists event_date date,
  add column if not exists description text,
  add column if not exists media_type text default 'image',
  add column if not exists media_url text,
  add column if not exists poster_url text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_published boolean not null default false,
  add column if not exists created_at timestamptz not null default clock_timestamp();

alter table public.property_items
  add column if not exists title text,
  add column if not exists subtitle text,
  add column if not exists price_label text default 'Precio a consultar',
  add column if not exists price_usd numeric(14,2),
  add column if not exists type text default 'apartamento',
  add column if not exists category text default 'santo-domingo',
  add column if not exists city text,
  add column if not exists city_label text,
  add column if not exists zone text,
  add column if not exists zone_label text,
  add column if not exists beds integer,
  add column if not exists meters numeric(12,2),
  add column if not exists status text default 'disponible',
  add column if not exists status_label text default 'Disponible',
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists image_url text default '',
  add column if not exists media_urls text[] not null default '{}'::text[],
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_published boolean not null default false,
  add column if not exists created_at timestamptz not null default clock_timestamp();

create index if not exists evidence_items_public_order_idx
  on public.evidence_items(is_published, is_featured desc, created_at desc);
create index if not exists property_items_public_order_idx
  on public.property_items(is_published, is_featured desc, created_at desc);

do $crm_preflight$
begin
  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage no esta instalado (storage.buckets/storage.objects)';
  end if;
end
$crm_preflight$;

-- -----------------------------------------------------------------------------
-- 2. Contenido publico: lectura publicada y cero mutaciones anonimas
-- -----------------------------------------------------------------------------

do $crm_public_content$
declare
  v_table text;
  v_predicate text;
  v_admin_predicate text :=
    'coalesce((select auth.jwt()) -> ''app_metadata'' ->> ''role'', '''') = ''admin''';
  v_policy record;
begin
  foreach v_table in array array['property_items', 'evidence_items']
  loop
    -- El contrato actual usa is_published; los fallbacks solo preservan tablas
    -- legacy que ya tuvieran otro indicador compatible.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'is_published'
        and udt_name = 'bool'
    ) then
      v_predicate := 'is_published is true';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'published'
        and udt_name = 'bool'
    ) then
      v_predicate := 'published is true';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'is_public'
        and udt_name = 'bool'
    ) then
      v_predicate := 'is_public is true';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'status'
    ) then
      v_predicate :=
        'lower(btrim(status::text)) in (''published'', ''publicado'', ''publicada'')';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'visibility'
    ) then
      v_predicate :=
        'lower(btrim(visibility::text)) in (''public'', ''published'', ''publicado'', ''publicada'')';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_table
        and column_name = 'published_at'
    ) then
      v_predicate := 'published_at is not null and published_at <= clock_timestamp()';
    else
      raise exception
        'La tabla public.% no tiene un indicador de publicacion reconocido', v_table
        using hint = 'Use published/is_published/is_public boolean, status/visibility o published_at.';
    end if;

    -- Las politicas permisivas se combinan con OR. Para garantizar el cierre se
    -- eliminan todas las politicas previas de estas dos tablas y se recrean.
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_policy.policyname,
        v_table
      );
    end loop;

    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      v_table
    );
    execute format('grant select on table public.%I to anon', v_table);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      v_table
    );

    execute format(
      'create policy %I on public.%I for select to anon using (%s)',
      'crm_' || v_table || '_public_read',
      v_table,
      v_predicate
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      'crm_' || v_table || '_authenticated_read',
      v_table,
      v_admin_predicate
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      'crm_' || v_table || '_authenticated_insert',
      v_table,
      v_admin_predicate
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      'crm_' || v_table || '_authenticated_update',
      v_table,
      v_admin_predicate,
      v_admin_predicate
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      'crm_' || v_table || '_authenticated_delete',
      v_table,
      v_admin_predicate
    );
  end loop;
end
$crm_public_content$;

-- -----------------------------------------------------------------------------
-- 3. Bucket publico "evidencias"; escritura solo para authenticated
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, "public")
values ('evidencias', 'evidencias', true)
on conflict (id) do update
set name = excluded.name,
    "public" = true;

do $crm_storage_policies$
declare
  v_policy record;
begin
  -- Se reemplazan politicas anteriores que mencionen este bucket. Supabase
  -- administra el propietario, RLS y los grants base de storage.objects; este
  -- proyecto controla el acceso mediante politicas sin alterar esa tabla interna.
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname like 'crm_evidencias_%'
        or position('evidencias' in lower(coalesce(qual, ''))) > 0
        or position('evidencias' in lower(coalesce(with_check, ''))) > 0
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      v_policy.policyname
    );
  end loop;
end
$crm_storage_policies$;

create policy crm_evidencias_public_read
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'evidencias');

create policy crm_evidencias_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidencias'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
  and name like ((select auth.uid())::text || '/%')
);

create policy crm_evidencias_authenticated_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'evidencias'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
  and name like ((select auth.uid())::text || '/%')
)
with check (
  bucket_id = 'evidencias'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
  and name like ((select auth.uid())::text || '/%')
);

create policy crm_evidencias_authenticated_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'evidencias'
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
  and name like ((select auth.uid())::text || '/%')
);

-- Los objetos deben crearse/moverse/eliminarse mediante la API de Storage; no se
-- deben modificar directamente las filas de storage.objects desde la aplicacion.

-- -----------------------------------------------------------------------------
-- 4. Modelo CRM multiusuario
-- -----------------------------------------------------------------------------

create table if not exists public.crm_clients (
  owner_id uuid not null default auth.uid(),
  id text not null,
  name text not null,
  phone text not null,
  email text not null,
  source text,
  stage text not null default 'Nuevo',
  desired_zone text,
  property_stage text not null default 'Sin definir',
  budget numeric(18,2),
  budget_currency text,
  captured_at timestamptz not null default clock_timestamp(),
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint crm_clients_pkey primary key (owner_id, id),
  constraint crm_clients_owner_fk
    foreign key (owner_id) references auth.users(id) on delete restrict,
  constraint crm_clients_id_check check (
    id = btrim(id)
    and char_length(id) between 1 and 128
    and id !~ '[[:cntrl:]]'
  ),
  constraint crm_clients_name_check check (
    char_length(btrim(name)) between 1 and 200
    and name !~ '[[:cntrl:]]'
  ),
  constraint crm_clients_phone_check check (
    phone is null
    or (
      char_length(btrim(phone)) between 7 and 40
      and phone !~ '[[:cntrl:]]'
    )
  ),
  constraint crm_clients_email_check check (
    email is null
    or (
      char_length(email) <= 320
      and btrim(email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint crm_clients_contact_check check (
    nullif(btrim(coalesce(phone, '')), '') is not null
    and nullif(btrim(coalesce(email, '')), '') is not null
  ),
  constraint crm_clients_source_check check (
    source is null or char_length(btrim(source)) between 1 and 120
  ),
  constraint crm_clients_stage_check check (
    stage in ('Nuevo', 'Calificado', 'En seguimiento', 'Comprador', 'Inactivo')
  ),
  constraint crm_clients_zone_check check (
    desired_zone is null
    or desired_zone in (
      'Santo Domingo Norte',
      'Santo Domingo Este',
      'Santo Domingo Oeste',
      'Distrito Nacional',
      'Punta Cana',
      'El Cibao',
      'El Sur',
      'El Norte'
    )
  ),
  constraint crm_clients_property_stage_check check (
    property_stage in (
      'Sin definir', 'Listo', 'En planos / En construcción', 'Indiferente'
    )
  ),
  constraint crm_clients_budget_check check (
    budget is null
    or (budget >= 0 and budget::text not in ('NaN', 'Infinity', '-Infinity'))
  ),
  constraint crm_clients_budget_currency_check check (
    budget_currency is null or budget_currency in ('USD', 'DOP')
  ),
  constraint crm_clients_budget_pair_check check (
    budget is null or budget_currency is not null
  ),
  constraint crm_clients_notes_check check (
    notes is null or char_length(notes) <= 20000
  ),
  constraint crm_clients_timestamps_check check (updated_at >= created_at)
);

comment on table public.crm_clients is
  'Prospectos/clientes privados, aislados mediante owner_id = auth.uid().';

create table if not exists public.crm_sales (
  owner_id uuid not null default auth.uid(),
  id text not null,
  client_id text not null,
  project text not null,
  unit text not null,
  developer text,
  status text not null default 'Reservada',
  sale_price numeric(18,2) not null,
  sale_currency text not null,
  sale_date date not null default current_date,
  delivery_date date,
  shared_sale boolean not null default false,
  external_agent text,
  commission_rate numeric(7,4),
  commission_amount numeric(18,2) not null,
  commission_currency text not null,
  notes text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint crm_sales_pkey primary key (owner_id, id),
  constraint crm_sales_owner_fk
    foreign key (owner_id) references auth.users(id) on delete restrict,
  constraint crm_sales_client_fk
    foreign key (owner_id, client_id)
    references public.crm_clients(owner_id, id)
    on delete restrict,
  constraint crm_sales_id_check check (
    id = btrim(id)
    and char_length(id) between 1 and 128
    and id !~ '[[:cntrl:]]'
  ),
  constraint crm_sales_client_id_check check (
    client_id = btrim(client_id) and char_length(client_id) between 1 and 128
  ),
  constraint crm_sales_project_check check (
    char_length(btrim(project)) between 1 and 200
  ),
  constraint crm_sales_unit_check check (
    char_length(btrim(unit)) between 1 and 120
  ),
  constraint crm_sales_developer_check check (
    developer is null or char_length(btrim(developer)) between 1 and 200
  ),
  constraint crm_sales_developer_project_check check (
    developer is not distinct from 'Constructora LVP'
    and project in (
      'Altos del este', 'Riviera 1', 'Riviera 2', 'Riviera 3',
      'Riviera 4', 'Vistas del limonal', 'Epic Moon', 'Epic River',
      'Doña Carmen', 'Las Margaritas', 'LP12', 'LP11', 'LP11 ABEY',
      'East Town'
    )
  ),
  constraint crm_sales_status_check check (
    status in (
      'Reservada', 'Opción a compra firmada', 'Entregado', 'Desistió', 'Cambio'
    )
  ),
  constraint crm_sales_price_check check (
    sale_price > 0
    and sale_price::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint crm_sales_currency_check check (sale_currency in ('USD', 'DOP')),
  constraint crm_sales_delivery_date_check check (
    (delivery_date is null or delivery_date >= sale_date)
    and (status <> 'Entregado' or delivery_date is not null)
  ),
  constraint crm_sales_shared_sale_check check (
    (
      shared_sale
      and nullif(btrim(coalesce(external_agent, '')), '') is not null
      and char_length(btrim(external_agent)) <= 200
    )
    or (
      not shared_sale
      and external_agent is null
    )
  ),
  constraint crm_sales_commission_rate_check check (
    commission_rate is null
    or (
      commission_rate >= 0
      and commission_rate <= 100
      and commission_rate::text not in ('NaN', 'Infinity', '-Infinity')
    )
  ),
  constraint crm_sales_commission_amount_check check (
    commission_amount > 0
    and commission_amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint crm_sales_commission_currency_check check (
    commission_currency in ('USD', 'DOP')
  ),
  constraint crm_sales_cancel_check check (
    (
      status in ('Desistió', 'Cambio')
      and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
      and cancelled_at is not null
    )
    or (
      status not in ('Desistió', 'Cambio')
      and cancel_reason is null
      and cancelled_at is null
    )
  ),
  constraint crm_sales_notes_check check (
    notes is null or char_length(notes) <= 20000
  ),
  constraint crm_sales_timestamps_check check (updated_at >= created_at)
);

comment on table public.crm_sales is
  'Ventas del CRM; cliente y propietario se validan con una FK compuesta.';

-- Compatibilidad con instalaciones creadas por una version anterior del archivo.
alter table public.crm_sales alter column developer drop not null;
alter table public.crm_clients
  add column if not exists property_stage text not null default 'Sin definir';
alter table public.crm_sales
  add column if not exists delivery_date date;
alter table public.crm_sales
  add column if not exists shared_sale boolean not null default false;
alter table public.crm_sales
  add column if not exists external_agent text;

-- Catálogo cerrado de Constructora LVP. Se canonizan proyectos reconocidos y
-- cualquier pareja fuera del único catálogo disponible se detiene para revisión.
with crm_lvp_catalog(project_key, canonical_project) as (
  values
    ('altos del este', 'Altos del este'),
    ('riviera 1', 'Riviera 1'),
    ('riviera 2', 'Riviera 2'),
    ('riviera 3', 'Riviera 3'),
    ('riviera 4', 'Riviera 4'),
    ('vistas del limonal', 'Vistas del limonal'),
    ('epic moon', 'Epic Moon'),
    ('epic river', 'Epic River'),
    ('doña carmen', 'Doña Carmen'),
    ('las margaritas', 'Las Margaritas'),
    ('lp12', 'LP12'),
    ('lp11', 'LP11'),
    ('lp11 abey', 'LP11 ABEY'),
    ('east town', 'East Town')
)
update public.crm_sales as sale
set project = catalog.canonical_project,
    developer = 'Constructora LVP'
from crm_lvp_catalog as catalog
where lower(btrim(sale.project)) = catalog.project_key
  and (
    sale.project is distinct from catalog.canonical_project
    or sale.developer is distinct from 'Constructora LVP'
  );

do $crm_lvp_catalog_review$
begin
  if exists (
    select 1
    from public.crm_sales
    where developer is distinct from 'Constructora LVP'
       or project not in (
        'Altos del este', 'Riviera 1', 'Riviera 2', 'Riviera 3',
        'Riviera 4', 'Vistas del limonal', 'Epic Moon', 'Epic River',
        'Doña Carmen', 'Las Margaritas', 'LP12', 'LP11', 'LP11 ABEY',
        'East Town'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Hay constructoras o proyectos fuera del catálogo autorizado de Constructora LVP',
      hint = 'Revise manualmente la pareja constructora/proyecto antes de continuar.';
  end if;
end
$crm_lvp_catalog_review$;

-- Teléfono y correo son parte obligatoria del expediente del cliente. La
-- migración falla de forma explícita si una instalación anterior necesita ser
-- completada antes de activar el nuevo contrato, en vez de inventar contactos.
do $crm_required_client_contacts$
begin
  if exists (
    select 1
    from public.crm_clients
    where nullif(btrim(coalesce(phone, '')), '') is null
       or nullif(btrim(coalesce(email, '')), '') is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Complete teléfono y correo de todos los clientes antes de aplicar esta versión';
  end if;
end
$crm_required_client_contacts$;

alter table public.crm_clients
  drop constraint if exists crm_clients_contact_check;
alter table public.crm_clients alter column phone set not null;
alter table public.crm_clients alter column email set not null;
alter table public.crm_clients
  add constraint crm_clients_contact_check check (
    nullif(btrim(phone), '') is not null
    and nullif(btrim(email), '') is not null
  );

create table if not exists public.crm_commission_installments (
  owner_id uuid not null default auth.uid(),
  id text not null,
  sale_id text not null,
  label text not null,
  installment_kind text not null,
  sequence integer not null,
  amount numeric(18,2) not null,
  due_date date not null,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint crm_commission_installments_pkey primary key (owner_id, id),
  constraint crm_commission_installments_owner_fk
    foreign key (owner_id) references auth.users(id) on delete restrict,
  constraint crm_commission_installments_sale_fk
    foreign key (owner_id, sale_id)
    references public.crm_sales(owner_id, id)
    on delete restrict,
  constraint crm_commission_installments_sale_id_key
    unique (owner_id, sale_id, id),
  constraint crm_commission_installments_sequence_key
    unique (owner_id, sale_id, sequence) deferrable initially immediate,
  constraint crm_commission_installments_id_check check (
    id = btrim(id) and char_length(id) between 1 and 128
  ),
  constraint crm_commission_installments_sale_id_check check (
    sale_id = btrim(sale_id) and char_length(sale_id) between 1 and 128
  ),
  constraint crm_commission_installments_label_check check (
    char_length(btrim(label)) between 1 and 160
  ),
  constraint crm_commission_installments_label_kind_check check (
    (installment_kind = 'advance' and label = 'Avance')
    or (installment_kind = 'balance' and label = 'Saldo')
    or (installment_kind = 'single' and label = 'Pago único')
  ),
  constraint crm_commission_installments_kind_check check (
    (installment_kind = 'single' and sequence = 1)
    or (installment_kind = 'advance' and sequence = 1)
    or (installment_kind = 'balance' and sequence = 2)
  ),
  constraint crm_commission_installments_sequence_check check (sequence > 0),
  constraint crm_commission_installments_amount_check check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint crm_commission_installments_notes_check check (
    notes is null or char_length(notes) <= 20000
  ),
  constraint crm_commission_installments_timestamps_check check (
    updated_at >= created_at
  )
);

comment on table public.crm_commission_installments is
  'Plan estructural de comision: single o advance+balance; label es solo presentación.';

-- Compatibilidad con instalaciones anteriores: la columna se agrega nullable y
-- se endurece únicamente después de validar y migrar la forma completa del plan.
alter table public.crm_commission_installments
  add column if not exists installment_kind text;
alter table public.crm_commission_installments
  drop constraint if exists crm_commission_installments_kind_check;
alter table public.crm_commission_installments
  drop constraint if exists crm_commission_installments_label_kind_check;
alter table public.crm_commission_installments
  alter column installment_kind drop not null;

-- Actualiza instalaciones previas de esta misma migracion: la unicidad diferible
-- permite intercambiar secuencias durante crm_save_sale sin estados intermedios
-- invalidos, y vuelve a validarse antes de que termine la RPC.
do $crm_installment_sequence_constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.crm_commission_installments'::regclass
      and conname = 'crm_commission_installments_sequence_key'
      and condeferrable
  ) then
    alter table public.crm_commission_installments
      drop constraint if exists crm_commission_installments_sequence_key;
    alter table public.crm_commission_installments
      add constraint crm_commission_installments_sequence_key
      unique (owner_id, sale_id, sequence)
      deferrable initially immediate;
  end if;
end
$crm_installment_sequence_constraint$;

create table if not exists public.crm_payments (
  owner_id uuid not null default auth.uid(),
  id text not null,
  sale_id text not null,
  installment_id text,
  amount numeric(18,2) not null,
  currency text not null,
  payment_date date not null,
  method text not null,
  reference text,
  status text not null default 'Contabilizado',
  void_reason text,
  voided_at timestamptz,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint crm_payments_pkey primary key (owner_id, id),
  constraint crm_payments_owner_fk
    foreign key (owner_id) references auth.users(id) on delete restrict,
  constraint crm_payments_sale_fk
    foreign key (owner_id, sale_id)
    references public.crm_sales(owner_id, id)
    on delete restrict,
  constraint crm_payments_installment_fk
    foreign key (owner_id, sale_id, installment_id)
    references public.crm_commission_installments(owner_id, sale_id, id)
    on delete restrict,
  constraint crm_payments_id_check check (
    id = btrim(id) and char_length(id) between 1 and 128
  ),
  constraint crm_payments_sale_id_check check (
    sale_id = btrim(sale_id) and char_length(sale_id) between 1 and 128
  ),
  constraint crm_payments_installment_id_check check (
    installment_id is null
    or (installment_id = btrim(installment_id) and char_length(installment_id) between 1 and 128)
  ),
  constraint crm_payments_accounted_installment_check check (
    status <> 'Contabilizado' or installment_id is not null
  ),
  constraint crm_payments_amount_check check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint crm_payments_currency_check check (currency in ('USD', 'DOP')),
  constraint crm_payments_method_check check (
    char_length(btrim(method)) between 1 and 100
  ),
  constraint crm_payments_reference_check check (
    reference is null or char_length(btrim(reference)) between 1 and 200
  ),
  constraint crm_payments_status_check check (
    status in ('Contabilizado', 'Anulado', 'Revertido')
  ),
  constraint crm_payments_void_check check (
    (
      status = 'Contabilizado'
      and void_reason is null
      and voided_at is null
    )
    or (
      status in ('Anulado', 'Revertido')
      and nullif(btrim(coalesce(void_reason, '')), '') is not null
      and voided_at is not null
    )
  ),
  constraint crm_payments_notes_check check (
    notes is null or char_length(notes) <= 20000
  ),
  constraint crm_payments_timestamps_check check (updated_at >= created_at)
);

comment on table public.crm_payments is
  'Cobros de comision. Solo status=Contabilizado participa en los totales.';

create table if not exists public.crm_audit_log (
  owner_id uuid not null,
  id text not null default gen_random_uuid()::text,
  table_name text not null,
  record_id text not null,
  operation text not null,
  changed_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  request_id text,
  transaction_id bigint not null default txid_current(),
  before_data jsonb,
  after_data jsonb,

  constraint crm_audit_log_pkey primary key (owner_id, id),
  constraint crm_audit_log_id_check check (
    id = btrim(id) and char_length(id) between 1 and 128
  ),
  constraint crm_audit_log_table_check check (
    table_name in (
      'crm_clients',
      'crm_sales',
      'crm_commission_installments',
      'crm_payments'
    )
  ),
  constraint crm_audit_log_operation_check check (
    operation in ('INSERT', 'UPDATE', 'DELETE')
  ),
  constraint crm_audit_log_shape_check check (
    (operation = 'INSERT' and before_data is null and after_data is not null)
    or (operation = 'UPDATE' and before_data is not null and after_data is not null)
    or (operation = 'DELETE' and before_data is not null and after_data is null)
  ),
  constraint crm_audit_log_actor_email_check check (
    actor_email is null or char_length(actor_email) <= 320
  )
);

comment on table public.crm_audit_log is
  'Bitacora inmutable generada por triggers; no acepta escrituras directas del cliente.';
comment on column public.crm_audit_log.owner_id is
  'No usa FK a auth.users para conservar la auditoria si la identidad deja de existir.';

-- Endurecimiento reejecutable para instalaciones creadas por una version previa.
-- Si existieran monedas fuera del dominio soportado, la migracion falla y exige
-- corregirlas explícitamente en lugar de reinterpretarlas como USD.
alter table public.crm_clients
  drop constraint if exists crm_clients_budget_currency_check;
alter table public.crm_clients
  add constraint crm_clients_budget_currency_check
  check (budget_currency is null or budget_currency in ('USD', 'DOP'));
alter table public.crm_clients
  drop constraint if exists crm_clients_budget_check;
alter table public.crm_clients
  add constraint crm_clients_budget_check
  check (
    budget is null
    or (budget >= 0 and budget::text not in ('NaN', 'Infinity', '-Infinity'))
  );
alter table public.crm_clients
  drop constraint if exists crm_clients_property_stage_check;
alter table public.crm_clients
  drop constraint if exists crm_clients_zone_check;
alter table public.crm_clients
  drop constraint if exists crm_clients_stage_check;

-- Normaliza catálogos cerrados sin perder silenciosamente valores desconocidos.
-- Las variantes reconocidas cubren el vocabulario histórico del CRM; cualquier
-- otra zona se conserva y provoca un error explícito antes de activar el CHECK.
update public.crm_clients as client
set desired_zone = normalized.desired_zone
from (
  select
    owner_id,
    id,
    case lower(btrim(desired_zone))
      when 'santo domingo norte' then 'Santo Domingo Norte'
      when 'santo domingo este' then 'Santo Domingo Este'
      when 'santo domingo oriental' then 'Santo Domingo Este'
      when 'zona oriental' then 'Santo Domingo Este'
      when 'santo domingo oeste' then 'Santo Domingo Oeste'
      when 'santo domingo occidental' then 'Santo Domingo Oeste'
      when 'zona occidental' then 'Santo Domingo Oeste'
      when 'distrito nacional' then 'Distrito Nacional'
      when 'punta cana' then 'Punta Cana'
      when 'el cibao' then 'El Cibao'
      when 'cibao' then 'El Cibao'
      when 'el sur' then 'El Sur'
      when 'sur' then 'El Sur'
      when 'el norte' then 'El Norte'
      when 'norte' then 'El Norte'
      else nullif(btrim(desired_zone), '')
    end as desired_zone
  from public.crm_clients
  where desired_zone is not null
) as normalized
where client.owner_id = normalized.owner_id
  and client.id = normalized.id
  and client.desired_zone is distinct from normalized.desired_zone;

do $crm_closed_interest_zones$
begin
  if exists (
    select 1
    from public.crm_clients
    where desired_zone is not null
      and desired_zone not in (
        'Santo Domingo Norte',
        'Santo Domingo Este',
        'Santo Domingo Oeste',
        'Distrito Nacional',
        'Punta Cana',
        'El Cibao',
        'El Sur',
        'El Norte'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Corrija las zonas de interés anteriores antes de aplicar el catálogo cerrado';
  end if;
end
$crm_closed_interest_zones$;

update public.crm_clients
set property_stage = 'En planos / En construcción'
where property_stage in ('En planos', 'En construcción');

do $crm_closed_client_stages$
begin
  if exists (
    select 1
    from public.crm_clients
    where stage not in ('Nuevo', 'Calificado', 'En seguimiento', 'Comprador', 'Inactivo')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Corrija las etapas de cliente anteriores antes de aplicar el catálogo cerrado';
  end if;
end
$crm_closed_client_stages$;

alter table public.crm_clients
  add constraint crm_clients_stage_check
  check (stage in ('Nuevo', 'Calificado', 'En seguimiento', 'Comprador', 'Inactivo'));

alter table public.crm_clients
  add constraint crm_clients_zone_check
  check (
    desired_zone is null
    or desired_zone in (
      'Santo Domingo Norte',
      'Santo Domingo Este',
      'Santo Domingo Oeste',
      'Distrito Nacional',
      'Punta Cana',
      'El Cibao',
      'El Sur',
      'El Norte'
    )
  );
alter table public.crm_clients
  add constraint crm_clients_property_stage_check
  check (
    property_stage in (
      'Sin definir', 'Listo', 'En planos / En construcción', 'Indiferente'
    )
  );

-- Los CHECK de estado se reinstalan después de reemplazar los triggers y migrar
-- los valores históricos, sin abrir una vía que omita validación o auditoría.
alter table public.crm_sales
  drop constraint if exists crm_sales_status_check;
alter table public.crm_sales
  drop constraint if exists crm_sales_cancel_check;
drop index if exists public.crm_sales_active_project_unit_uidx;

alter table public.crm_sales
  drop constraint if exists crm_sales_currency_check;
alter table public.crm_sales
  add constraint crm_sales_currency_check
  check (sale_currency in ('USD', 'DOP'));
alter table public.crm_sales
  drop constraint if exists crm_sales_commission_currency_check;
alter table public.crm_sales
  add constraint crm_sales_commission_currency_check
  check (commission_currency in ('USD', 'DOP'));
alter table public.crm_sales
  drop constraint if exists crm_sales_price_check;
alter table public.crm_sales
  add constraint crm_sales_price_check
  check (
    sale_price > 0
    and sale_price::text not in ('NaN', 'Infinity', '-Infinity')
  );
alter table public.crm_sales
  drop constraint if exists crm_sales_commission_rate_check;
alter table public.crm_sales
  add constraint crm_sales_commission_rate_check
  check (
    commission_rate is null
    or (
      commission_rate >= 0
      and commission_rate <= 100
      and commission_rate::text not in ('NaN', 'Infinity', '-Infinity')
    )
  );
alter table public.crm_sales
  drop constraint if exists crm_sales_commission_amount_check;
alter table public.crm_sales
  add constraint crm_sales_commission_amount_check
  check (
    commission_amount >= 0
    and commission_amount::text not in ('NaN', 'Infinity', '-Infinity')
  );
alter table public.crm_sales
  drop constraint if exists crm_sales_delivery_date_check;
alter table public.crm_sales
  drop constraint if exists crm_sales_developer_project_check;
alter table public.crm_sales
  add constraint crm_sales_developer_project_check
  check (
    developer is not distinct from 'Constructora LVP'
    and project in (
      'Altos del este', 'Riviera 1', 'Riviera 2', 'Riviera 3',
      'Riviera 4', 'Vistas del limonal', 'Epic Moon', 'Epic River',
      'Doña Carmen', 'Las Margaritas', 'LP12', 'LP11', 'LP11 ABEY',
      'East Town'
    )
  );
alter table public.crm_sales
  drop constraint if exists crm_sales_shared_sale_check;
alter table public.crm_sales
  add constraint crm_sales_shared_sale_check
  check (
    (
      shared_sale
      and nullif(btrim(coalesce(external_agent, '')), '') is not null
      and char_length(btrim(external_agent)) <= 200
    )
    or (
      not shared_sale
      and external_agent is null
    )
  );

alter table public.crm_commission_installments
  drop constraint if exists crm_commission_installments_amount_check;
alter table public.crm_commission_installments
  add constraint crm_commission_installments_amount_check
  check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

alter table public.crm_payments
  drop constraint if exists crm_payments_currency_check;
alter table public.crm_payments
  add constraint crm_payments_currency_check
  check (currency in ('USD', 'DOP'));
alter table public.crm_payments
  drop constraint if exists crm_payments_amount_check;
alter table public.crm_payments
  add constraint crm_payments_amount_check
  check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')
  );
alter table public.crm_payments
  drop constraint if exists crm_payments_accounted_installment_check;

-- Indices de acceso y unicidad de negocio.
create index if not exists crm_clients_owner_stage_idx
  on public.crm_clients(owner_id, stage);
create index if not exists crm_clients_owner_captured_idx
  on public.crm_clients(owner_id, captured_at desc);

create index if not exists crm_sales_owner_client_idx
  on public.crm_sales(owner_id, client_id);
create index if not exists crm_sales_owner_date_idx
  on public.crm_sales(owner_id, sale_date desc);

create index if not exists crm_installments_owner_sale_due_idx
  on public.crm_commission_installments(owner_id, sale_id, due_date);

create index if not exists crm_payments_owner_sale_date_idx
  on public.crm_payments(owner_id, sale_id, payment_date);
create index if not exists crm_payments_owner_installment_idx
  on public.crm_payments(owner_id, sale_id, installment_id)
  where installment_id is not null;
create index if not exists crm_payments_accounted_sale_idx
  on public.crm_payments(owner_id, sale_id)
  where status = 'Contabilizado';
create index if not exists crm_payments_accounted_installment_idx
  on public.crm_payments(owner_id, sale_id, installment_id)
  where status = 'Contabilizado' and installment_id is not null;
create unique index if not exists crm_payments_active_reference_uidx
  on public.crm_payments(owner_id, lower(btrim(reference)))
  where status = 'Contabilizado' and reference is not null;

create index if not exists crm_audit_log_owner_changed_idx
  on public.crm_audit_log(owner_id, changed_at desc);
create index if not exists crm_audit_log_owner_record_idx
  on public.crm_audit_log(owner_id, table_name, record_id, changed_at desc);

-- -----------------------------------------------------------------------------
-- 5. Funciones y triggers de integridad
-- -----------------------------------------------------------------------------

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$function$;

create or replace function public.crm_enforce_immutable_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id es inmutable';
  end if;

  if new.id is distinct from old.id then
    raise exception 'id es inmutable';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at es inmutable';
  end if;

  return new;
end
$function$;

-- Las validaciones financieras son VOLATILE deliberadamente: despues de tomar el
-- bloqueo FOR UPDATE de la venta, cada consulta obtiene un snapshot fresco y ve
-- los cobros/cuotas que hayan confirmado mientras esperaba el bloqueo.
create or replace function public.crm_validate_sale_financials()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_request_owner uuid := auth.uid();
  v_planned numeric := 0;
  v_accounted numeric := 0;
  v_first_payment date;
  v_first_due date;
begin
  -- Los BEFORE triggers se ejecutan antes del WITH CHECK de RLS. Esta comprobacion
  -- evita que una fila forjada use el SECURITY DEFINER para sondear otro owner.
  if v_request_owner is not null
     and new.owner_id is distinct from v_request_owner then
    raise exception using
      errcode = '42501',
      message = 'owner_id debe coincidir con auth.uid()';
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id is distinct from old.owner_id
    or new.id is distinct from old.id
  ) then
    raise exception 'owner_id e id de una venta son inmutables';
  end if;

  -- La fecha terminal es server-side cuando el cliente no la aporta.
  if new.status in ('Desistió', 'Cambio') then
    if nullif(btrim(coalesce(new.cancel_reason, '')), '') is null then
      raise exception 'Una venta Desistió o Cambio requiere cancel_reason';
    end if;

    new.cancelled_at := coalesce(new.cancelled_at, clock_timestamp());

    if new.cancelled_at::date < new.sale_date then
      raise exception 'cancelled_at no puede ser anterior a sale_date';
    end if;
  elsif new.cancel_reason is not null or new.cancelled_at is not null then
    raise exception
      'cancel_reason/cancelled_at solo aplican a una venta Desistió o Cambio';
  end if;

  if new.status = 'Entregado' then
    if new.delivery_date is null then
      raise exception 'Entregado requiere delivery_date explícita';
    end if;
    if new.delivery_date > current_date then
      raise exception 'Entregado no acepta delivery_date futura';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(i.amount), 0), min(i.due_date)
      into v_planned, v_first_due
    from public.crm_commission_installments as i
    where i.owner_id = new.owner_id
      and i.sale_id = new.id;

    select
      coalesce(sum(p.amount) filter (where p.status = 'Contabilizado'), 0),
      min(p.payment_date) filter (where p.status = 'Contabilizado')
      into v_accounted, v_first_payment
    from public.crm_payments as p
    where p.owner_id = new.owner_id
      and p.sale_id = new.id;

    if new.commission_amount < v_planned then
      raise exception
        'commission_amount (%) no puede ser menor que las cuotas planificadas (%)',
        new.commission_amount, v_planned;
    end if;

    if new.commission_amount < v_accounted then
      raise exception
        'commission_amount (%) no puede ser menor que lo contabilizado (%)',
        new.commission_amount, v_accounted;
    end if;

    if v_accounted > 0 and (
      new.sale_price is distinct from old.sale_price
      or new.sale_currency is distinct from old.sale_currency
      or new.sale_date is distinct from old.sale_date
      or new.commission_rate is distinct from old.commission_rate
      or new.commission_amount is distinct from old.commission_amount
      or new.commission_currency is distinct from old.commission_currency
    ) then
      raise exception
        'Montos, monedas y fecha de venta no cambian después de contabilizar cobros';
    end if;

    if new.status in ('Desistió', 'Cambio') and v_accounted > 0 then
      raise exception
        'No se puede cerrar como Desistió o Cambio: primero anule o revierta los cobros contabilizados (%)',
        v_accounted;
    end if;

    if v_accounted > 0
       and new.status not in ('Opción a compra firmada', 'Entregado') then
      raise exception
        'Una venta con cobros contabilizados debe estar en Opción a compra firmada o Entregado';
    end if;

    if new.status = 'Opción a compra firmada'
       and exists (
         select 1
         from public.crm_payments as p
         left join public.crm_commission_installments as i
           on i.owner_id = p.owner_id
          and i.sale_id = p.sale_id
          and i.id = p.installment_id
         where p.owner_id = new.owner_id
           and p.sale_id = new.id
           and p.status = 'Contabilizado'
           and (
             p.installment_id is null
             or i.installment_kind not in ('advance', 'single')
           )
       ) then
      raise exception
        'Opción a compra firmada solo admite cuotas kind advance o single';
    end if;

    if v_first_payment is not null and v_first_payment < new.sale_date then
      raise exception 'sale_date no puede quedar despues de un cobro contabilizado';
    end if;

    if v_first_due is not null and v_first_due < new.sale_date then
      raise exception 'sale_date no puede quedar despues de una cuota planificada';
    end if;

    if exists (
      select 1
      from public.crm_payments as p
      where p.owner_id = new.owner_id
        and p.sale_id = new.id
        and p.status = 'Contabilizado'
        and p.currency <> new.commission_currency
    ) then
      raise exception
        'commission_currency no puede diferir de la moneda de cobros contabilizados';
    end if;
  end if;

  return new;
end
$function$;

create or replace function public.crm_validate_installment_financials()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_request_owner uuid := auth.uid();
  v_commission numeric;
  v_sale_date date;
  v_sale_status text;
  v_other_planned numeric := 0;
  v_sale_accounted numeric := 0;
  v_accounted numeric := 0;
  v_unallocated_accounted numeric := 0;
begin
  if v_request_owner is not null
     and new.owner_id is distinct from v_request_owner then
    raise exception using
      errcode = '42501',
      message = 'owner_id debe coincidir con auth.uid()';
  end if;

  if new.installment_kind not in ('advance', 'balance', 'single') then
    raise exception 'installment_kind debe ser advance, balance o single';
  end if;

  -- label es presentación derivada. Nunca decide autorización ni estructura.
  new.label := case new.installment_kind
    when 'advance' then 'Avance'
    when 'balance' then 'Saldo'
    when 'single' then 'Pago único'
  end;

  -- INSERT ... ON CONFLICT DO UPDATE ejecuta primero los triggers de INSERT.
  -- Si el id ya existe, la rama UPDATE volverá a ejecutar esta función con OLD
  -- y aplicará todas las validaciones financieras sin contar dos veces la cuota.
  if tg_op = 'INSERT' and exists (
    select 1
    from public.crm_commission_installments as existing
    where existing.owner_id = new.owner_id
      and existing.id = new.id
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id is distinct from old.owner_id
    or new.id is distinct from old.id
    or new.sale_id is distinct from old.sale_id
    or new.installment_kind is distinct from old.installment_kind
  ) then
    raise exception
      'owner_id, id, sale_id e installment_kind de una cuota son inmutables';
  end if;

  select s.commission_amount, s.sale_date, s.status
    into v_commission, v_sale_date, v_sale_status
  from public.crm_sales as s
  where s.owner_id = new.owner_id
    and s.id = new.sale_id
  for update;

  if not found then
    raise exception 'La venta % no existe para este propietario', new.sale_id;
  end if;

  if v_sale_status in ('Desistió', 'Cambio') then
    raise exception
      'No se puede crear o modificar una cuota de una venta Desistió o Cambio';
  end if;

  if new.due_date < v_sale_date then
    raise exception 'due_date no puede ser anterior a sale_date';
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(i.amount), 0)
      into v_other_planned
    from public.crm_commission_installments as i
    where i.owner_id = new.owner_id
      and i.sale_id = new.sale_id
      and i.id <> old.id;
  else
    select coalesce(sum(i.amount), 0)
      into v_other_planned
    from public.crm_commission_installments as i
    where i.owner_id = new.owner_id
      and i.sale_id = new.sale_id;
  end if;

  if v_other_planned + new.amount > v_commission then
    raise exception
      'Las cuotas (%) exceden commission_amount (%)',
      v_other_planned + new.amount, v_commission;
  end if;

  select
    coalesce(sum(p.amount), 0),
    coalesce(sum(p.amount) filter (where p.installment_id = new.id), 0),
    coalesce(sum(p.amount) filter (where p.installment_id is null), 0)
    into v_sale_accounted, v_accounted, v_unallocated_accounted
  from public.crm_payments as p
  where p.owner_id = new.owner_id
    and p.sale_id = new.sale_id
    and p.status = 'Contabilizado';

  if tg_op = 'INSERT' and v_sale_accounted > 0 then
    raise exception
      'No se pueden añadir cuotas después de contabilizar cobros';
  end if;

  if tg_op = 'UPDATE' and v_sale_accounted > 0 then
    if new.label is distinct from old.label
       or new.sequence is distinct from old.sequence
       or new.amount is distinct from old.amount
       or new.notes is distinct from old.notes then
      raise exception
        'La estructura y los montos del plan no cambian después de contabilizar cobros';
    end if;

    if new.due_date is distinct from old.due_date
       and (
         old.installment_kind <> 'balance'
         or new.installment_kind <> 'balance'
         or v_accounted > 0
         or v_unallocated_accounted > 0
       ) then
      raise exception
        'Solo puede cambiar due_date de Saldo mientras esa cuota no tenga cobros contabilizados';
    end if;
  end if;

  if v_accounted > new.amount then
    raise exception
      'La cuota (%) no puede ser menor que sus cobros contabilizados (%)',
      new.amount, v_accounted;
  end if;

  if v_sale_status = 'Opción a compra firmada'
     and v_accounted > 0
     and new.installment_kind not in ('advance', 'single') then
    raise exception
      'Una cuota cobrada en Opción a compra firmada debe ser kind advance o single';
  end if;

  return new;
end
$function$;

create or replace function public.crm_validate_commission_plan()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_request_owner uuid := auth.uid();
  v_owner uuid;
  v_sale_id text;
  v_commission numeric;
  v_plan_count bigint := 0;
  v_plan_total numeric := 0;
  v_single_count bigint := 0;
  v_advance_count bigint := 0;
  v_balance_count bigint := 0;
begin
  if tg_table_name = 'crm_sales' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_owner := new.owner_id;
    v_sale_id := new.id;
  else
    v_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
    v_sale_id := case when tg_op = 'DELETE' then old.sale_id else new.sale_id end;
  end if;

  if v_request_owner is not null and v_owner is distinct from v_request_owner then
    raise exception using
      errcode = '42501',
      message = 'owner_id debe coincidir con auth.uid()';
  end if;

  select s.commission_amount
    into v_commission
  from public.crm_sales as s
  where s.owner_id = v_owner
    and s.id = v_sale_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select
    count(*),
    coalesce(sum(i.amount), 0),
    count(*) filter (
      where i.installment_kind = 'single' and i.sequence = 1
    ),
    count(*) filter (
      where i.installment_kind = 'advance' and i.sequence = 1
    ),
    count(*) filter (
      where i.installment_kind = 'balance' and i.sequence = 2
    )
    into
      v_plan_count,
      v_plan_total,
      v_single_count,
      v_advance_count,
      v_balance_count
  from public.crm_commission_installments as i
  where i.owner_id = v_owner
    and i.sale_id = v_sale_id;

  if v_plan_total <> v_commission
     or not (
       (v_plan_count = 1 and v_single_count = 1)
       or (
         v_plan_count = 2
         and v_advance_count = 1
         and v_balance_count = 1
       )
     ) then
    raise exception using
      errcode = '23514',
      message = format(
        'Plan inválido para venta %s: requiere single 100%% o advance+balance 100%%',
        v_sale_id
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create or replace function public.crm_validate_payment_financials()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_request_owner uuid := auth.uid();
  v_commission numeric;
  v_commission_currency text;
  v_sale_date date;
  v_delivery_date date;
  v_sale_status text;
  v_other_sale_payments numeric := 0;
  v_installment_amount numeric;
  v_installment_kind text;
  v_other_installment_payments numeric := 0;
begin
  if tg_op = 'DELETE' then
    if old.status = 'Contabilizado' then
      raise exception
        'Un cobro contabilizado no se elimina; cambie su status a Anulado o Revertido';
    end if;
    return old;
  end if;

  if v_request_owner is not null
     and new.owner_id is distinct from v_request_owner then
    raise exception using
      errcode = '42501',
      message = 'owner_id debe coincidir con auth.uid()';
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id is distinct from old.owner_id
    or new.id is distinct from old.id
    or new.sale_id is distinct from old.sale_id
  ) then
    raise exception
      'owner_id, id y sale_id de un cobro son inmutables';
  end if;

  if tg_op = 'UPDATE'
     and new.installment_id is distinct from old.installment_id
     and (old.status = 'Contabilizado' or new.status = 'Contabilizado') then
    raise exception
      'installment_id no cambia mientras un cobro esta Contabilizado';
  end if;

  select
    s.commission_amount,
    s.commission_currency,
    s.sale_date,
    s.delivery_date,
    s.status
    into v_commission, v_commission_currency, v_sale_date, v_delivery_date, v_sale_status
  from public.crm_sales as s
  where s.owner_id = new.owner_id
    and s.id = new.sale_id
  for update;

  if not found then
    raise exception 'La venta % no existe para este propietario', new.sale_id;
  end if;

  if new.currency <> v_commission_currency then
    raise exception
      'La moneda del cobro (%) debe ser igual a commission_currency (%)',
      new.currency, v_commission_currency;
  end if;

  if lower(btrim(new.method)) <> 'efectivo'
     and nullif(btrim(coalesce(new.reference, '')), '') is null then
    raise exception 'reference es obligatoria salvo para pagos en Efectivo';
  end if;

  if new.status = 'Contabilizado' then
    if new.void_reason is not null or new.voided_at is not null then
      raise exception 'Un cobro Contabilizado no puede tener datos de anulacion';
    end if;

    if new.installment_id is null then
      raise exception 'Todo cobro Contabilizado requiere installment_id';
    end if;

    if v_sale_status not in ('Opción a compra firmada', 'Entregado') then
      raise exception
        'Solo ventas en Opción a compra firmada o Entregado aceptan cobros contabilizados';
    end if;

    if new.payment_date < v_sale_date then
      raise exception 'payment_date no puede ser anterior a sale_date';
    end if;

    if new.payment_date > current_date then
      raise exception 'Un cobro contabilizado no puede tener fecha futura';
    end if;
  else
    if nullif(btrim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'Un cobro Anulado/Revertido requiere void_reason';
    end if;

    new.voided_at := coalesce(new.voided_at, clock_timestamp());

    if new.voided_at::date < new.payment_date then
      raise exception 'voided_at no puede ser anterior a payment_date';
    end if;
  end if;

  if new.status = 'Contabilizado' then
    if tg_op = 'UPDATE' then
      select coalesce(sum(p.amount), 0)
        into v_other_sale_payments
      from public.crm_payments as p
      where p.owner_id = new.owner_id
        and p.sale_id = new.sale_id
        and p.status = 'Contabilizado'
        and p.id <> old.id;
    else
      select coalesce(sum(p.amount), 0)
        into v_other_sale_payments
      from public.crm_payments as p
      where p.owner_id = new.owner_id
        and p.sale_id = new.sale_id
        and p.status = 'Contabilizado';
    end if;

    if v_other_sale_payments + new.amount > v_commission then
      raise exception
        'El cobro causaria sobrepago de comision: % > %',
        v_other_sale_payments + new.amount, v_commission;
    end if;

    if new.installment_id is not null then
      select i.amount, i.installment_kind
        into v_installment_amount, v_installment_kind
      from public.crm_commission_installments as i
      where i.owner_id = new.owner_id
        and i.sale_id = new.sale_id
        and i.id = new.installment_id;

      if not found then
        raise exception
          'La cuota % no pertenece a la venta %',
          new.installment_id, new.sale_id;
      end if;

      if v_sale_status = 'Opción a compra firmada'
         and v_installment_kind not in ('advance', 'single') then
        raise exception
          'Opción a compra firmada solo permite kind advance o single; balance requiere Entregado';
      end if;

      if v_installment_kind = 'balance'
         and (v_delivery_date is null or new.payment_date < v_delivery_date) then
        raise exception
          'El saldo no puede cobrarse antes de delivery_date (%)',
          v_delivery_date;
      end if;

      if tg_op = 'UPDATE' then
        select coalesce(sum(p.amount), 0)
          into v_other_installment_payments
        from public.crm_payments as p
        where p.owner_id = new.owner_id
          and p.sale_id = new.sale_id
          and p.installment_id = new.installment_id
          and p.status = 'Contabilizado'
          and p.id <> old.id;
      else
        select coalesce(sum(p.amount), 0)
          into v_other_installment_payments
        from public.crm_payments as p
        where p.owner_id = new.owner_id
          and p.sale_id = new.sale_id
          and p.installment_id = new.installment_id
          and p.status = 'Contabilizado';
      end if;

      if v_other_installment_payments + new.amount > v_installment_amount then
        raise exception
          'El cobro causaria sobrepago de cuota: % > %',
          v_other_installment_payments + new.amount, v_installment_amount;
      end if;
    end if;
  end if;

  return new;
end
$function$;

create or replace function public.crm_write_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner_id uuid;
  v_record_id text;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_request_id text;
  v_headers text;
begin
  if tg_op = 'DELETE' then
    v_owner_id := old.owner_id;
    v_record_id := old.id;
  else
    v_owner_id := new.owner_id;
    v_record_id := new.id;
  end if;

  begin
    v_actor_id := auth.uid();
    v_actor_email := left(auth.jwt() ->> 'email', 320);
    v_actor_role := left(auth.jwt() ->> 'role', 80);
  exception when others then
    v_actor_id := null;
    v_actor_email := null;
    v_actor_role := null;
  end;

  v_headers := current_setting('request.headers', true);
  if nullif(v_headers, '') is not null then
    begin
      v_request_id := left((v_headers::jsonb ->> 'x-request-id'), 200);
    exception when others then
      v_request_id := null;
    end;
  end if;

  insert into public.crm_audit_log (
    owner_id,
    table_name,
    record_id,
    operation,
    actor_id,
    actor_email,
    actor_role,
    request_id,
    transaction_id,
    before_data,
    after_data
  )
  values (
    v_owner_id,
    tg_table_name,
    v_record_id,
    tg_op,
    v_actor_id,
    v_actor_email,
    v_actor_role,
    v_request_id,
    txid_current(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

create or replace function public.crm_block_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  raise exception 'crm_audit_log es inmutable';
end
$function$;

-- Toda mutacion del workspace autenticado toma un advisory lock compartido. La
-- importacion restore-only toma el mismo lock en modo exclusivo antes de comprobar
-- que el workspace este vacio; asi no existe una ventana TOCTOU entre la
-- comprobacion y las inserciones. Es un trigger por sentencia para no multiplicar
-- locks en cargas grandes.
create or replace function public.crm_lock_workspace_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is not null then
    perform pg_advisory_xact_lock_shared(
      hashtextextended('crm_workspace:' || v_owner::text, 0)
    );
  end if;

  return null;
end
$function$;

-- Triggers reejecutables.
drop trigger if exists crm_clients_workspace_lock_bs on public.crm_clients;
create trigger crm_clients_workspace_lock_bs
before insert or update or delete on public.crm_clients
for each statement execute function public.crm_lock_workspace_mutation();

drop trigger if exists crm_clients_identity_bu on public.crm_clients;
create trigger crm_clients_identity_bu
before update on public.crm_clients
for each row execute function public.crm_enforce_immutable_identity();

drop trigger if exists crm_clients_touch_bu on public.crm_clients;
create trigger crm_clients_touch_bu
before update on public.crm_clients
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_clients_audit_aiud on public.crm_clients;
create trigger crm_clients_audit_aiud
after insert or update or delete on public.crm_clients
for each row execute function public.crm_write_audit();

drop trigger if exists crm_sales_workspace_lock_bs on public.crm_sales;
create trigger crm_sales_workspace_lock_bs
before insert or update or delete on public.crm_sales
for each statement execute function public.crm_lock_workspace_mutation();

drop trigger if exists crm_sales_identity_bu on public.crm_sales;
create trigger crm_sales_identity_bu
before update on public.crm_sales
for each row execute function public.crm_enforce_immutable_identity();

drop trigger if exists crm_sales_financial_biu on public.crm_sales;
create trigger crm_sales_financial_biu
before insert or update on public.crm_sales
for each row execute function public.crm_validate_sale_financials();

drop trigger if exists crm_sales_touch_bu on public.crm_sales;
create trigger crm_sales_touch_bu
before update on public.crm_sales
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_sales_audit_aiud on public.crm_sales;
create trigger crm_sales_audit_aiud
after insert or update or delete on public.crm_sales
for each row execute function public.crm_write_audit();

drop trigger if exists crm_installments_identity_bu
  on public.crm_commission_installments;
drop trigger if exists crm_installments_workspace_lock_bs
  on public.crm_commission_installments;
create trigger crm_installments_workspace_lock_bs
before insert or update or delete on public.crm_commission_installments
for each statement execute function public.crm_lock_workspace_mutation();

create trigger crm_installments_identity_bu
before update on public.crm_commission_installments
for each row execute function public.crm_enforce_immutable_identity();

drop trigger if exists crm_installments_financial_biu
  on public.crm_commission_installments;
create trigger crm_installments_financial_biu
before insert or update on public.crm_commission_installments
for each row execute function public.crm_validate_installment_financials();

drop trigger if exists crm_installments_touch_bu
  on public.crm_commission_installments;
create trigger crm_installments_touch_bu
before update on public.crm_commission_installments
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_installments_audit_aiud
  on public.crm_commission_installments;
create trigger crm_installments_audit_aiud
after insert or update or delete on public.crm_commission_installments
for each row execute function public.crm_write_audit();

drop trigger if exists crm_payments_workspace_lock_bs on public.crm_payments;
create trigger crm_payments_workspace_lock_bs
before insert or update or delete on public.crm_payments
for each statement execute function public.crm_lock_workspace_mutation();

drop trigger if exists crm_payments_identity_bu on public.crm_payments;
create trigger crm_payments_identity_bu
before update on public.crm_payments
for each row execute function public.crm_enforce_immutable_identity();

drop trigger if exists crm_payments_financial_biud on public.crm_payments;
create trigger crm_payments_financial_biud
before insert or update or delete on public.crm_payments
for each row execute function public.crm_validate_payment_financials();

drop trigger if exists crm_payments_touch_bu on public.crm_payments;
create trigger crm_payments_touch_bu
before update on public.crm_payments
for each row execute function public.crm_touch_updated_at();

drop trigger if exists crm_payments_audit_aiud on public.crm_payments;
create trigger crm_payments_audit_aiud
after insert or update or delete on public.crm_payments
for each row execute function public.crm_write_audit();

drop trigger if exists crm_audit_log_immutable_bud on public.crm_audit_log;
create trigger crm_audit_log_immutable_bud
before update or delete on public.crm_audit_log
for each row execute function public.crm_block_audit_mutation();

drop trigger if exists crm_audit_log_immutable_bt on public.crm_audit_log;
create trigger crm_audit_log_immutable_bt
before truncate on public.crm_audit_log
for each statement execute function public.crm_block_audit_mutation();

-- Cancelada era ambiguo: puede significar Desistió o Cambio. Nunca se convierte
-- automáticamente; la transacción completa se detiene para revisión humana.
do $crm_legacy_cancelled_review$
begin
  if exists (
    select 1
    from public.crm_sales
    where status = 'Cancelada'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existen ventas Cancelada que requieren revisión manual',
      hint = 'Clasifique cada registro explícitamente como Desistió o Cambio antes de reejecutar.';
  end if;
end
$crm_legacy_cancelled_review$;

-- installment_kind se deriva solo de una forma inequívoca: una cuota sequence=1
-- o dos cuotas sequence=1/2. Cualquier otra forma o total se reporta y aborta.
do $crm_installment_kind_review$
begin
  if exists (
    select 1
    from public.crm_sales as s
    left join public.crm_commission_installments as i
      on i.owner_id = s.owner_id
     and i.sale_id = s.id
    group by s.owner_id, s.id
    having count(i.id) not in (1, 2)
       or (
         count(i.id) = 1
         and count(i.id) filter (where i.sequence = 1) <> 1
       )
       or (
         count(i.id) = 2
         and (
           count(i.id) filter (where i.sequence = 1) <> 1
           or count(i.id) filter (where i.sequence = 2) <> 1
         )
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Hay planes de comisión con más de 2 cuotas o secuencias ambiguas',
      hint = 'Revise manualmente: solo se admite single(1) o advance(1)+balance(2).';
  end if;

  if exists (
    select 1
    from public.crm_sales as s
    left join public.crm_commission_installments as i
      on i.owner_id = s.owner_id
     and i.sale_id = s.id
    group by s.owner_id, s.id, s.commission_amount
    having coalesce(sum(i.amount), 0) <> s.commission_amount
  ) then
    raise exception using
      errcode = '23514',
      message = 'Hay planes cuyo total no equivale al 100% de commission_amount',
      hint = 'Corrija los montos antes de migrar installment_kind.';
  end if;

  if exists (
    with plan_shapes as (
      select owner_id, sale_id, count(*) as plan_count
      from public.crm_commission_installments
      group by owner_id, sale_id
    )
    select 1
    from public.crm_commission_installments as i
    join plan_shapes as shape
      on shape.owner_id = i.owner_id
     and shape.sale_id = i.sale_id
    where i.installment_kind is not null
      and i.installment_kind <> case
        when shape.plan_count = 1 then 'single'
        when i.sequence = 1 then 'advance'
        when i.sequence = 2 then 'balance'
      end
  ) then
    raise exception using
      errcode = '23514',
      message = 'installment_kind existente contradice la forma estructural del plan',
      hint = 'Revise manualmente el kind antes de reejecutar.';
  end if;

  if exists (
    select 1
    from public.crm_payments
    where status = 'Contabilizado'
      and installment_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Hay cobros Contabilizados sin installment_id',
      hint = 'Asigne cada cobro a su cuota real antes de reejecutar.';
  end if;
end
$crm_installment_kind_review$;

-- Solo se pausa el trigger financiero para poblar la nueva columna en registros
-- terminales. Identidad, touch y auditoría permanecen activos y toda la operación
-- sigue aislada dentro de esta transacción.
drop trigger if exists crm_installments_financial_biu
  on public.crm_commission_installments;

with plan_shapes as (
  select owner_id, sale_id, count(*) as plan_count
  from public.crm_commission_installments
  group by owner_id, sale_id
)
update public.crm_commission_installments as installment
set installment_kind = case
      when shape.plan_count = 1 then 'single'
      when installment.sequence = 1 then 'advance'
      when installment.sequence = 2 then 'balance'
    end,
    label = case
      when shape.plan_count = 1 then 'Pago único'
      when installment.sequence = 1 then 'Avance'
      when installment.sequence = 2 then 'Saldo'
    end
from plan_shapes as shape
where shape.owner_id = installment.owner_id
  and shape.sale_id = installment.sale_id
  and (
    installment.installment_kind is distinct from case
      when shape.plan_count = 1 then 'single'
      when installment.sequence = 1 then 'advance'
      when installment.sequence = 2 then 'balance'
    end
    or installment.label is distinct from case
      when shape.plan_count = 1 then 'Pago único'
      when installment.sequence = 1 then 'Avance'
      when installment.sequence = 2 then 'Saldo'
    end
  );

alter table public.crm_commission_installments
  alter column installment_kind set not null;
alter table public.crm_commission_installments
  add constraint crm_commission_installments_kind_check
  check (
    (installment_kind = 'single' and sequence = 1)
    or (installment_kind = 'advance' and sequence = 1)
    or (installment_kind = 'balance' and sequence = 2)
  );
alter table public.crm_commission_installments
  add constraint crm_commission_installments_label_kind_check
  check (
    (installment_kind = 'advance' and label = 'Avance')
    or (installment_kind = 'balance' and label = 'Saldo')
    or (installment_kind = 'single' and label = 'Pago único')
  );
comment on column public.crm_commission_installments.installment_kind is
  'Clasificación estructural e inmutable; label nunca autoriza cobros.';

alter table public.crm_sales
  drop constraint if exists crm_sales_commission_amount_check;
alter table public.crm_sales
  add constraint crm_sales_commission_amount_check
  check (
    commission_amount > 0
    and commission_amount::text not in ('NaN', 'Infinity', '-Infinity')
  );

create trigger crm_installments_financial_biu
before insert or update on public.crm_commission_installments
for each row execute function public.crm_validate_installment_financials();

alter table public.crm_payments
  add constraint crm_payments_accounted_installment_check
  check (status <> 'Contabilizado' or installment_id is not null);

drop trigger if exists crm_sales_plan_constraint_aiu on public.crm_sales;
create constraint trigger crm_sales_plan_constraint_aiu
after insert or update on public.crm_sales
deferrable initially deferred
for each row execute function public.crm_validate_commission_plan();

drop trigger if exists crm_installments_plan_constraint_aiud
  on public.crm_commission_installments;
create constraint trigger crm_installments_plan_constraint_aiud
after insert or update or delete on public.crm_commission_installments
deferrable initially deferred
for each row execute function public.crm_validate_commission_plan();

-- Las ventas entregadas históricas necesitan una fecha real ya ocurrida. No se
-- completa ni se corrige automáticamente una fecha de negocio.
do $crm_legacy_delivery_review$
begin
  if exists (
    select 1
    from public.crm_sales
    where status in ('Entregada', 'Entregado')
      and (delivery_date is null or delivery_date > current_date)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Hay ventas entregadas sin delivery_date válida y no futura',
      hint = 'Registre la fecha real de entrega antes de reejecutar.';
  end if;
end
$crm_legacy_delivery_review$;

-- Una Contratada histórica solo puede avanzar si sus cobros activos pertenecen
-- estructuralmente a advance/single; nunca se decide por label.
do $crm_legacy_contracted_payments$
begin
  if exists (
    select 1
    from public.crm_sales as s
    join public.crm_payments as p
      on p.owner_id = s.owner_id
     and p.sale_id = s.id
     and p.status = 'Contabilizado'
    join public.crm_commission_installments as i
      on i.owner_id = p.owner_id
     and i.sale_id = p.sale_id
     and i.id = p.installment_id
    where s.status in ('Contratada', 'Opción a compra firmada')
      and i.installment_kind not in ('advance', 'single')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Una venta en opción tiene cobros activos de kind balance',
      hint = 'Anule/corrija esos cobros o marque Entregado con su delivery_date real.';
  end if;
end
$crm_legacy_contracted_payments$;

update public.crm_sales
set status = case status
  when 'Contratada' then 'Opción a compra firmada'
  when 'Entregada' then 'Entregado'
  else status
end
where status in ('Contratada', 'Entregada');

alter table public.crm_sales
  add constraint crm_sales_status_check
  check (
    status in (
      'Reservada', 'Opción a compra firmada', 'Entregado', 'Desistió', 'Cambio'
    )
  );
alter table public.crm_sales
  add constraint crm_sales_cancel_check
  check (
    (
      status in ('Desistió', 'Cambio')
      and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
      and cancelled_at is not null
    )
    or (
      status not in ('Desistió', 'Cambio')
      and cancel_reason is null
      and cancelled_at is null
    )
  );
alter table public.crm_sales
  add constraint crm_sales_delivery_date_check
  check (
    (delivery_date is null or delivery_date >= sale_date)
    and (status <> 'Entregado' or delivery_date is not null)
  );

create unique index crm_sales_active_project_unit_uidx
  on public.crm_sales(owner_id, lower(btrim(project)), lower(btrim(unit)))
  where status not in ('Desistió', 'Cambio');

-- -----------------------------------------------------------------------------
-- 6. RLS y grants minimos del CRM
-- -----------------------------------------------------------------------------

do $crm_rls$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'crm_clients',
    'crm_sales',
    'crm_commission_installments',
    'crm_payments',
    'crm_audit_log'
  ]
  loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        v_policy.policyname,
        v_table
      );
    end loop;

    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      v_table
    );

    execute format(
      'grant select on table public.%I to authenticated',
      v_table
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using '
      || '((select auth.uid()) is not null and owner_id = (select auth.uid()))',
      v_table || '_owner_select',
      v_table
    );

    if v_table = 'crm_clients' then
      execute format(
        'grant insert, update, delete on table public.%I to authenticated',
        v_table
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check '
        || '((select auth.uid()) is not null and owner_id = (select auth.uid()))',
        v_table || '_owner_insert',
        v_table
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using '
        || '((select auth.uid()) is not null and owner_id = (select auth.uid())) '
        || 'with check ((select auth.uid()) is not null and owner_id = (select auth.uid()))',
        v_table || '_owner_update',
        v_table
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using '
        || '((select auth.uid()) is not null and owner_id = (select auth.uid()))',
        v_table || '_owner_delete',
        v_table
      );
    end if;
  end loop;
end
$crm_rls$;

-- -----------------------------------------------------------------------------
-- 7. RPC atomica para importar un respaldo de workspace
-- -----------------------------------------------------------------------------

-- PostgreSQL conserva los nombres de parametros al reemplazar funciones. Se
-- elimina la firma anterior para que PostgREST exponga exactamente p_state.
drop function if exists public.crm_import_workspace(jsonb);

create function public.crm_import_workspace(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner uuid := auth.uid();
  v_claimed_owner uuid;
  v_clients jsonb;
  v_sales jsonb;
  v_installments jsonb;
  v_payments jsonb;
  v_item jsonb;
  v_unknown text;
  v_total integer;
  v_client_count integer := 0;
  v_sale_count integer := 0;
  v_installment_count integer := 0;
  v_payment_count integer := 0;
  v_sale_id text;
  v_rows integer;
  v_bad_sale_id text;
begin
  if v_owner is null then
    raise exception using
      errcode = '28000',
      message = 'crm_import_workspace requiere una sesion authenticated';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'El respaldo debe ser un objeto JSON';
  end if;

  if pg_column_size(p_state) > 25 * 1024 * 1024 then
    raise exception using
      errcode = '54000',
      message = 'El respaldo excede el limite de 25 MiB';
  end if;

  select string_agg(k, ', ' order by k)
    into v_unknown
  from jsonb_object_keys(p_state) as keys(k)
  where not (
    k = any (array[
      'version',
      'exported_at',
      'owner_id',
      'clients',
      'sales',
      'commission_installments',
      'installments',
      'payments'
    ])
  );

  if v_unknown is not null then
    raise exception using
      errcode = '22023',
      message = format('Claves superiores no reconocidas: %s', v_unknown),
      hint = 'La auditoria no se importa: se regenera con triggers durante el proceso.';
  end if;

  if p_state ? 'commission_installments' and p_state ? 'installments' then
    raise exception using
      errcode = '22023',
      message = 'Use commission_installments o installments, no ambos';
  end if;

  if nullif(btrim(p_state ->> 'owner_id'), '') is not null then
    begin
      v_claimed_owner := (p_state ->> 'owner_id')::uuid;
    exception when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'owner_id superior no es un UUID valido';
    end;

    if v_claimed_owner <> v_owner then
      raise exception using
        errcode = '42501',
        message = 'El respaldo pertenece a otro owner_id';
    end if;
  end if;

  v_clients := coalesce(p_state -> 'clients', '[]'::jsonb);
  v_sales := coalesce(p_state -> 'sales', '[]'::jsonb);
  v_installments := coalesce(
    p_state -> 'commission_installments',
    p_state -> 'installments',
    '[]'::jsonb
  );
  v_payments := coalesce(p_state -> 'payments', '[]'::jsonb);

  if jsonb_typeof(v_clients) <> 'array'
     or jsonb_typeof(v_sales) <> 'array'
     or jsonb_typeof(v_installments) <> 'array'
     or jsonb_typeof(v_payments) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'clients, sales, installments y payments deben ser arrays JSON';
  end if;

  v_total := jsonb_array_length(v_clients)
    + jsonb_array_length(v_sales)
    + jsonb_array_length(v_installments)
    + jsonb_array_length(v_payments);

  if v_total > 100000 then
    raise exception using
      errcode = '54000',
      message = 'El respaldo excede el limite de 100000 registros';
  end if;

  -- Validar todo el ownership antes de la primera escritura. La funcion siempre
  -- fuerza owner_id=auth.uid(); un owner_id provisto solo sirve como verificacion.
  for v_item in
    select value from jsonb_array_elements(v_clients)
    union all
    select value from jsonb_array_elements(v_sales)
    union all
    select value from jsonb_array_elements(v_installments)
    union all
    select value from jsonb_array_elements(v_payments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using
        errcode = '22023',
        message = 'Cada elemento del respaldo debe ser un objeto JSON';
    end if;

    if nullif(btrim(v_item ->> 'owner_id'), '') is not null then
      begin
        v_claimed_owner := (v_item ->> 'owner_id')::uuid;
      exception when invalid_text_representation then
        raise exception using
          errcode = '22023',
          message = 'Un registro contiene owner_id invalido';
      end;

      if v_claimed_owner <> v_owner then
        raise exception using
          errcode = '42501',
          message = 'Un registro del respaldo pertenece a otro owner_id';
      end if;
    end if;
  end loop;

  -- La aplicación exporta installmentKind (camelCase); la base persiste
  -- installment_kind. Se aceptan respaldos SQL previos con snake_case, pero
  -- nunca dos valores contradictorios.
  if exists (
    select 1
    from jsonb_array_elements(v_installments) as x(value)
    where nullif(btrim(x.value ->> 'installmentKind'), '') is not null
      and nullif(btrim(x.value ->> 'installment_kind'), '') is not null
      and btrim(x.value ->> 'installmentKind')
        is distinct from btrim(x.value ->> 'installment_kind')
  ) then
    raise exception using
      errcode = '22023',
      message = 'installmentKind e installment_kind no pueden contradecirse';
  end if;

  select coalesce(
    jsonb_agg(
      x.value || jsonb_build_object(
        'installment_kind', coalesce(
          nullif(btrim(x.value ->> 'installmentKind'), ''),
          nullif(btrim(x.value ->> 'installment_kind'), '')
        ),
        'label', case coalesce(
          nullif(btrim(x.value ->> 'installmentKind'), ''),
          nullif(btrim(x.value ->> 'installment_kind'), '')
        )
          when 'advance' then 'Avance'
          when 'balance' then 'Saldo'
          when 'single' then 'Pago único'
          else x.value ->> 'label'
        end
      )
      order by x.ordinality
    ),
    '[]'::jsonb
  )
    into v_installments
  from jsonb_array_elements(v_installments) with ordinality
    as x(value, ordinality);

  -- Compatibilidad con respaldos anteriores. Se canonizan únicamente valores
  -- conocidos; cualquier catálogo desconocido se rechaza de forma explícita.
  select coalesce(
    jsonb_agg(
      x.value || jsonb_build_object(
        'desired_zone', case lower(btrim(x.value ->> 'desired_zone'))
          when 'santo domingo norte' then 'Santo Domingo Norte'
          when 'santo domingo este' then 'Santo Domingo Este'
          when 'santo domingo oriental' then 'Santo Domingo Este'
          when 'zona oriental' then 'Santo Domingo Este'
          when 'santo domingo oeste' then 'Santo Domingo Oeste'
          when 'santo domingo occidental' then 'Santo Domingo Oeste'
          when 'zona occidental' then 'Santo Domingo Oeste'
          when 'distrito nacional' then 'Distrito Nacional'
          when 'punta cana' then 'Punta Cana'
          when 'el cibao' then 'El Cibao'
          when 'cibao' then 'El Cibao'
          when 'el sur' then 'El Sur'
          when 'sur' then 'El Sur'
          when 'el norte' then 'El Norte'
          when 'norte' then 'El Norte'
          else nullif(btrim(x.value ->> 'desired_zone'), '')
        end,
        'property_stage', case coalesce(
          nullif(btrim(x.value ->> 'property_stage'), ''),
          'Sin definir'
        )
          when 'En planos' then 'En planos / En construcción'
          when 'En construcción' then 'En planos / En construcción'
          else coalesce(
            nullif(btrim(x.value ->> 'property_stage'), ''),
            'Sin definir'
          )
        end
      )
      order by x.ordinality
    ),
    '[]'::jsonb
  )
    into v_clients
  from jsonb_array_elements(v_clients) with ordinality as x(value, ordinality);

  select coalesce(
    jsonb_agg(
      x.value || jsonb_build_object(
        'status', case coalesce(
          nullif(btrim(x.value ->> 'status'), ''),
          'Reservada'
        )
          when 'Contratada' then 'Opción a compra firmada'
          when 'Entregada' then 'Entregado'
          else coalesce(
            nullif(btrim(x.value ->> 'status'), ''),
            'Reservada'
          )
        end,
        'project', case lower(btrim(x.value ->> 'project'))
          when 'altos del este' then 'Altos del este'
          when 'riviera 1' then 'Riviera 1'
          when 'riviera 2' then 'Riviera 2'
          when 'riviera 3' then 'Riviera 3'
          when 'riviera 4' then 'Riviera 4'
          when 'vistas del limonal' then 'Vistas del limonal'
          when 'epic moon' then 'Epic Moon'
          when 'epic river' then 'Epic River'
          when 'doña carmen' then 'Doña Carmen'
          when 'las margaritas' then 'Las Margaritas'
          when 'lp12' then 'LP12'
          when 'lp11' then 'LP11'
          when 'lp11 abey' then 'LP11 ABEY'
          when 'east town' then 'East Town'
          else nullif(btrim(x.value ->> 'project'), '')
        end,
        'developer', case lower(btrim(x.value ->> 'developer'))
          when 'lvp' then 'Constructora LVP'
          when 'constructora lvp' then 'Constructora LVP'
          else nullif(btrim(x.value ->> 'developer'), '')
        end
      )
      order by x.ordinality
    ),
    '[]'::jsonb
  )
    into v_sales
  from jsonb_array_elements(v_sales) with ordinality as x(value, ordinality);

  if exists (
    select 1
    from jsonb_array_elements(v_clients) as x(value)
    where nullif(x.value ->> 'desired_zone', '') is not null
      and (x.value ->> 'desired_zone') not in (
        'Santo Domingo Norte',
        'Santo Domingo Este',
        'Santo Domingo Oeste',
        'Distrito Nacional',
        'Punta Cana',
        'El Cibao',
        'El Sur',
        'El Norte'
      )
  ) then
    raise exception 'El respaldo contiene una zona de interés no permitida'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_clients) as x(value)
    where (x.value ->> 'property_stage') not in (
      'Sin definir', 'Listo', 'En planos / En construcción', 'Indiferente'
    )
  ) then
    raise exception 'El respaldo contiene un property_stage no permitido'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_clients) as x(value)
    where coalesce(nullif(btrim(x.value ->> 'stage'), ''), 'Nuevo') not in (
      'Nuevo', 'Calificado', 'En seguimiento', 'Comprador', 'Inactivo'
    )
  ) then
    raise exception 'El respaldo contiene una etapa de cliente no permitida'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sales) as x(value)
    where (x.value ->> 'status') = 'Cancelada'
  ) then
    raise exception using
      errcode = '23514',
      message = 'El respaldo contiene ventas Cancelada que requieren revisión manual',
      hint = 'Clasifique cada venta explícitamente como Desistió o Cambio.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sales) as x(value)
    where (x.value ->> 'status') not in (
      'Reservada', 'Opción a compra firmada', 'Entregado', 'Desistió', 'Cambio'
    )
  ) then
    raise exception 'El respaldo contiene un status de venta no permitido'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sales) as x(value)
    where (x.value ->> 'developer') is distinct from 'Constructora LVP'
       or (x.value ->> 'project') not in (
      'Altos del este', 'Riviera 1', 'Riviera 2', 'Riviera 3',
      'Riviera 4', 'Vistas del limonal', 'Epic Moon', 'Epic River',
      'Doña Carmen', 'Las Margaritas', 'LP12', 'LP11', 'LP11 ABEY',
      'East Town'
    )
  ) then
    raise exception 'El respaldo solo admite Constructora LVP y sus proyectos autorizados'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sales) as x(value)
    where (x.value ->> 'status') = 'Entregado'
      and (
        nullif(x.value ->> 'delivery_date', '') is null
        or (x.value ->> 'delivery_date')::date > current_date
      )
  ) then
    raise exception 'Entregado requiere delivery_date explícita y no futura'
      using errcode = '23514';
  end if;

  -- Un estado terminal puede conservar cobros historicos, pero ninguno puede
  -- seguir activo. Los triggers vuelven a imponer la regla durante la escritura.
  if exists (
    select 1
    from jsonb_array_elements(v_sales) as s(value)
    join jsonb_array_elements(v_payments) as p(value)
      on btrim(p.value ->> 'sale_id') = btrim(s.value ->> 'id')
    where coalesce(nullif(btrim(s.value ->> 'status'), ''), 'Reservada')
      in ('Desistió', 'Cambio')
      and coalesce(nullif(btrim(p.value ->> 'status'), ''), 'Contabilizado') = 'Contabilizado'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Una venta Desistió o Cambio no puede importar cobros Contabilizados';
  end if;

  -- Contrato restore-only. El lock exclusivo se coordina con los triggers por
  -- sentencia de todas las mutaciones CRM y elimina la carrera entre esta prueba
  -- y la primera insercion. Se incluye la auditoria: un workspace utilizado antes
  -- no se puede convertir en destino de merge ni sobrescribir historia financiera.
  perform pg_advisory_xact_lock(
    hashtextextended('crm_workspace:' || v_owner::text, 0)
  );

  if exists (select 1 from public.crm_clients where owner_id = v_owner)
     or exists (select 1 from public.crm_sales where owner_id = v_owner)
     or exists (
       select 1 from public.crm_commission_installments where owner_id = v_owner
     )
     or exists (select 1 from public.crm_payments where owner_id = v_owner)
     or exists (select 1 from public.crm_audit_log where owner_id = v_owner) then
    raise exception using
      errcode = '55000',
      message = 'crm_import_workspace solo restaura en un workspace completamente vacio',
      hint = 'No se permite merge: existen datos o auditoria para auth.uid().';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_clients) as x(value)
    where nullif(btrim(x.value ->> 'phone'), '') is null
       or nullif(btrim(x.value ->> 'email'), '') is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Cada cliente del respaldo debe incluir teléfono y correo electrónico';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_clients) as x(value)
    where nullif(btrim(x.value ->> 'id'), '') is null
  ) then
    raise exception 'Un cliente no tiene id' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_sales) as x(value)
    where nullif(btrim(x.value ->> 'id'), '') is null
  ) then
    raise exception 'Una venta no tiene id' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_installments) as x(value)
    where nullif(btrim(x.value ->> 'id'), '') is null
  ) then
    raise exception 'Una cuota no tiene id' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_payments) as x(value)
    where nullif(btrim(x.value ->> 'id'), '') is null
  ) then
    raise exception 'Un cobro no tiene id' using errcode = '22023';
  end if;

  -- JSON admite números finitos, pero PostgreSQL numeric también acepta valores
  -- especiales como NaN/Infinity al convertir texto. Solo se aceptan tokens JSON
  -- de tipo number antes de realizar cualquier cast financiero.
  if exists (
    select 1 from jsonb_array_elements(v_clients) as x(value)
    where x.value ? 'budget'
      and jsonb_typeof(x.value -> 'budget') is distinct from 'number'
      and jsonb_typeof(x.value -> 'budget') is distinct from 'null'
  ) then
    raise exception 'budget debe ser un numero JSON o null' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_sales) as x(value)
    where jsonb_typeof(x.value -> 'sale_price') is distinct from 'number'
       or jsonb_typeof(x.value -> 'commission_amount') is distinct from 'number'
       or (
         x.value ? 'commission_rate'
         and jsonb_typeof(x.value -> 'commission_rate') is distinct from 'number'
         and jsonb_typeof(x.value -> 'commission_rate') is distinct from 'null'
       )
  ) then
    raise exception
      'sale_price, commission_rate y commission_amount deben ser numeros JSON'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_sales) as x(value)
    where x.value ? 'shared_sale'
      and jsonb_typeof(x.value -> 'shared_sale') is distinct from 'boolean'
      and jsonb_typeof(x.value -> 'shared_sale') is distinct from 'null'
  ) then
    raise exception 'shared_sale debe ser boolean o null' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_installments) as x(value)
    where jsonb_typeof(x.value -> 'sequence') is distinct from 'number'
       or jsonb_typeof(x.value -> 'amount') is distinct from 'number'
  ) then
    raise exception 'sequence y amount de cuota deben ser numeros JSON'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sales) as s(value)
    left join lateral (
      select
        count(*) as plan_count,
        count(*) filter (
          where (i.value ->> 'sequence')::integer = 1
        ) as sequence_one_count,
        count(*) filter (
          where (i.value ->> 'sequence')::integer = 2
        ) as sequence_two_count,
        coalesce(sum((i.value ->> 'amount')::numeric), 0) as plan_total
      from jsonb_array_elements(v_installments) as i(value)
      where btrim(i.value ->> 'sale_id') = btrim(s.value ->> 'id')
    ) as shape on true
    where shape.plan_count not in (1, 2)
       or (shape.plan_count = 1 and shape.sequence_one_count <> 1)
       or (
         shape.plan_count = 2
         and (shape.sequence_one_count <> 1 or shape.sequence_two_count <> 1)
       )
       or shape.plan_total <> (s.value ->> 'commission_amount')::numeric
  ) then
    raise exception using
      errcode = '23514',
      message = 'El respaldo contiene un plan ambiguo o distinto del 100% de la comisión',
      hint = 'Solo se admite single(1) o advance(1)+balance(2).';
  end if;

  if exists (
    with plan_shapes as (
      select
        btrim(i.value ->> 'sale_id') as sale_id,
        count(*) as plan_count
      from jsonb_array_elements(v_installments) as i(value)
      group by btrim(i.value ->> 'sale_id')
    )
    select 1
    from jsonb_array_elements(v_installments) as i(value)
    join plan_shapes as shape
      on shape.sale_id = btrim(i.value ->> 'sale_id')
    where nullif(btrim(i.value ->> 'installment_kind'), '') is not null
      and btrim(i.value ->> 'installment_kind') <> case
        when shape.plan_count = 1 then 'single'
        when (i.value ->> 'sequence')::integer = 1 then 'advance'
        when (i.value ->> 'sequence')::integer = 2 then 'balance'
      end
  ) then
    raise exception using
      errcode = '23514',
      message = 'El respaldo contiene installment_kind contradictorio',
      hint = 'Revise el kind; no se autoriza ni se migra a partir de label.';
  end if;

  -- Backups antiguos sin kind se migran solo desde count+sequence. label queda
  -- canónico para presentación, pero nunca participa en autorización.
  select coalesce(
    jsonb_agg(
      x.value || jsonb_build_object(
        'installment_kind', case
          when x.plan_count = 1 then 'single'
          when (x.value ->> 'sequence')::integer = 1 then 'advance'
          when (x.value ->> 'sequence')::integer = 2 then 'balance'
        end,
        'label', case
          when x.plan_count = 1 then 'Pago único'
          when (x.value ->> 'sequence')::integer = 1 then 'Avance'
          when (x.value ->> 'sequence')::integer = 2 then 'Saldo'
        end
      )
      order by x.ordinality
    ),
    '[]'::jsonb
  )
    into v_installments
  from (
    select
      i.value,
      i.ordinality,
      count(*) over (partition by btrim(i.value ->> 'sale_id')) as plan_count
    from jsonb_array_elements(v_installments) with ordinality
      as i(value, ordinality)
  ) as x;

  if exists (
    select 1 from jsonb_array_elements(v_payments) as x(value)
    where jsonb_typeof(x.value -> 'amount') is distinct from 'number'
  ) then
    raise exception 'amount de cobro debe ser un numero JSON' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payments) as x(value)
    where coalesce(
      nullif(btrim(x.value ->> 'status'), ''),
      'Contabilizado'
    ) = 'Contabilizado'
      and nullif(btrim(x.value ->> 'installment_id'), '') is null
  ) then
    raise exception 'Todo cobro Contabilizado del respaldo requiere installment_id'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payments) as p(value)
    join jsonb_array_elements(v_installments) as i(value)
      on btrim(i.value ->> 'id') = btrim(p.value ->> 'installment_id')
     and btrim(i.value ->> 'sale_id') = btrim(p.value ->> 'sale_id')
    join jsonb_array_elements(v_sales) as s(value)
      on btrim(s.value ->> 'id') = btrim(p.value ->> 'sale_id')
    where coalesce(nullif(btrim(p.value ->> 'status'), ''), 'Contabilizado')
      = 'Contabilizado'
      and btrim(i.value ->> 'installment_kind') = 'balance'
      and (
        nullif(s.value ->> 'delivery_date', '') is null
        or (p.value ->> 'payment_date')::date
          < (s.value ->> 'delivery_date')::date
      )
  ) then
    raise exception 'Un saldo del respaldo tiene fecha anterior a la entrega'
      using errcode = '23514';
  end if;

  -- Solo INSERT. Cualquier error revierte toda la llamada, incluidas las filas y
  -- sus entradas de auditoria; no existe ninguna ruta de merge con datos previos.
  insert into public.crm_clients (
      owner_id, id, name, phone, email, source, stage, desired_zone, property_stage,
      budget, budget_currency, captured_at, notes, created_at, updated_at
  )
  select
      v_owner,
      btrim(x.value ->> 'id'),
      btrim(x.value ->> 'name'),
      nullif(btrim(x.value ->> 'phone'), ''),
      lower(nullif(btrim(x.value ->> 'email'), '')),
      nullif(btrim(x.value ->> 'source'), ''),
      coalesce(nullif(btrim(x.value ->> 'stage'), ''), 'Nuevo'),
      nullif(btrim(x.value ->> 'desired_zone'), ''),
      coalesce(nullif(btrim(x.value ->> 'property_stage'), ''), 'Sin definir'),
      (x.value ->> 'budget')::numeric,
      upper(nullif(btrim(x.value ->> 'budget_currency'), '')),
      coalesce((x.value ->> 'captured_at')::timestamptz, clock_timestamp()),
      nullif(x.value ->> 'notes', ''),
      coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
      coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
  from jsonb_array_elements(v_clients) as x(value);
  get diagnostics v_client_count = row_count;

  -- Las terminales se restauran una por una antes que las ventas activas. Cada
  -- fila vive como Reservada solo mientras se insertan su plan y sus cobros
  -- Anulados/Revertidos, y se cierra antes de procesar la siguiente. Esto evita
  -- tanto el trigger de cuotas terminales como colisiones temporales del índice
  -- parcial proyecto+unidad entre históricos Desistió/Cambio.
  for v_item in
    select x.value
    from jsonb_array_elements(v_sales) as x(value)
    where coalesce(nullif(btrim(x.value ->> 'status'), ''), 'Reservada')
      in ('Desistió', 'Cambio')
    order by btrim(x.value ->> 'id')
  loop
    v_sale_id := btrim(v_item ->> 'id');

    insert into public.crm_sales (
      owner_id, id, client_id, project, unit, developer, status,
      sale_price, sale_currency, sale_date, delivery_date, shared_sale, external_agent,
      commission_rate,
      commission_amount, commission_currency, notes, cancel_reason,
      cancelled_at, created_at, updated_at
    )
    values (
      v_owner,
      v_sale_id,
      btrim(v_item ->> 'client_id'),
      btrim(v_item ->> 'project'),
      btrim(v_item ->> 'unit'),
      nullif(btrim(v_item ->> 'developer'), ''),
      'Reservada',
      (v_item ->> 'sale_price')::numeric,
      upper(nullif(btrim(v_item ->> 'sale_currency'), '')),
      coalesce((v_item ->> 'sale_date')::date, current_date),
      (v_item ->> 'delivery_date')::date,
      coalesce((v_item ->> 'shared_sale')::boolean, false),
      nullif(btrim(v_item ->> 'external_agent'), ''),
      (v_item ->> 'commission_rate')::numeric,
      (v_item ->> 'commission_amount')::numeric,
      upper(coalesce(
        nullif(btrim(v_item ->> 'commission_currency'), ''),
        nullif(btrim(v_item ->> 'sale_currency'), '')
      )),
      nullif(v_item ->> 'notes', ''),
      null,
      null,
      coalesce((v_item ->> 'created_at')::timestamptz, clock_timestamp()),
      coalesce((v_item ->> 'updated_at')::timestamptz, clock_timestamp())
    );

    v_sale_count := v_sale_count + 1;

    insert into public.crm_commission_installments (
      owner_id, id, sale_id, label, installment_kind, sequence, amount, due_date,
      notes, created_at, updated_at
    )
    select
      v_owner,
      btrim(x.value ->> 'id'),
      btrim(x.value ->> 'sale_id'),
      btrim(x.value ->> 'label'),
      btrim(x.value ->> 'installment_kind'),
      (x.value ->> 'sequence')::integer,
      (x.value ->> 'amount')::numeric,
      (x.value ->> 'due_date')::date,
      nullif(x.value ->> 'notes', ''),
      coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
      coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
    from jsonb_array_elements(v_installments) as x(value)
    where btrim(x.value ->> 'sale_id') = v_sale_id;
    get diagnostics v_rows = row_count;
    v_installment_count := v_installment_count + v_rows;

    insert into public.crm_payments (
      owner_id, id, sale_id, installment_id, amount, currency,
      payment_date, method, reference, status, void_reason, voided_at,
      notes, created_at, updated_at
    )
    select
      v_owner,
      btrim(x.value ->> 'id'),
      btrim(x.value ->> 'sale_id'),
      nullif(btrim(x.value ->> 'installment_id'), ''),
      (x.value ->> 'amount')::numeric,
      upper(nullif(btrim(x.value ->> 'currency'), '')),
      (x.value ->> 'payment_date')::date,
      btrim(x.value ->> 'method'),
      nullif(btrim(x.value ->> 'reference'), ''),
      coalesce(nullif(btrim(x.value ->> 'status'), ''), 'Contabilizado'),
      nullif(btrim(x.value ->> 'void_reason'), ''),
      (x.value ->> 'voided_at')::timestamptz,
      nullif(x.value ->> 'notes', ''),
      coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
      coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
    from jsonb_array_elements(v_payments) as x(value)
    where btrim(x.value ->> 'sale_id') = v_sale_id;
    get diagnostics v_rows = row_count;
    v_payment_count := v_payment_count + v_rows;

    -- El UPDATE final vuelve a ejecutar crm_validate_sale_financials. Si hubiera
    -- aparecido un cobro activo, el cierre terminal falla y revierte todo.
    update public.crm_sales
    set status = btrim(v_item ->> 'status'),
        cancel_reason = nullif(btrim(v_item ->> 'cancel_reason'), ''),
        cancelled_at = (v_item ->> 'cancelled_at')::timestamptz
    where owner_id = v_owner
      and id = v_sale_id;
  end loop;

  -- Las ventas no terminales se cargan después, cuando las unidades usadas solo
  -- por históricos ya quedaron fuera del índice único parcial.
  insert into public.crm_sales (
    owner_id, id, client_id, project, unit, developer, status,
    sale_price, sale_currency, sale_date, delivery_date, shared_sale, external_agent,
    commission_rate,
    commission_amount, commission_currency, notes, cancel_reason,
    cancelled_at, created_at, updated_at
  )
  select
    v_owner,
    btrim(x.value ->> 'id'),
    btrim(x.value ->> 'client_id'),
    btrim(x.value ->> 'project'),
    btrim(x.value ->> 'unit'),
    nullif(btrim(x.value ->> 'developer'), ''),
    coalesce(nullif(btrim(x.value ->> 'status'), ''), 'Reservada'),
    (x.value ->> 'sale_price')::numeric,
    upper(nullif(btrim(x.value ->> 'sale_currency'), '')),
    coalesce((x.value ->> 'sale_date')::date, current_date),
    (x.value ->> 'delivery_date')::date,
    coalesce((x.value ->> 'shared_sale')::boolean, false),
    nullif(btrim(x.value ->> 'external_agent'), ''),
    (x.value ->> 'commission_rate')::numeric,
    (x.value ->> 'commission_amount')::numeric,
    upper(coalesce(
      nullif(btrim(x.value ->> 'commission_currency'), ''),
      nullif(btrim(x.value ->> 'sale_currency'), '')
    )),
    nullif(x.value ->> 'notes', ''),
    nullif(btrim(x.value ->> 'cancel_reason'), ''),
    (x.value ->> 'cancelled_at')::timestamptz,
    coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
    coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
  from jsonb_array_elements(v_sales) as x(value)
  where coalesce(nullif(btrim(x.value ->> 'status'), ''), 'Reservada')
    not in ('Desistió', 'Cambio');
  get diagnostics v_rows = row_count;
  v_sale_count := v_sale_count + v_rows;

  insert into public.crm_commission_installments (
    owner_id, id, sale_id, label, installment_kind, sequence, amount, due_date,
    notes, created_at, updated_at
  )
  select
    v_owner,
    btrim(x.value ->> 'id'),
    btrim(x.value ->> 'sale_id'),
    btrim(x.value ->> 'label'),
    btrim(x.value ->> 'installment_kind'),
    (x.value ->> 'sequence')::integer,
    (x.value ->> 'amount')::numeric,
    (x.value ->> 'due_date')::date,
    nullif(x.value ->> 'notes', ''),
    coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
    coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
  from jsonb_array_elements(v_installments) as x(value)
  where not exists (
    select 1
    from jsonb_array_elements(v_sales) as s(value)
    where coalesce(nullif(btrim(s.value ->> 'status'), ''), 'Reservada')
      in ('Desistió', 'Cambio')
      and btrim(s.value ->> 'id') = btrim(x.value ->> 'sale_id')
  );
  get diagnostics v_rows = row_count;
  v_installment_count := v_installment_count + v_rows;

  -- Un respaldo completo debe conservar exactamente la forma y el 100% del plan.
  select s.id
    into v_bad_sale_id
  from public.crm_sales as s
  left join public.crm_commission_installments as i
    on i.owner_id = s.owner_id
   and i.sale_id = s.id
  where s.owner_id = v_owner
  group by s.id, s.commission_amount
  having coalesce(sum(i.amount), 0) <> s.commission_amount
     or not (
       (
         count(i.id) = 1
         and count(i.id) filter (
           where i.installment_kind = 'single' and i.sequence = 1
         ) = 1
       )
       or (
         count(i.id) = 2
         and count(i.id) filter (
           where i.installment_kind = 'advance' and i.sequence = 1
         ) = 1
         and count(i.id) filter (
           where i.installment_kind = 'balance' and i.sequence = 2
         ) = 1
       )
     )
  order by s.id
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      message = format(
        'El plan de la venta %s no es single o advance+balance por el 100%%',
        v_bad_sale_id
      );
  end if;

  insert into public.crm_payments (
    owner_id, id, sale_id, installment_id, amount, currency,
    payment_date, method, reference, status, void_reason, voided_at,
    notes, created_at, updated_at
  )
  select
    v_owner,
    btrim(x.value ->> 'id'),
    btrim(x.value ->> 'sale_id'),
    nullif(btrim(x.value ->> 'installment_id'), ''),
    (x.value ->> 'amount')::numeric,
    upper(nullif(btrim(x.value ->> 'currency'), '')),
    (x.value ->> 'payment_date')::date,
    btrim(x.value ->> 'method'),
    nullif(btrim(x.value ->> 'reference'), ''),
    coalesce(nullif(btrim(x.value ->> 'status'), ''), 'Contabilizado'),
    nullif(btrim(x.value ->> 'void_reason'), ''),
    (x.value ->> 'voided_at')::timestamptz,
    nullif(x.value ->> 'notes', ''),
    coalesce((x.value ->> 'created_at')::timestamptz, clock_timestamp()),
    coalesce((x.value ->> 'updated_at')::timestamptz, clock_timestamp())
  from jsonb_array_elements(v_payments) as x(value)
  where not exists (
    select 1
    from jsonb_array_elements(v_sales) as s(value)
    where coalesce(nullif(btrim(s.value ->> 'status'), ''), 'Reservada')
      in ('Desistió', 'Cambio')
      and btrim(s.value ->> 'id') = btrim(x.value ->> 'sale_id')
  );
  get diagnostics v_rows = row_count;
  v_payment_count := v_payment_count + v_rows;

  if exists (
    select 1
    from public.crm_sales as s
    join public.crm_payments as p
      on p.owner_id = s.owner_id
     and p.sale_id = s.id
    where s.owner_id = v_owner
      and s.status in ('Desistió', 'Cambio')
      and p.status = 'Contabilizado'
  ) then
    raise exception using
      errcode = '23514',
      message = 'La restauracion no puede dejar cobros Contabilizados en ventas Desistió/Cambio';
  end if;

  -- Se conservan estos nombres de contadores por compatibilidad del consumidor;
  -- en esta version todos representan filas insertadas, nunca actualizadas.
  return jsonb_build_object(
    'owner_id', v_owner,
    'clients_upserted', v_client_count,
    'sales_upserted', v_sale_count,
    'installments_upserted', v_installment_count,
    'payments_upserted', v_payment_count
  );
end
$function$;

comment on function public.crm_import_workspace(jsonb) is
  'Restaura por INSERT un respaldo CRM solo en un workspace vacio; owner_id siempre es auth.uid().';

-- -----------------------------------------------------------------------------
-- 8. RPCs publicas de escritura del CRM
-- -----------------------------------------------------------------------------

drop function if exists public.crm_save_sale(jsonb, jsonb);

create function public.crm_save_sale(p_sale jsonb, p_installments jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner uuid := auth.uid();
  v_claimed_owner uuid;
  v_installments jsonb;
  v_item jsonb;
  v_sale_id text;
  v_client_id text;
  v_project text;
  v_unit text;
  v_developer text;
  v_status text;
  v_sale_price numeric;
  v_sale_currency text;
  v_sale_date date;
  v_delivery_date date;
  v_shared_sale boolean;
  v_external_agent text;
  v_commission_rate numeric;
  v_commission_amount numeric;
  v_commission_currency text;
  v_notes text;
  v_cancel_reason text;
  v_cancelled_at timestamptz;
  v_item_id text;
  v_item_sale_id text;
  v_item_label text;
  v_item_kind text;
  v_item_sequence integer;
  v_item_amount numeric;
  v_item_due_date date;
  v_plan_count integer := 0;
  v_distinct_ids integer := 0;
  v_distinct_sequences integer := 0;
  v_plan_total numeric := 0;
  v_single_count integer := 0;
  v_advance_count integer := 0;
  v_balance_count integer := 0;
  v_persisted_total numeric := 0;
  v_exists boolean := false;
  v_working_status text;
  v_working_commission numeric;
  v_working_sale_date date;
  v_existing public.crm_sales%rowtype;
  v_saved public.crm_sales%rowtype;
  v_result_installments jsonb;
begin
  if v_owner is null then
    raise exception using
      errcode = '28000',
      message = 'crm_save_sale requiere una sesion authenticated';
  end if;

  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'p_sale debe ser un objeto JSON';
  end if;

  if p_installments is null or jsonb_typeof(p_installments) = 'null' then
    v_installments := '[]'::jsonb;
  elsif jsonb_typeof(p_installments) = 'array' then
    v_installments := p_installments;
  else
    raise exception using
      errcode = '22023',
      message = 'p_installments debe ser un array JSON';
  end if;

  if pg_column_size(p_sale) + pg_column_size(v_installments) > 5 * 1024 * 1024 then
    raise exception using
      errcode = '54000',
      message = 'crm_save_sale excede el limite de 5 MiB';
  end if;

  -- Contrato frontend -> PostgreSQL: installmentKind se normaliza a la columna
  -- installment_kind. snake_case se conserva para clientes SQL existentes.
  if exists (
    select 1
    from jsonb_array_elements(v_installments) as x(value)
    where nullif(btrim(x.value ->> 'installmentKind'), '') is not null
      and nullif(btrim(x.value ->> 'installment_kind'), '') is not null
      and btrim(x.value ->> 'installmentKind')
        is distinct from btrim(x.value ->> 'installment_kind')
  ) then
    raise exception using
      errcode = '22023',
      message = 'installmentKind e installment_kind no pueden contradecirse';
  end if;

  select coalesce(
    jsonb_agg(
      x.value || jsonb_build_object(
        'installment_kind', coalesce(
          nullif(btrim(x.value ->> 'installmentKind'), ''),
          nullif(btrim(x.value ->> 'installment_kind'), '')
        ),
        'label', case coalesce(
          nullif(btrim(x.value ->> 'installmentKind'), ''),
          nullif(btrim(x.value ->> 'installment_kind'), '')
        )
          when 'advance' then 'Avance'
          when 'balance' then 'Saldo'
          when 'single' then 'Pago único'
          else x.value ->> 'label'
        end
      )
      order by x.ordinality
    ),
    '[]'::jsonb
  )
    into v_installments
  from jsonb_array_elements(v_installments) with ordinality
    as x(value, ordinality);

  if nullif(btrim(p_sale ->> 'owner_id'), '') is not null then
    begin
      v_claimed_owner := (p_sale ->> 'owner_id')::uuid;
    exception when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'p_sale.owner_id no es un UUID valido';
    end;

    if v_claimed_owner <> v_owner then
      raise exception using
        errcode = '42501',
        message = 'p_sale.owner_id no coincide con auth.uid()';
    end if;
  end if;

  if nullif(btrim(p_sale ->> 'status'), '') is not null
     and nullif(btrim(p_sale ->> 'sale_status'), '') is not null
     and btrim(p_sale ->> 'status') <> btrim(p_sale ->> 'sale_status') then
    raise exception using
      errcode = '22023',
      message = 'status y sale_status no pueden contradecirse';
  end if;

  if jsonb_typeof(p_sale -> 'sale_price') is distinct from 'number'
     or jsonb_typeof(p_sale -> 'commission_amount') is distinct from 'number'
     or (
       p_sale ? 'commission_rate'
       and jsonb_typeof(p_sale -> 'commission_rate') is distinct from 'number'
       and jsonb_typeof(p_sale -> 'commission_rate') is distinct from 'null'
     ) then
    raise exception using
      errcode = '22023',
      message = 'Los importes de p_sale deben ser numeros JSON finitos';
  end if;

  if p_sale ? 'shared_sale'
     and jsonb_typeof(p_sale -> 'shared_sale') is distinct from 'boolean'
     and jsonb_typeof(p_sale -> 'shared_sale') is distinct from 'null' then
    raise exception using
      errcode = '22023',
      message = 'p_sale.shared_sale debe ser boolean o null';
  end if;

  v_sale_id := nullif(btrim(p_sale ->> 'id'), '');
  v_client_id := nullif(btrim(p_sale ->> 'client_id'), '');
  v_project := nullif(btrim(p_sale ->> 'project'), '');
  v_unit := nullif(btrim(p_sale ->> 'unit'), '');
  v_developer := nullif(btrim(p_sale ->> 'developer'), '');
  v_status := coalesce(
    nullif(btrim(p_sale ->> 'status'), ''),
    nullif(btrim(p_sale ->> 'sale_status'), ''),
    'Reservada'
  );
  v_sale_price := (p_sale ->> 'sale_price')::numeric;
  v_sale_currency := upper(nullif(btrim(p_sale ->> 'sale_currency'), ''));
  v_sale_date := (p_sale ->> 'sale_date')::date;
  v_delivery_date := nullif(p_sale ->> 'delivery_date', '')::date;
  v_shared_sale := coalesce((p_sale ->> 'shared_sale')::boolean, false);
  v_external_agent := nullif(btrim(p_sale ->> 'external_agent'), '');
  v_commission_rate := (p_sale ->> 'commission_rate')::numeric;
  v_commission_amount := (p_sale ->> 'commission_amount')::numeric;
  v_commission_currency := upper(coalesce(
    nullif(btrim(p_sale ->> 'commission_currency'), ''),
    nullif(btrim(p_sale ->> 'sale_currency'), '')
  ));
  v_notes := nullif(p_sale ->> 'notes', '');
  v_cancel_reason := nullif(btrim(p_sale ->> 'cancel_reason'), '');
  v_cancelled_at := nullif(p_sale ->> 'cancelled_at', '')::timestamptz;

  if v_sale_id is null or char_length(v_sale_id) > 128
     or v_sale_id !~ '^[^[:cntrl:]]+$' then
    raise exception 'p_sale.id es obligatorio y debe tener hasta 128 caracteres';
  end if;

  if v_client_id is null or char_length(v_client_id) > 128 then
    raise exception 'p_sale.client_id es obligatorio y no puede exceder 128 caracteres';
  end if;

  if v_project is null or char_length(v_project) > 200
     or v_unit is null or char_length(v_unit) > 120 then
    raise exception 'project y unit son obligatorios y exceden sus limites';
  end if;

  if v_developer is not null and char_length(v_developer) > 200 then
    raise exception 'developer no puede exceder 200 caracteres';
  end if;

  if v_developer is distinct from 'Constructora LVP'
     or v_project not in (
    'Altos del este', 'Riviera 1', 'Riviera 2', 'Riviera 3',
    'Riviera 4', 'Vistas del limonal', 'Epic Moon', 'Epic River',
    'Doña Carmen', 'Las Margaritas', 'LP12', 'LP11', 'LP11 ABEY',
    'East Town'
  ) then
    raise exception 'Solo se admite Constructora LVP con un proyecto autorizado';
  end if;

  if v_status not in (
    'Reservada', 'Opción a compra firmada', 'Entregado', 'Desistió', 'Cambio'
  ) then
    raise exception 'Status de venta no valido: %', v_status;
  end if;

  if v_sale_price is null or v_sale_price <= 0
     or v_sale_price <> round(v_sale_price, 2) then
    raise exception 'sale_price debe ser positivo y tener como maximo 2 decimales';
  end if;

  if v_sale_currency is null or v_sale_currency not in ('USD', 'DOP')
     or v_commission_currency is null
     or v_commission_currency not in ('USD', 'DOP') then
    raise exception 'Las monedas permitidas son USD y DOP';
  end if;

  if v_sale_date is null then
    raise exception 'sale_date es obligatoria';
  end if;

  if v_delivery_date is not null and v_delivery_date < v_sale_date then
    raise exception 'delivery_date no puede ser anterior a sale_date';
  end if;

  if v_status = 'Entregado' then
    if v_delivery_date is null then
      raise exception 'Entregado requiere delivery_date explícita';
    end if;
    if v_delivery_date > current_date then
      raise exception 'Entregado no acepta delivery_date futura';
    end if;
  end if;

  if v_shared_sale and v_external_agent is null then
    raise exception 'Una venta compartida requiere external_agent';
  end if;
  if not v_shared_sale and v_external_agent is not null then
    raise exception 'external_agent solo aplica cuando shared_sale es true';
  end if;
  if v_external_agent is not null and char_length(v_external_agent) > 200 then
    raise exception 'external_agent no puede exceder 200 caracteres';
  end if;

  if v_commission_rate is not null and (
    v_commission_rate < 0
    or v_commission_rate > 100
    or v_commission_rate <> round(v_commission_rate, 4)
  ) then
    raise exception 'commission_rate debe estar entre 0 y 100 con hasta 4 decimales';
  end if;

  if v_commission_amount is null or v_commission_amount <= 0
     or v_commission_amount <> round(v_commission_amount, 2) then
    raise exception 'commission_amount debe ser positiva y tener hasta 2 decimales';
  end if;

  if v_notes is not null and char_length(v_notes) > 20000 then
    raise exception 'notes no puede exceder 20000 caracteres';
  end if;

  if v_status in ('Desistió', 'Cambio') then
    if v_cancel_reason is null then
      raise exception 'Una venta Desistió o Cambio requiere cancel_reason';
    end if;
    v_cancelled_at := coalesce(v_cancelled_at, clock_timestamp());
    if v_cancelled_at::date < v_sale_date then
      raise exception 'cancelled_at no puede ser anterior a sale_date';
    end if;
  elsif v_cancel_reason is not null or v_cancelled_at is not null then
    raise exception
      'cancel_reason/cancelled_at solo aplican a una venta Desistió o Cambio';
  end if;

  if jsonb_array_length(v_installments) > 2 then
    raise exception using
      errcode = '23514',
      message = 'El plan no puede tener más de 2 cuotas';
  end if;

  for v_item in select value from jsonb_array_elements(v_installments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada cuota debe ser un objeto JSON';
    end if;

    if nullif(btrim(v_item ->> 'owner_id'), '') is not null then
      begin
        v_claimed_owner := (v_item ->> 'owner_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Una cuota contiene owner_id invalido';
      end;
      if v_claimed_owner <> v_owner then
        raise exception using
          errcode = '42501',
          message = 'Una cuota pertenece a otro owner_id';
      end if;
    end if;

    v_item_id := nullif(btrim(v_item ->> 'id'), '');
    v_item_sale_id := nullif(btrim(v_item ->> 'sale_id'), '');
    v_item_label := nullif(btrim(v_item ->> 'label'), '');
    v_item_kind := nullif(btrim(v_item ->> 'installment_kind'), '');
    if jsonb_typeof(v_item -> 'sequence') is distinct from 'number'
       or jsonb_typeof(v_item -> 'amount') is distinct from 'number' then
      raise exception using
        errcode = '22023',
        message = 'sequence y amount de cada cuota deben ser numeros JSON finitos';
    end if;

    v_item_sequence := (v_item ->> 'sequence')::integer;
    v_item_amount := (v_item ->> 'amount')::numeric;
    v_item_due_date := (v_item ->> 'due_date')::date;

    if v_item_id is null or char_length(v_item_id) > 128 then
      raise exception 'Cada cuota requiere id de hasta 128 caracteres';
    end if;
    if v_item_sale_id is not null and v_item_sale_id <> v_sale_id then
      raise exception using
        errcode = '42501',
        message = 'Una cuota referencia otra venta';
    end if;
    if v_item_label is null or char_length(v_item_label) > 160 then
      raise exception 'Cada cuota requiere label de hasta 160 caracteres';
    end if;
    if v_item_kind is null
       or v_item_kind not in ('advance', 'balance', 'single') then
      raise exception
        'Cada cuota requiere installment_kind advance, balance o single';
    end if;
    if v_item_sequence is null or v_item_sequence <= 0
       or v_item_sequence > 1000000 then
      raise exception 'La secuencia de cuota debe estar entre 1 y 1000000';
    end if;
    if not (
      (v_item_kind = 'single' and v_item_sequence = 1)
      or (v_item_kind = 'advance' and v_item_sequence = 1)
      or (v_item_kind = 'balance' and v_item_sequence = 2)
    ) then
      raise exception 'installment_kind no coincide con su secuencia estructural';
    end if;
    if v_item_amount is null or v_item_amount <= 0
       or v_item_amount <> round(v_item_amount, 2) then
      raise exception 'Cada cuota requiere amount positivo con hasta 2 decimales';
    end if;
    if v_item_due_date is null or v_item_due_date < v_sale_date then
      raise exception 'due_date no puede ser anterior a sale_date';
    end if;
    if nullif(v_item ->> 'notes', '') is not null
       and char_length(v_item ->> 'notes') > 20000 then
      raise exception 'Las notes de una cuota no pueden exceder 20000 caracteres';
    end if;
  end loop;

  select
    count(*),
    count(distinct btrim(e.value ->> 'id')),
    count(distinct (e.value ->> 'sequence')::integer),
    coalesce(sum((e.value ->> 'amount')::numeric), 0),
    count(*) filter (
      where btrim(e.value ->> 'installment_kind') = 'single'
        and (e.value ->> 'sequence')::integer = 1
    ),
    count(*) filter (
      where btrim(e.value ->> 'installment_kind') = 'advance'
        and (e.value ->> 'sequence')::integer = 1
    ),
    count(*) filter (
      where btrim(e.value ->> 'installment_kind') = 'balance'
        and (e.value ->> 'sequence')::integer = 2
    )
    into
      v_plan_count,
      v_distinct_ids,
      v_distinct_sequences,
      v_plan_total,
      v_single_count,
      v_advance_count,
      v_balance_count
  from jsonb_array_elements(v_installments) as e(value);

  if v_plan_count <> v_distinct_ids then
    raise exception 'p_installments contiene ids duplicados';
  end if;
  if v_plan_count <> v_distinct_sequences then
    raise exception 'p_installments contiene secuencias duplicadas';
  end if;
  if not (
    (v_plan_count = 1 and v_single_count = 1)
    or (
      v_plan_count = 2
      and v_advance_count = 1
      and v_balance_count = 1
    )
  ) then
    raise exception
      'El plan requiere exactamente single o advance(1)+balance(2)';
  end if;
  if v_plan_total <> v_commission_amount then
    raise exception
      'La suma de cuotas (%) debe coincidir exactamente con commission_amount (%)',
      v_plan_total, v_commission_amount;
  end if;

  -- Serializa creacion y actualizacion incluso cuando la fila aun no existe.
  perform pg_advisory_xact_lock(
    hashtextextended('crm:sale:' || v_owner::text || ':' || v_sale_id, 0)
  );

  select s.*
    into v_existing
  from public.crm_sales as s
  where s.owner_id = v_owner
    and s.id = v_sale_id
  for update;
  v_exists := found;

  if exists (
    select 1
    from jsonb_array_elements(v_installments) as e(value)
    join public.crm_commission_installments as i
      on i.owner_id = v_owner
     and i.id = btrim(e.value ->> 'id')
    where i.sale_id <> v_sale_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Un id de cuota ya pertenece a otra venta del owner';
  end if;

  -- Tras el primer cobro se congela el contrato financiero y la estructura del
  -- plan. delivery_date sigue siendo editable y due_date solo puede variar para
  -- una cuota Saldo sin cobros propios ni cobros contabilizados sin asignar.
  if v_exists and exists (
    select 1
    from public.crm_payments as p
    where p.owner_id = v_owner
      and p.sale_id = v_sale_id
      and p.status = 'Contabilizado'
  ) and (
    v_existing.sale_price is distinct from v_sale_price
    or v_existing.sale_currency is distinct from v_sale_currency
    or v_existing.sale_date is distinct from v_sale_date
    or v_existing.commission_rate is distinct from v_commission_rate
    or v_existing.commission_amount is distinct from v_commission_amount
    or v_existing.commission_currency is distinct from v_commission_currency
    or v_plan_count <> (
      select count(*)
      from public.crm_commission_installments as i
      where i.owner_id = v_owner and i.sale_id = v_sale_id
    )
    or exists (
      select 1
      from public.crm_commission_installments as i
      where i.owner_id = v_owner
        and i.sale_id = v_sale_id
        and not exists (
          select 1
          from jsonb_array_elements(v_installments) as e(value)
          where btrim(e.value ->> 'id') = i.id
            and btrim(e.value ->> 'label') = i.label
            and btrim(e.value ->> 'installment_kind') = i.installment_kind
            and (e.value ->> 'sequence')::integer = i.sequence
            and (e.value ->> 'amount')::numeric = i.amount
            and (
              (e.value ->> 'due_date')::date = i.due_date
              or (
                i.installment_kind = 'balance'
                and not exists (
                  select 1
                  from public.crm_payments as p
                  where p.owner_id = i.owner_id
                    and p.sale_id = i.sale_id
                    and p.status = 'Contabilizado'
                    and (
                      p.installment_id = i.id
                      or p.installment_id is null
                    )
                )
              )
            )
            and i.notes is not distinct from nullif(e.value ->> 'notes', '')
        )
    )
  ) then
    raise exception
      'El contrato financiero y la estructura del plan no cambian despues de contabilizar cobros';
  end if;

  if not v_exists then
    -- Una venta histórica terminal se crea transitoriamente como Reservada para
    -- poder insertar su plan. La fila queda bloqueada/no visible hasta el commit y
    -- la actualización final aplica Desistió/Cambio con motivo y fecha.
    insert into public.crm_sales (
      owner_id, id, client_id, project, unit, developer, status,
      sale_price, sale_currency, sale_date, delivery_date, shared_sale, external_agent,
      commission_rate,
      commission_amount, commission_currency, notes, cancel_reason, cancelled_at
    )
    values (
      v_owner,
      v_sale_id,
      v_client_id,
      v_project,
      v_unit,
      v_developer,
      case when v_status in ('Desistió', 'Cambio') then 'Reservada' else v_status end,
      v_sale_price, v_sale_currency, v_sale_date, v_delivery_date,
      v_shared_sale, v_external_agent, v_commission_rate,
      v_commission_amount, v_commission_currency, v_notes,
      case when v_status in ('Desistió', 'Cambio') then null else v_cancel_reason end,
      case when v_status in ('Desistió', 'Cambio') then null else v_cancelled_at end
    )
    returning * into v_saved;
  else
    v_working_status := v_existing.status;
    if v_existing.status in ('Desistió', 'Cambio')
       and v_status not in ('Desistió', 'Cambio') then
      v_working_status := v_status;
    end if;
    v_working_commission := greatest(
      v_existing.commission_amount,
      v_commission_amount
    );
    v_working_sale_date := least(v_existing.sale_date, v_sale_date);

    update public.crm_sales
    set project = case
          when v_existing.status in ('Desistió', 'Cambio')
            and v_status not in ('Desistió', 'Cambio')
            then v_project
          else v_existing.project
        end,
        unit = case
          when v_existing.status in ('Desistió', 'Cambio')
            and v_status not in ('Desistió', 'Cambio')
            then v_unit
          else v_existing.unit
        end,
        status = v_working_status,
        sale_date = v_working_sale_date,
        commission_amount = v_working_commission,
        cancel_reason = case
          when v_working_status in ('Desistió', 'Cambio')
            then v_existing.cancel_reason
          else null
        end,
        cancelled_at = case
          when v_working_status in ('Desistió', 'Cambio')
            then v_existing.cancelled_at
          else null
        end
    where owner_id = v_owner
      and id = v_sale_id;
  end if;

  -- Los cobros no activos conservan su auditoria pero se desacoplan de cuotas que
  -- salen del plan. Los contabilizados ya fueron bloqueados por la validacion.
  update public.crm_payments as p
  set installment_id = null
  where p.owner_id = v_owner
    and p.sale_id = v_sale_id
    and p.installment_id is not null
    and p.status <> 'Contabilizado'
    and not exists (
      select 1
      from jsonb_array_elements(v_installments) as e(value)
      where btrim(e.value ->> 'id') = p.installment_id
    );

  delete from public.crm_commission_installments as i
  where i.owner_id = v_owner
    and i.sale_id = v_sale_id
    and not exists (
      select 1
      from jsonb_array_elements(v_installments) as e(value)
      where btrim(e.value ->> 'id') = i.id
    );

  set constraints public.crm_commission_installments_sequence_key deferred;

  -- Reducciones se aplican antes que aumentos para no exceder transitoriamente la
  -- comision de trabajo mientras se reemplaza el plan completo.
  for v_item in
    select e.value
    from jsonb_array_elements(v_installments) as e(value)
    left join public.crm_commission_installments as i
      on i.owner_id = v_owner
     and i.sale_id = v_sale_id
     and i.id = btrim(e.value ->> 'id')
    order by
      (e.value ->> 'amount')::numeric - coalesce(i.amount, 0),
      btrim(e.value ->> 'id')
  loop
    insert into public.crm_commission_installments as ci (
      owner_id, id, sale_id, label, installment_kind, sequence, amount, due_date,
      notes
    )
    values (
      v_owner,
      btrim(v_item ->> 'id'),
      v_sale_id,
      btrim(v_item ->> 'label'),
      btrim(v_item ->> 'installment_kind'),
      (v_item ->> 'sequence')::integer,
      (v_item ->> 'amount')::numeric,
      (v_item ->> 'due_date')::date,
      nullif(v_item ->> 'notes', '')
    )
    on conflict (owner_id, id) do update
    set sale_id = excluded.sale_id,
        label = excluded.label,
        installment_kind = excluded.installment_kind,
        sequence = excluded.sequence,
        amount = excluded.amount,
        due_date = excluded.due_date,
        notes = excluded.notes
    where (
      ci.sale_id,
      ci.label,
      ci.installment_kind,
      ci.sequence,
      ci.amount,
      ci.due_date,
      ci.notes
    ) is distinct from (
      excluded.sale_id,
      excluded.label,
      excluded.installment_kind,
      excluded.sequence,
      excluded.amount,
      excluded.due_date,
      excluded.notes
    );
  end loop;

  set constraints public.crm_commission_installments_sequence_key immediate;

  select
    coalesce(sum(i.amount), 0),
    count(*) filter (
      where i.installment_kind = 'single' and i.sequence = 1
    ),
    count(*) filter (
      where i.installment_kind = 'advance' and i.sequence = 1
    ),
    count(*) filter (
      where i.installment_kind = 'balance' and i.sequence = 2
    )
    into
      v_persisted_total,
      v_single_count,
      v_advance_count,
      v_balance_count
  from public.crm_commission_installments as i
  where i.owner_id = v_owner
    and i.sale_id = v_sale_id;

  if v_persisted_total <> v_commission_amount then
    raise exception
      'El plan persistido (%) no coincide con commission_amount (%)',
      v_persisted_total, v_commission_amount;
  end if;

  if not (
    (v_plan_count = 1 and v_single_count = 1)
    or (
      v_plan_count = 2
      and v_advance_count = 1
      and v_balance_count = 1
    )
  ) then
    raise exception 'El plan persistido no conserva su forma estructural';
  end if;

  update public.crm_sales
  set client_id = v_client_id,
      project = v_project,
      unit = v_unit,
      developer = v_developer,
      status = v_status,
      sale_price = v_sale_price,
      sale_currency = v_sale_currency,
      sale_date = v_sale_date,
      delivery_date = v_delivery_date,
      shared_sale = v_shared_sale,
      external_agent = v_external_agent,
      commission_rate = v_commission_rate,
      commission_amount = v_commission_amount,
      commission_currency = v_commission_currency,
      notes = v_notes,
      cancel_reason = v_cancel_reason,
      cancelled_at = v_cancelled_at
  where owner_id = v_owner
    and id = v_sale_id
  returning * into v_saved;

  select coalesce(
    jsonb_agg(to_jsonb(i) order by i.sequence, i.id),
    '[]'::jsonb
  )
    into v_result_installments
  from public.crm_commission_installments as i
  where i.owner_id = v_owner
    and i.sale_id = v_sale_id;

  return jsonb_build_object(
    'sale', to_jsonb(v_saved),
    'installments', v_result_installments
  );
end
$function$;

comment on function public.crm_save_sale(jsonb, jsonb) is
  'Upsert atomico de venta y reemplazo exacto de su plan de cuotas para auth.uid().';

drop function if exists public.crm_record_payment(jsonb);

create function public.crm_record_payment(p_payment jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner uuid := auth.uid();
  v_claimed_owner uuid;
  v_id text;
  v_sale_id text;
  v_installment_id text;
  v_amount numeric;
  v_currency text;
  v_payment_date date;
  v_method text;
  v_reference text;
  v_notes text;
  v_requested_status text;
  v_sale public.crm_sales%rowtype;
  v_existing public.crm_payments%rowtype;
  v_saved public.crm_payments%rowtype;
  v_total_accounted numeric := 0;
  v_installment_amount numeric;
  v_installment_kind text;
  v_installment_accounted numeric := 0;
begin
  if v_owner is null then
    raise exception using
      errcode = '28000',
      message = 'crm_record_payment requiere una sesion authenticated';
  end if;

  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'p_payment debe ser un objeto JSON';
  end if;

  if pg_column_size(p_payment) > 1024 * 1024 then
    raise exception using
      errcode = '54000',
      message = 'p_payment excede el limite de 1 MiB';
  end if;

  if nullif(btrim(p_payment ->> 'owner_id'), '') is not null then
    begin
      v_claimed_owner := (p_payment ->> 'owner_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'p_payment.owner_id no es un UUID valido';
    end;
    if v_claimed_owner <> v_owner then
      raise exception using
        errcode = '42501',
        message = 'p_payment.owner_id no coincide con auth.uid()';
    end if;
  end if;

  if jsonb_typeof(p_payment -> 'amount') is distinct from 'number' then
    raise exception using
      errcode = '22023',
      message = 'p_payment.amount debe ser un numero JSON finito';
  end if;

  v_id := nullif(btrim(p_payment ->> 'id'), '');
  v_sale_id := nullif(btrim(p_payment ->> 'sale_id'), '');
  v_installment_id := nullif(btrim(p_payment ->> 'installment_id'), '');
  v_amount := (p_payment ->> 'amount')::numeric;
  v_currency := upper(nullif(btrim(p_payment ->> 'currency'), ''));
  v_payment_date := (p_payment ->> 'payment_date')::date;
  v_method := nullif(btrim(p_payment ->> 'method'), '');
  v_reference := nullif(btrim(p_payment ->> 'reference'), '');
  v_notes := nullif(p_payment ->> 'notes', '');
  v_requested_status := coalesce(
    nullif(btrim(p_payment ->> 'status'), ''),
    'Contabilizado'
  );

  if v_id is null or char_length(v_id) > 128 then
    raise exception 'p_payment.id es obligatorio y no puede exceder 128 caracteres';
  end if;
  if v_sale_id is null or char_length(v_sale_id) > 128 then
    raise exception 'p_payment.sale_id es obligatorio y no puede exceder 128 caracteres';
  end if;
  if v_installment_id is null or char_length(v_installment_id) > 128 then
    raise exception
      'Todo cobro Contabilizado requiere installment_id de hasta 128 caracteres';
  end if;
  if v_requested_status <> 'Contabilizado' then
    raise exception 'crm_record_payment solo crea cobros Contabilizados';
  end if;
  if nullif(btrim(p_payment ->> 'void_reason'), '') is not null
     or nullif(btrim(p_payment ->> 'voided_at'), '') is not null then
    raise exception 'crm_record_payment no acepta datos de anulacion';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
    raise exception 'amount debe ser positivo y tener como maximo 2 decimales';
  end if;
  if v_currency is null or v_currency not in ('USD', 'DOP') then
    raise exception 'currency debe ser USD o DOP';
  end if;
  if v_payment_date is null then
    raise exception 'payment_date es obligatoria';
  end if;
  if v_method is null or char_length(v_method) > 100 then
    raise exception 'method es obligatorio y no puede exceder 100 caracteres';
  end if;
  if lower(v_method) <> 'efectivo' and v_reference is null then
    raise exception 'reference es obligatoria salvo para Efectivo';
  end if;
  if v_reference is not null and char_length(v_reference) > 200 then
    raise exception 'reference no puede exceder 200 caracteres';
  end if;
  if v_notes is not null and char_length(v_notes) > 20000 then
    raise exception 'notes no puede exceder 20000 caracteres';
  end if;

  -- Hace idempotente incluso la carrera de dos primeros intentos con el mismo id.
  perform pg_advisory_xact_lock(
    hashtextextended('crm:payment:' || v_owner::text || ':' || v_id, 0)
  );

  select p.*
    into v_existing
  from public.crm_payments as p
  where p.owner_id = v_owner
    and p.id = v_id
  for update;

  if found then
    if v_existing.status <> 'Contabilizado' then
      raise exception 'El id de cobro ya existe con status %', v_existing.status;
    end if;

    if v_existing.sale_id is distinct from v_sale_id
       or v_existing.installment_id is distinct from v_installment_id
       or v_existing.amount is distinct from v_amount
       or v_existing.currency is distinct from v_currency
       or v_existing.payment_date is distinct from v_payment_date
       or lower(btrim(v_existing.method)) is distinct from lower(v_method)
       or v_existing.reference is distinct from v_reference
       or v_existing.notes is distinct from v_notes then
      raise exception using
        errcode = '23505',
        message = 'El id de cobro ya existe con un payload material diferente';
    end if;

    return to_jsonb(v_existing);
  end if;

  select s.*
    into v_sale
  from public.crm_sales as s
  where s.owner_id = v_owner
    and s.id = v_sale_id
  for update;

  if not found then
    raise exception 'La venta % no existe para este owner', v_sale_id;
  end if;

  if v_sale.status not in ('Opción a compra firmada', 'Entregado') then
    raise exception
      'Solo ventas en Opción a compra firmada o Entregado aceptan cobros; status actual: %',
      v_sale.status;
  end if;
  if v_payment_date < v_sale.sale_date then
    raise exception 'payment_date no puede ser anterior a sale_date';
  end if;
  if v_payment_date > current_date then
    raise exception 'payment_date no puede ser futura';
  end if;
  if v_currency <> v_sale.commission_currency then
    raise exception
      'currency (%) debe coincidir con commission_currency (%)',
      v_currency, v_sale.commission_currency;
  end if;

  select coalesce(sum(p.amount), 0)
    into v_total_accounted
  from public.crm_payments as p
  where p.owner_id = v_owner
    and p.sale_id = v_sale_id
    and p.status = 'Contabilizado';

  if v_total_accounted + v_amount > v_sale.commission_amount then
    raise exception
      'El cobro excede el saldo total de comision: % > %',
      v_total_accounted + v_amount, v_sale.commission_amount;
  end if;

  if v_installment_id is not null then
    select i.amount, i.installment_kind
      into v_installment_amount, v_installment_kind
    from public.crm_commission_installments as i
    where i.owner_id = v_owner
      and i.sale_id = v_sale_id
      and i.id = v_installment_id;

    if not found then
      raise exception 'La cuota % no pertenece a la venta', v_installment_id;
    end if;

    if v_sale.status = 'Opción a compra firmada'
       and v_installment_kind not in ('advance', 'single') then
      raise exception
        'Opción a compra firmada solo permite kind advance o single; balance requiere Entregado';
    end if;

    if v_installment_kind = 'balance'
       and (v_sale.delivery_date is null or v_payment_date < v_sale.delivery_date) then
      raise exception
        'El saldo no puede cobrarse antes de delivery_date (%)',
        v_sale.delivery_date;
    end if;

    select coalesce(sum(p.amount), 0)
      into v_installment_accounted
    from public.crm_payments as p
    where p.owner_id = v_owner
      and p.sale_id = v_sale_id
      and p.installment_id = v_installment_id
      and p.status = 'Contabilizado';

    if v_installment_accounted + v_amount > v_installment_amount then
      raise exception
        'El cobro excede el saldo de la cuota: % > %',
        v_installment_accounted + v_amount, v_installment_amount;
    end if;
  end if;

  if v_reference is not null and exists (
    select 1
    from public.crm_payments as p
    where p.owner_id = v_owner
      and p.status = 'Contabilizado'
      and p.reference is not null
      and lower(btrim(p.reference)) = lower(v_reference)
  ) then
    raise exception using
      errcode = '23505',
      message = 'reference ya pertenece a otro cobro Contabilizado';
  end if;

  insert into public.crm_payments (
    owner_id, id, sale_id, installment_id, amount, currency,
    payment_date, method, reference, status, notes
  )
  values (
    v_owner, v_id, v_sale_id, v_installment_id, v_amount, v_currency,
    v_payment_date, v_method, v_reference, 'Contabilizado', v_notes
  )
  returning * into v_saved;

  return to_jsonb(v_saved);
end
$function$;

comment on function public.crm_record_payment(jsonb) is
  'Registra un cobro idempotente por owner_id+id y rechaza reintentos divergentes.';

drop function if exists public.crm_void_payment(text, text);

create function public.crm_void_payment(p_payment_id text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_owner uuid := auth.uid();
  v_payment_id text := nullif(btrim(p_payment_id), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_payment public.crm_payments%rowtype;
begin
  if v_owner is null then
    raise exception using
      errcode = '28000',
      message = 'crm_void_payment requiere una sesion authenticated';
  end if;

  if v_payment_id is null or char_length(v_payment_id) > 128 then
    raise exception 'p_payment_id es obligatorio y no puede exceder 128 caracteres';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'p_reason es obligatorio y no puede exceder 1000 caracteres';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('crm:payment:' || v_owner::text || ':' || v_payment_id, 0)
  );

  select p.*
    into v_payment
  from public.crm_payments as p
  where p.owner_id = v_owner
    and p.id = v_payment_id
  for update;

  if not found then
    raise exception 'El cobro no existe para este owner';
  end if;
  if v_payment.status <> 'Contabilizado' then
    raise exception 'Solo se puede Anular un cobro Contabilizado';
  end if;

  -- Conserva el mismo orden de bloqueo usado por los triggers financieros.
  perform 1
  from public.crm_sales as s
  where s.owner_id = v_owner
    and s.id = v_payment.sale_id
  for update;

  update public.crm_payments
  set status = 'Anulado',
      void_reason = v_reason,
      voided_at = clock_timestamp()
  where owner_id = v_owner
    and id = v_payment_id
  returning * into v_payment;

  return to_jsonb(v_payment);
end
$function$;

comment on function public.crm_void_payment(text, text) is
  'Anula un cobro Contabilizado del owner actual; no elimina el registro.';

-- Salud financiera del workspace. plan_matches exige tanto el total exacto como
-- una estructura valida: Pago unico o Avance + Saldo.
create or replace function public.crm_workspace_health()
returns table (
  sale_id text,
  sale_status text,
  commission_amount numeric,
  planned_amount numeric,
  accounted_amount numeric,
  unplanned_amount numeric,
  remaining_to_collect numeric,
  plan_matches boolean,
  is_overpaid boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select
    s.id as sale_id,
    s.status as sale_status,
    s.commission_amount,
    coalesce(i.planned_amount, 0) as planned_amount,
    coalesce(p.accounted_amount, 0) as accounted_amount,
    s.commission_amount - coalesce(i.planned_amount, 0) as unplanned_amount,
    greatest(s.commission_amount - coalesce(p.accounted_amount, 0), 0)
      as remaining_to_collect,
    (
      coalesce(i.planned_amount, 0) = s.commission_amount
      and (
        (
          coalesce(i.installment_count, 0) = 1
          and coalesce(i.single_count, 0) = 1
          and coalesce(i.advance_count, 0) = 0
          and coalesce(i.balance_count, 0) = 0
        )
        or (
          coalesce(i.installment_count, 0) = 2
          and coalesce(i.single_count, 0) = 0
          and coalesce(i.advance_count, 0) = 1
          and coalesce(i.balance_count, 0) = 1
        )
      )
    ) as plan_matches,
    coalesce(p.accounted_amount, 0) > s.commission_amount as is_overpaid
  from public.crm_sales as s
  left join lateral (
    select
      sum(ci.amount) as planned_amount,
      count(*) as installment_count,
      count(*) filter (
        where ci.installment_kind = 'single' and ci.sequence = 1
      ) as single_count,
      count(*) filter (
        where ci.installment_kind = 'advance' and ci.sequence = 1
      ) as advance_count,
      count(*) filter (
        where ci.installment_kind = 'balance' and ci.sequence = 2
      ) as balance_count
    from public.crm_commission_installments as ci
    where ci.owner_id = s.owner_id
      and ci.sale_id = s.id
  ) as i on true
  left join lateral (
    select sum(cp.amount) as accounted_amount
    from public.crm_payments as cp
    where cp.owner_id = s.owner_id
      and cp.sale_id = s.id
      and cp.status = 'Contabilizado'
  ) as p on true
  where s.owner_id = auth.uid()
  order by s.sale_date desc, s.id;
$function$;

comment on function public.crm_workspace_health() is
  'Resumen por venta para validar plan de cuotas, cobros y saldos del owner actual.';

-- Las funciones trigger no son APIs. PostgreSQL concede EXECUTE a PUBLIC por
-- defecto, por lo que se revoca expresamente y solo se exponen las RPC destinadas
-- al frontend.
revoke all on function public.crm_touch_updated_at() from public, anon, authenticated;
revoke all on function public.crm_enforce_immutable_identity() from public, anon, authenticated;
revoke all on function public.crm_validate_sale_financials() from public, anon, authenticated;
revoke all on function public.crm_validate_installment_financials() from public, anon, authenticated;
revoke all on function public.crm_validate_commission_plan() from public, anon, authenticated;
revoke all on function public.crm_validate_payment_financials() from public, anon, authenticated;
revoke all on function public.crm_write_audit() from public, anon, authenticated;
revoke all on function public.crm_block_audit_mutation() from public, anon, authenticated;
revoke all on function public.crm_lock_workspace_mutation() from public, anon, authenticated;
revoke all on function public.crm_import_workspace(jsonb) from public, anon, authenticated;
revoke all on function public.crm_save_sale(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.crm_record_payment(jsonb) from public, anon, authenticated;
revoke all on function public.crm_void_payment(text, text) from public, anon, authenticated;
revoke all on function public.crm_workspace_health() from public, anon, authenticated;

grant execute on function public.crm_import_workspace(jsonb) to authenticated;
grant execute on function public.crm_save_sale(jsonb, jsonb) to authenticated;
grant execute on function public.crm_record_payment(jsonb) to authenticated;
grant execute on function public.crm_void_payment(text, text) to authenticated;
grant execute on function public.crm_workspace_health() to authenticated;

-- Publica inmediatamente las tablas y RPC nuevas en el cache de PostgREST.
notify pgrst, 'reload schema';

commit;
