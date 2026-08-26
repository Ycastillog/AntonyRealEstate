# Estado del backend y próximos pasos

## Estado de producción — 25 de agosto de 2026

El backend de producción está aprovisionado en Supabase y conectado al frontend:

- Proyecto `antony-real-estate-production` (`jwbhzunfgaqvdthvruma`) activo.
- Supabase Auth con registro público y usuarios anónimos desactivados.
- Cuenta administrativa confirmada con `app_metadata.role=admin`.
- PostgreSQL con clientes, ventas, cuotas, cobros y auditoría.
- RLS por propietario, permisos mínimos y RPC transaccionales.
- Catálogo cerrado de Constructora LVP con sus 14 proyectos autorizados.
- Plan estructural `Pago único` o `Avance` + `Saldo`; el saldo solo se cobra después de la fecha real de entrega.
- Migración `supabase-production-setup.sql` ejecutada y reejecutada sin errores el 25 de agosto de 2026.
- Prueba real `crm/tests/supabase-acceptance.sql` aprobada con `{"status":"passed","qa_rows_remaining":0}`.
- 47/47 pruebas automatizadas aprobadas.
- URL y clave publicable configuradas en `media-config.js`; no hay claves privadas en el navegador.

La contraseña antigua que existió en el historial de Git se considera pública y no se reutilizó para Supabase. El acceso actual depende exclusivamente de Supabase Auth.

## Operación pendiente después del lanzamiento

1. Cambiar la contraseña temporal desde **Sistema → Cambiar contraseña**.
2. Definir frecuencia, responsable y ubicación cifrada de los respaldos JSON.
3. Activar y comprobar la política de backups/PITR disponible en el plan de Supabase.
4. Revisar trimestralmente usuarios, auditoría, políticas RLS y dependencias del frontend.

## Fases opcionales posteriores

- Notificaciones automáticas de vencimientos por correo o WhatsApp Business.
- Entidades maestras editables si en el futuro se incorporan nuevas constructoras, proyectos o inventario de unidades.
- Adjuntos privados de contratos y comprobantes en un bucket separado y no público.
- Roles adicionales si se incorporan asistentes o vendedores.
- Analytics de visitas y conversiones del sitio público.

No son requisitos para el primer lanzamiento funcional del CRM. El proceso exacto está en `PRODUCTION-RUNBOOK.md`.
