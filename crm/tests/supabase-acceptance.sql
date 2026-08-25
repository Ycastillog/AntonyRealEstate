-- Antony Real Estate CRM: prueba de aceptacion contra un proyecto Supabase real.
--
-- Requisitos:
--   1. Ejecutar supabase-production-setup.sql.
--   2. Tener al menos un usuario con app_metadata.role = "admin".
--
-- La prueba usa una transaccion y siempre revierte sus datos ficticios. Cualquier
-- contrato roto provoca una excepcion y evita el resultado final "passed".

begin;

select set_config(
  'qa.owner_id',
  coalesce(
    (
      select id::text
      from auth.users
      where raw_app_meta_data ->> 'role' = 'admin'
      order by created_at
      limit 1
    ),
    ''
  ),
  true
);

select set_config(
  'qa.owner_email',
  coalesce(
    (
      select email
      from auth.users
      where id::text = current_setting('qa.owner_id', true)
      limit 1
    ),
    ''
  ),
  true
);

do $qa_preflight$
begin
  if nullif(current_setting('qa.owner_id', true), '') is null then
    raise exception 'QA requiere un usuario con app_metadata.role = admin';
  end if;
end
$qa_preflight$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('qa.owner_id', true),
    'role', 'authenticated',
    'email', current_setting('qa.owner_email', true),
    'app_metadata', jsonb_build_object('role', 'admin')
  )::text,
  true
);

set local role authenticated;

insert into public.crm_clients (
  id,
  name,
  email,
  source,
  stage,
  desired_zone,
  budget,
  budget_currency,
  captured_at,
  notes
)
values (
  'qa-e2e-client',
  'Cliente QA transaccional',
  'qa-antony@example.test',
  'Prueba de produccion',
  'Nuevo',
  'Santo Domingo',
  3000000,
  'DOP',
  clock_timestamp(),
  'Se revierte al terminar la prueba'
);

select public.crm_save_sale(
  jsonb_build_object(
    'id', 'qa-e2e-sale',
    'client_id', 'qa-e2e-client',
    'project', 'Proyecto QA transaccional',
    'unit', 'QA-01',
    'developer', 'Antony Real Estate QA',
    'status', 'Contratada',
    'sale_price', 3000000,
    'sale_currency', 'DOP',
    'sale_date', current_date,
    'commission_rate', 5,
    'commission_amount', 150000,
    'commission_currency', 'DOP',
    'notes', 'Prueba de aceptacion; no es una venta real'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-e2e-installment-1',
      'sale_id', 'qa-e2e-sale',
      'label', 'Cuota 1',
      'sequence', 1,
      'amount', 75000,
      'due_date', current_date
    ),
    jsonb_build_object(
      'id', 'qa-e2e-installment-2',
      'sale_id', 'qa-e2e-sale',
      'label', 'Cuota 2',
      'sequence', 2,
      'amount', 75000,
      'due_date', current_date + 30
    )
  )
);

select public.crm_record_payment(
  jsonb_build_object(
    'id', 'qa-e2e-payment-1',
    'sale_id', 'qa-e2e-sale',
    'installment_id', 'qa-e2e-installment-1',
    'amount', 50000,
    'currency', 'DOP',
    'payment_date', current_date,
    'method', 'Transferencia',
    'reference', 'QA-E2E-REF-001',
    'status', 'Contabilizado',
    'notes', 'Cobro QA transaccional'
  )
);

-- El mismo ID y payload debe ser idempotente, sin duplicar el cobro.
select public.crm_record_payment(
  jsonb_build_object(
    'id', 'qa-e2e-payment-1',
    'sale_id', 'qa-e2e-sale',
    'installment_id', 'qa-e2e-installment-1',
    'amount', 50000,
    'currency', 'DOP',
    'payment_date', current_date,
    'method', 'Transferencia',
    'reference', 'QA-E2E-REF-001',
    'status', 'Contabilizado',
    'notes', 'Cobro QA transaccional'
  )
);

do $qa_financial_contracts$
declare
  v_rejected boolean;
