# Antony Real Estate

Pagina web personal para organizar apartamentos listos y proyectos, cargar fotos desde el navegador y copiar enlaces directos a cada propiedad.

Marca visual integrada:

```text
assets/antony-fulgencio-logo.png
assets/antony-fulgencio-logo-transparent.png
assets/antony-instagram-profile.jpg
```

Incluye enlace al perfil de Instagram:

```text
https://www.instagram.com/antony.tucasard
```

## Abrir en esta computadora

Desde esta carpeta:

```powershell
C:\Users\Yeica\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 4173
```

Luego abre:

```text
http://127.0.0.1:4173
```

## Sitio y oficina privada

La pagina publica funciona en GitHub Pages con el dominio `antonyrealestate.com`. El repositorio también incluye:

- `/portal/`: administración autenticada de propiedades y evidencias.
- `/crm/`: Antony Private Office para clientes, ventas, cuotas de comisión, cobros y reportes.
- `supabase-production-setup.sql`: migración de PostgreSQL, Storage, RLS, auditoría y operaciones transaccionales.

En localhost el CRM usa por defecto datos ficticios del navegador. El backend de producción ya está aprovisionado en Supabase; en el dominio solo entra una cuenta autorizada mediante Supabase Auth. La operación y los respaldos se rigen por `PRODUCTION-RUNBOOK.md`.

## WhatsApp

El numero se configura una sola vez en `contact.js`, en formato internacional:

```js
window.ANTONY_WHATSAPP_NUMBER = "18299104940";
```

Todos los botones de WhatsApp usan ese numero y preparan el mensaje segun el contexto.

## Producción

Ver `PRODUCTION-RUNBOOK.md` para aprovisionar Supabase, ejecutar las pruebas de aceptación, publicar y operar el sistema.

Ver `CLIENT-PROPOSAL.md` para la estructura comercial por fases.
