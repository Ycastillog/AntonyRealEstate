# Siguiente fase tecnica

La pagina actual es estatica y publica en GitHub Pages. Para que funcione como herramienta real con datos compartidos entre todos los visitantes, hace falta conectar servicios externos.

## Requerido para produccion

1. Base de datos
   - Supabase, Firebase o similar.
   - Guardar propiedades, clientes, estados, testimonios y unidades entregadas.

2. Almacenamiento de fotos y videos
   - Supabase Storage, Firebase Storage, Cloudinary o S3.
   - Evita guardar videos pesados en el navegador.

3. Panel administrativo real
   - Login con usuario y contrasena.
   - Roles para editar propiedades, subir fotos, subir videos y cambiar estados.

4. Formularios reales
   - Guardar leads en base de datos.
   - Enviar notificacion por email o WhatsApp Business.

5. WhatsApp Business
   - Colocar numero real en `WHATSAPP_NUMBER`.
   - Para mensajes automatizados se necesita API oficial o proveedor.

6. Dominio
   - Comprar dominio tipo `antonyfulgencio.com`.
   - Apuntarlo a GitHub Pages o a un hosting con backend.

7. Analytics
   - Google Analytics, Plausible o Meta Pixel.
   - Medir visitas, clics en WhatsApp, propiedades vistas y formularios iniciados.

## Datos reales que faltan

- Numero oficial de WhatsApp.
- Fotos reales de entregas.
- Videos reales o reels descargados/autorizados.
- Testimonios reales con nombre o captura.
- Propiedades reales con precio, estado, metraje, ubicacion y multimedia.
- Dominio final.
