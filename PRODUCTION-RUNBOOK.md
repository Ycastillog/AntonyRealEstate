# Runbook de producción — Antony Real Estate

Este documento cubre la publicación del sitio público, el portal de contenido y Antony Private Office en `https://antonyrealestate.com`.

## 1. Límites de seguridad

- El sitio público puede leer solamente contenido marcado como publicado.
- El portal y `/crm/` requieren una sesión válida de Supabase Auth.
- `media-config.js` contiene solamente la URL y la clave publicable (`anon`/publishable).
- Nunca se coloca en Git una clave `service_role`, `sb_secret_*`, contraseña, token personal o respaldo con datos reales.
- El registro público de usuarios permanece desactivado. Las cuentas se crean desde el panel seguro de Supabase.
- RLS y los `GRANT` de PostgreSQL son obligatorios aunque la interfaz también valide.
- El bucket `evidencias` contiene solo material promocional y es público por diseño. Un borrador oculta la fila del sitio, no convierte el archivo en privado. Contratos, identificaciones y comprobantes deben ir en un bucket privado separado.

## 2. Aprovisionar Supabase

1. Crear un proyecto nuevo y guardar la contraseña de base de datos en un gestor de contraseñas.
2. En SQL Editor, ejecutar `supabase-production-setup.sql` como una sola migración.
3. Confirmar que existen las tablas `crm_clients`, `crm_sales`, `crm_commission_installments`, `crm_payments` y `crm_audit_log`.
4. Confirmar que RLS está activa y que `anon` no tiene permisos de escritura.
5. En Authentication, desactivar nuevos registros públicos y crear el usuario de Antony.
6. En SQL Editor, concederle el rol de portal sustituyendo el correo del ejemplo:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
where lower(email) = lower('CORREO-AUTORIZADO');
```

7. Cerrar y volver a iniciar sesión para que el JWT incluya `app_metadata.role=admin`.
8. Configurar Site URL como `https://antonyrealestate.com/crm/` y permitir exactamente `https://antonyrealestate.com/crm/` como redirección.
9. En Storage, comprobar que el bucket `evidencias` es público para lectura; solo el rol `admin` puede escribir y únicamente dentro de su carpeta de usuario.

## 3. Conectar el frontend

Actualizar solamente estos campos de `media-config.js`:

```js
supabaseUrl: "https://ID-DEL-PROYECTO.supabase.co",
supabaseAnonKey: "CLAVE_PUBLICABLE",
```

La aplicación rechaza claves privadas y proyectos con URL no válida. Después del cambio:

```powershell
node --check media-config.js
node --check admin.js
node --check crm/backend.js
node --check crm/app.js
node --test crm/tests/*.test.mjs
git diff --check
```

## 4. Prueba de aceptación antes de publicar

Usar un usuario y datos ficticios:

1. El sitio público abre sin errores de consola y solo muestra registros publicados.
2. `/portal/` y `/crm/` rechazan a un visitante sin sesión.
3. Un usuario autenticado crea un cliente de prueba.
4. Crea una venta `Contratada` con dos cuotas que sumen exactamente la comisión.
5. Registra un cobro parcial y comprueba dashboard, bandeja, dossier y reporte.
6. Repite el mismo envío y confirma que no aparece un cobro duplicado.
7. Intenta un sobrepago, fecha futura y moneda distinta; los tres deben fallar.
8. Anula el cobro con motivo; debe quedar visible pero salir de los totales.
9. Confirma que otro usuario autenticado no puede leer ni cambiar esos registros.
10. Exporta CSV y un respaldo JSON; restaura el respaldo en un workspace vacío de prueba.
11. Ejecuta también `crm/tests/supabase-acceptance.sql` en SQL Editor. El resultado final debe ser `{"status":"passed","qa_rows_remaining":0}`.
12. Prueba teclado y diseño en 390 px, 768 px y escritorio.

## 5. Publicación

1. Revisar la diferencia completa y confirmar que no contiene datos o secretos reales.
2. Abrir un pull request hacia la rama que publica GitHub Pages.
3. Esperar el check `CRM CI / Node tests and syntax checks`; solo integrar cuando esté verde. Configurarlo como obligatorio en la protección de `master` cuando el plan de GitHub lo permita.
4. Verificar `https://antonyrealestate.com/`, `/portal/` y `/crm/` en una ventana sin sesión.
5. Iniciar sesión y repetir una prueba corta de cliente, venta, cuota y cobro.

## 6. Operación y recuperación

- Activar backups automáticos y Point-in-Time Recovery según el plan contratado de Supabase.
- Descargar un respaldo JSON operativo con frecuencia definida por el cliente; guardarlo cifrado fuera del repositorio.
- Revisar periódicamente el crecimiento de `crm_audit_log` y definir retención.
- Rotar inmediatamente credenciales si una clave privada o contraseña llega a Git, un chat o una captura pública.
- La contraseña administrativa histórica del frontend ya está revocada por diseño y nunca debe reutilizarse.
- La cuenta autenticada puede cambiar su contraseña desde **Sistema → Cambiar contraseña** sin depender de un enlace de invitación.
- Para corregir un cobro, anularlo con motivo y registrar uno nuevo; nunca editar la base directamente.
- Un respaldo de nube solo se restaura en un workspace vacío; nunca se usa para sobrescribir movimientos financieros existentes.
- Antes de restaurar, probar el respaldo en un proyecto separado y documentar fecha, responsable y resultado.

## 7. Criterio de listo

La publicación se considera completa únicamente cuando la migración real, el usuario de Auth, las pruebas de aislamiento entre usuarios, el workflow de GitHub Pages y la verificación en el dominio hayan pasado.
