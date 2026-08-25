# Antony Private Office

CRM privado para gestionar la operación comercial de Antony Real Estate: clientes, ventas, planes de cobro de comisión, cobros recibidos y reportes.

## Qué resuelve

- Registra cada cliente con fecha de captación, contacto, origen, etapa, zona y presupuesto.
- Registra cada venta con cliente, proyecto, unidad, desarrolladora, precio, moneda, fecha y estado.
- Separa el precio vendido de la comisión acordada.
- Divide una comisión en una o varias cuotas con fecha de vencimiento.
- Muestra lo cobrado, lo pendiente, lo vencido y el próximo cobro.
- Conserva los cobros anulados y el motivo; no borra la historia financiera.
- Calcula clientes nuevos por período, ventas por año, ventas totales y comisiones por moneda.
- Exporta ventas y cobros a CSV y permite respaldos JSON validados; en nube la restauración exige un workspace vacío.

## Modos de ejecución

En `localhost`, el CRM abre en modo demostración y guarda solamente datos ficticios en el navegador:

```text
http://localhost:4173/crm/
```

Para probar el acceso a la nube desde localhost:

```text
http://localhost:4173/crm/?cloud=1
```

En `https://antonyrealestate.com/crm/` siempre se usa Supabase. Los datos comerciales nunca se guardan en `localStorage` en producción.

## Arquitectura de producción

- GitHub Pages sirve el sitio público y la interfaz estática del CRM.
- Supabase Auth controla las sesiones por correo y contraseña.
- PostgreSQL guarda clientes, ventas, cuotas, cobros y auditoría.
- Row Level Security aísla los registros por `auth.uid()`.
- Las ventas, planes de cuotas y cobros se escriben mediante RPC transaccionales.
- Supabase Storage guarda material promocional público; solamente administradores autenticados pueden modificar archivos. Los adjuntos privados requieren otro bucket.
- La clave publicable de Supabase puede vivir en el frontend. Nunca se publica una `service_role`, una clave secreta ni una contraseña.

El esquema completo está en `../supabase-production-setup.sql`.

## Reglas financieras

- USD y DOP se presentan por separado; no se convierten ni consolidan automáticamente.
- Una venta cuenta como cerrada cuando está `Contratada` o `Entregada`.
- Una venta `Reservada` no admite cobros de comisión.
- La suma del plan de cuotas debe coincidir exactamente con la comisión.
- Un cobro no puede ser futuro, anterior a la venta, usar otra moneda ni exceder el saldo.
- Los reintentos del mismo cobro son idempotentes para evitar duplicados.
- Un cobro contabilizado no se edita ni elimina: se anula con motivo y se registra uno nuevo.
- Una venta con cobros activos no se puede cancelar hasta anularlos.
- En producción, las operaciones se conservan para auditoría; se cancelan en vez de borrarse.

## Puesta en producción

1. Ejecutar `supabase-production-setup.sql` completo en SQL Editor.
2. Crear en Supabase Auth cada usuario autorizado y mantener desactivado el registro público.
3. Configurar Auth con `https://antonyrealestate.com/crm/` como Site URL y redirección permitida.
4. Ejecutar `crm/tests/supabase-acceptance.sql` y confirmar rollback limpio.
5. Abrir un pull request, esperar `CRM CI` en verde y solo entonces integrar en `master`.
6. Verificar el dominio real y cambiar la contraseña desde **Sistema → Cambiar contraseña**.

## Verificación local

```powershell
node --check crm/app.js
node --check crm/backend.js
node --test crm/tests/*.test.mjs
```

El pipeline `.github/workflows/crm-ci.yml` repite las comprobaciones críticas en cada push y pull request. El proceso de publicación exige no integrar el pull request hasta que ese check esté verde.
