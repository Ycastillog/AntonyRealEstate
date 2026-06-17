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

## Importante

Esta version funciona como V1 comercial estatica en GitHub Pages. La pagina publica muestra marca personal, evidencia real, propiedades destacadas, inventario visual por zona y enlaces directos para solicitar asesoria.

El portal permite preparar contenido, pero la publicacion permanente de fotos, videos y propiedades nuevas requiere una base de datos y almacenamiento en la nube.

## WhatsApp

El numero se configura una sola vez en `contact.js`, en formato internacional, por ejemplo:

```js
window.ANTONY_WHATSAPP_NUMBER = "18090000000";
```

Mientras esta vacio, los botones abren WhatsApp con el mensaje preparado para que el usuario elija a quien enviarlo.

## Siguiente fase

Ver `BACKEND-NEXT-STEPS.md` para convertir esta pagina estatica en una herramienta real con base de datos, panel administrativo, storage de fotos/videos, analytics y dominio propio.

Ver `CLIENT-PROPOSAL.md` para una estructura de venta por fases y rangos sugeridos de precio.
