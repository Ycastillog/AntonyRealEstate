# Configuración segura de propiedades y evidencias

El portal administra propiedades, fotos, videos y evidencias con Supabase. El modo local puede servir para pruebas con archivos ficticios, pero la publicación permanente requiere una cuenta autenticada.

## Configuración recomendada

1. Crear el proyecto Supabase de producción.
2. Ejecutar `supabase-production-setup.sql`; no usar políticas de escritura anónima.
3. Crear el usuario autorizado en Supabase Auth y desactivar el registro público.
4. Configurar en `media-config.js` únicamente la URL, la clave publicable y los nombres de tabla/bucket.
5. Abrir `/portal/`, iniciar sesión y subir una evidencia ficticia para la prueba de aceptación.

```js
window.ANTONY_MEDIA_CONFIG = {
  cloudinaryCloudName: "",
  cloudinaryUploadPreset: "",
  cloudinaryFolder: "antony-real-estate",
  supabaseUrl: "https://ID-DEL-PROYECTO.supabase.co",
  supabaseAnonKey: "CLAVE_PUBLICABLE",
  supabaseStorageBucket: "evidencias",
  supabaseTable: "evidence_items",
  supabasePropertiesTable: "property_items"
};
```

No se configura una contraseña administrativa en JavaScript. El portal y el CRM usan el mismo Supabase Auth, pero validan y almacenan sus sesiones del navegador de forma independiente.

## Modelo de permisos

- `anon`: puede leer solamente filas publicadas y los archivos promocionales del bucket público.
- `authenticated`: solo administra contenido si su `app_metadata.role` es `admin`.
- `service_role`: no se usa en el navegador ni se guarda en este repositorio.
- Storage: la lectura pública se limita al bucket de evidencias; subir, reemplazar y eliminar exige rol `admin` y una ruta prefijada por el `auth.uid()` actual.

`is_published=false` protege la fila mediante RLS, pero no vuelve privado el objeto de Storage. Este bucket se usa únicamente para material destinado a promoción pública. Nunca se cargan aquí contratos, identificaciones, comprobantes ni documentos internos de clientes.

El SQL de producción autodetecta el campo de publicación disponible en las tablas públicas y falla de forma cerrada si no existe. Revise el resultado de la migración antes de cargar datos reales.

## Flujo del portal

```text
Usuario autorizado
→ inicia sesión con Supabase Auth
→ crea o edita el registro
→ sube el archivo al bucket evidencias
→ marca el contenido como publicado
→ el sitio público puede leerlo
```

Si la escritura de la fila falla después de subir el archivo, el portal intenta limpiar el archivo huérfano. Aun así, conviene revisar Storage periódicamente.

## Verificación

- Un visitante sin sesión no puede insertar, actualizar ni eliminar filas u objetos.
- Un visitante solo ve contenido publicado.
- El operador entiende que todo archivo cargado al bucket `evidencias` es material público; un borrador solo queda fuera de los listados.
- El usuario autenticado puede subir y borrar su contenido desde el portal.
- El portal no contiene contraseñas, `service_role` ni claves `sb_secret_*`.
- Una URL de archivo no válida no se inserta en el DOM ni se usa para una petición.

La lista completa de publicación y recuperación está en `PRODUCTION-RUNBOOK.md`.