begin
  if (
    select count(*)
    from public.crm_payments
    where id = 'qa-e2e-payment-1'
      and status = 'Contabilizado'
  ) <> 1 then
    raise exception 'QA fallo: el cobro idempotente fue duplicado';
  end if;

  if not exists (
    select 1
    from public.crm_workspace_health()
    where sale_id = 'qa-e2e-sale'
      and sale_status = 'Contratada'
      and commission_amount = 150000
      and planned_amount = 150000
      and accounted_amount = 50000
      and remaining_to_collect = 100000
      and plan_matches is true
      and is_overpaid is false
  ) then
    raise exception 'QA fallo: el resumen financiero no coincide';
  end if;

  v_rejected := false;
  begin
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-overpay',
        'sale_id', 'qa-e2e-sale',
        'installment_id', 'qa-e2e-installment-1',
        'amount', 100001,
        'currency', 'DOP',
        'payment_date', current_date,
        'method', 'Transferencia',
        'reference', 'QA-E2E-OVERPAY',
        'status', 'Contabilizado'
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el backend acepto un sobrepago';
  end if;

  v_rejected := false;
  begin
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-nan',
        'sale_id', 'qa-e2e-sale',
        'installment_id', 'qa-e2e-installment-1',
        'amount', 'NaN',
        'currency', 'DOP',
        'payment_date', current_date,
        'method', 'Transferencia',
        'reference', 'QA-E2E-NAN',
        'status', 'Contabilizado'
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el backend acepto amount="NaN"';
  end if;

  v_rejected := false;
  begin
    perform public.crm_save_sale(
      jsonb_build_object(
        'id', 'qa-e2e-sale',
        'client_id', 'qa-e2e-client',
        'project', 'Proyecto QA transaccional',
        'unit', 'QA-01',
        'developer', 'Antony Real Estate QA',
        'status', 'Contratada',
        'sale_price', 3000000,
        'sale_currency', 'DOP',
        'sale_date', current_date,
        'commission_rate', 5,
        'commission_amount', 150000,
        'commission_currency', 'DOP'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-installment-1',
          'sale_id', 'qa-e2e-sale',
          'label', 'Cuota 1 alterada',
          'sequence', 1,
          'amount', 70000,
          'due_date', current_date
        ),
        jsonb_build_object(
          'id', 'qa-e2e-installment-2',
          'sale_id', 'qa-e2e-sale',
          'label', 'Cuota 2 alterada',
          'sequence', 2,
          'amount', 80000,
          'due_date', current_date + 30
        )
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el plan cambio despues de contabilizar un cobro';
  end if;

  v_rejected := false;
  begin
    insert into public.crm_payments (
      id, sale_id, amount, currency, payment_date, method, reference
    ) values (
      'qa-direct-write', 'qa-e2e-sale', 1, 'DOP', current_date,
      'Transferencia', 'QA-DIRECT-WRITE'
    );
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: authenticated pudo escribir directamente en crm_payments';
  end if;
end
$qa_financial_contracts$;

-- Un segundo JWT no debe ver los datos del primer propietario.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'user')
  )::text,
  true
);

do $qa_rls_isolation$
declare
  v_rejected boolean := false;
begin
  if exists (
    select 1 from public.crm_clients where id = 'qa-e2e-client'
  ) then
    raise exception 'QA fallo: RLS expuso el cliente a otro usuario';
  end if;

  begin
    insert into public.evidence_items (
      id, title, category, media_type, media_url, is_published
    ) values (
      'qa-non-admin-write', 'QA no admin', 'QA', 'image',
      'https://example.test/qa.jpg', false
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: un usuario sin rol admin escribio contenido publico';
  end if;
end
$qa_rls_isolation$;

-- Restaurar el JWT administrador y verificar el portal privado.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('qa.owner_id', true),
    'role', 'authenticated',
    'email', current_setting('qa.owner_email', true),
    'app_metadata', jsonb_build_object('role', 'admin')
  )::text,
  true
);

insert into public.evidence_items (
  id, title, category, media_type, media_url, is_published
)
values (
  'qa-admin-content', 'QA administrador', 'QA', 'image',
  'https://example.test/qa.jpg', false
);

select public.crm_void_payment(
  'qa-e2e-payment-1',
  'Anulacion de la prueba transaccional'
);

do $qa_final_contracts$
begin
  if not exists (
    select 1
    from public.crm_payments
    where id = 'qa-e2e-payment-1'
      and status = 'Anulado'
      and nullif(btrim(void_reason), '') is not null
      and voided_at is not null
  ) then
    raise exception 'QA fallo: la anulacion no conservo la trazabilidad';
  end if;

  if (
    select count(*)
    from public.crm_audit_log
    where record_id in ('qa-e2e-client', 'qa-e2e-sale', 'qa-e2e-payment-1')
  ) < 5 then
    raise exception 'QA fallo: la bitacora no registro todos los cambios';
  end if;
end
$qa_final_contracts$;

-- Un visitante anonimo no puede leer contenido aun no publicado.
reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon')::text,
  true
);
set local role anon;

select set_config(
  'qa.anon_hidden',
  (not exists (
    select 1 from public.evidence_items where id = 'qa-admin-content'
  ))::text,
  true
);

reset role;

-- Si RLS expusiera el borrador, el divisor sería cero y toda la prueba fallaría.
select 1 / (
  current_setting('qa.anon_hidden', true) = 'true'
)::integer as qa_public_read_passed;

rollback;

select jsonb_build_object(
  'status', 'passed',
  'qa_rows_remaining',
  (
    select
      (select count(*) from public.crm_clients where id like 'qa-%')
      + (select count(*) from public.crm_sales where id like 'qa-%')
      + (select count(*) from public.crm_payments where id like 'qa-%')
      + (select count(*) from public.evidence_items where id like 'qa-%')
  )
) as acceptance_result;
