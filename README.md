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

Esta primera version guarda las propiedades en el navegador usando `localStorage`. Sirve para organizar y probar el catalogo en tu computadora.

Para mandar un link a clientes donde ellos vean las propiedades y fotos subidas desde cualquier telefono, el siguiente paso es publicar la pagina con una base de datos y almacenamiento de imagenes.

## WhatsApp

En `app.js`, la constante `WHATSAPP_NUMBER` esta vacia para no inventar un numero. Cuando tengas el numero de Antony, colocarlo en formato internacional, por ejemplo:

```js
const WHATSAPP_NUMBER = "18090000000";
```

Mientras esta vacio, los botones abren WhatsApp con el mensaje preparado para que el usuario elija a quien enviarlo.

## Siguiente fase

Ver `BACKEND-NEXT-STEPS.md` para convertir esta pagina estatica en una herramienta real con base de datos, panel administrativo, storage de fotos/videos, analytics y dominio propio.

Ver `CLIENT-PROPOSAL.md` para una estructura de venta por fases y rangos sugeridos de precio.
