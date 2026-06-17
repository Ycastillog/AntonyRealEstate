# Configuracion de subida permanente

El panel funciona en dos modos:

- **Modo local de prueba:** guarda fotos/videos en el navegador usando IndexedDB. Sirve para probar el flujo, pero no lo ven otros visitantes.
- **Modo permanente:** sube archivos a Cloudinary y guarda los datos en Supabase. Esto hace que la pagina publica muestre las evidencias a todos.

Flujo de publicacion:

```text
Portal de Antony
-> sube foto/video
-> elige tipo: Entrega, Cierre, Feria, Recorrido, Testimonio, Cliente, Llaves o Firma
-> marca Publicado
-> aparece en Evidencia real / Casos reales
```

Las propiedades o proyectos disponibles no van en esta tabla. Eso pertenece al modulo de propiedades.

## 1. Cloudinary

Crear un unsigned upload preset para imagenes y videos.

Datos que se colocan en `media-config.js`:

```js
cloudinaryCloudName: "TU_CLOUD_NAME",
cloudinaryUploadPreset: "TU_UNSIGNED_UPLOAD_PRESET"
```

## 2. Supabase

Crear una tabla llamada `evidence_items` con este SQL:

```sql
create table evidence_items (
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

create policy "Public can read published evidence"
on evidence_items for select
using (is_published = true);

-- Para el portal sencillo de esta fase, el anon key tambien puede listar evidencias.
-- Si quieres ocultar evidencias no publicadas incluso en lectura anonima,
-- la siguiente fase debe usar Supabase Auth o un backend privado.
create policy "Anon can read evidence for portal"
on evidence_items for select
using (true);

create policy "Anon can insert evidence from admin panel"
on evidence_items for insert
with check (true);

create policy "Anon can delete evidence from admin panel"
on evidence_items for delete
using (true);
```

Datos que se colocan en `media-config.js`:

```js
supabaseUrl: "https://TU-PROYECTO.supabase.co",
supabaseAnonKey: "TU_ANON_KEY"
```

## 3. Seguridad

La clave `adminPassword` en `media-config.js` es una barrera sencilla para esta fase. Para una version comercial completa, lo ideal es mover el panel a Supabase Auth o a un backend propio para que la autenticacion sea real del lado servidor.
