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

do $qa_historical_import$
declare
  v_first jsonb;
  v_second jsonb;
  v_contact_result jsonb;
  v_historical_id text;
  v_rejected boolean := false;
  v_batch jsonb := jsonb_build_object(
    'id', 'qa-client-supplied-batch-id-is-ignored',
    'source_name', 'qa-historical-source.tsv',
    'source_sha256', repeat('a', 64),
    'source_row_count', 1
  );
  v_rows jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-client-supplied-row-id-is-ignored',
      'source_row', 1,
      'developer', '  CONSTRUCTORA   lvp ',
      'project', '  rIVIera   3 ',
      'unit', ' QA-HIST-01 ',
      'sale_date', (current_date - 100)::text,
      'sale_price', 100000,
      'sale_currency', 'usd',
      'seller_name', 'Vendedor QA',
      'buyer_name', 'Comprador histórico QA',
      'review_status', 'Por completar',
      'source_snapshot', jsonb_build_object(
        'project', 'rIVIera   3',
        'unit', 'QA-HIST-01'
      )
    )
  );
begin
  v_first := public.crm_import_historical_sales(v_batch, v_rows);
  v_second := public.crm_import_historical_sales(v_batch, v_rows);

  if (v_first ->> 'imported')::integer <> 1
     or (v_first ->> 'alreadyImported')::boolean
     or (v_second ->> 'imported')::integer <> 0
     or (v_second ->> 'skipped')::integer <> 1
     or not (v_second ->> 'alreadyImported')::boolean
     or (v_first ->> 'batchId') is distinct from (v_second ->> 'batchId') then
    raise exception 'QA fallo: la importación histórica no fue idempotente';
  end if;

  if not exists (
    select 1
    from public.crm_historical_sales
    where batch_id = (v_first ->> 'batchId')
      and project = 'Riviera 3'
      and developer = 'Constructora LVP'
      and unit = 'QA-HIST-01'
      and sale_currency = 'USD'
      and review_status = 'Por completar'
      and buyer_phone is null
      and buyer_email is null
      and delivery_date is null
      and commission_amount is null
      and payments_confirmed is false
  ) then
    raise exception 'QA fallo: staging histórico inventó datos o no canonizó LVP';
  end if;

  select id
    into v_historical_id
  from public.crm_historical_sales
  where batch_id = (v_first ->> 'batchId')
    and unit = 'QA-HIST-01';

  v_contact_result := public.crm_enrich_historical_contacts(
    jsonb_build_array(jsonb_build_object(
      'id', v_historical_id,
      'buyer_phone', '8095550188',
      'buyer_email', 'historico-qa@example.test'
    ))
  );
  if (v_contact_result ->> 'updated')::integer <> 1
     or (v_contact_result ->> 'phonesFilled')::integer <> 1
     or (v_contact_result ->> 'emailsFilled')::integer <> 1 then
    raise exception 'QA fallo: el enriquecimiento histórico no completó el contacto';
  end if;

  v_contact_result := public.crm_enrich_historical_contacts(
    jsonb_build_array(jsonb_build_object(
      'id', v_historical_id,
      'buyer_phone', '8095559999',
      'buyer_email', 'no-reemplazar@example.test'
    ))
  );
  if (v_contact_result ->> 'updated')::integer <> 0
     or not exists (
       select 1
       from public.crm_historical_sales
       where id = v_historical_id
         and buyer_phone = '8095550188'
         and buyer_email = 'historico-qa@example.test'
     ) then
    raise exception 'QA fallo: el enriquecimiento reemplazó un contacto existente';
  end if;

  perform public.crm_update_historical_contact(jsonb_build_object(
    'id', v_historical_id,
    'buyer_name', 'Comprador histórico QA corregido',
    'buyer_phone', null,
    'buyer_email', null
  ));
  if not exists (
    select 1
    from public.crm_historical_sales
    where id = v_historical_id
      and buyer_name = 'Comprador histórico QA corregido'
      and buyer_phone is null
      and buyer_email is null
      and review_status = 'Por completar'
  ) then
    raise exception 'QA fallo: la edición histórica no permite contacto pendiente';
  end if;

  begin
    perform public.crm_import_historical_sales(
      jsonb_build_object(
        'source_name', 'qa-historical-duplicate.tsv',
        'source_sha256', repeat('b', 64),
        'source_row_count', 1
      ),
      v_rows
    );
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: se aceptó un duplicado de staging histórico';
  end if;
  if exists (
    select 1
    from public.crm_historical_import_batches
    where source_sha256 = repeat('b', 64)
  ) then
    raise exception 'QA fallo: el lote duplicado no se revirtió atómicamente';
  end if;

  v_rejected := false;
  begin
    insert into public.crm_historical_import_batches (
      id, source_name, source_sha256, source_row_count
    ) values (
      'qa-direct-historical-batch', 'qa-direct.tsv', repeat('d', 64), 1
    );
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: authenticated pudo escribir directamente en staging histórico';
  end if;
end
$qa_historical_import$;

insert into public.crm_clients (
  id,
  name,
  phone,
  email,
  source,
  stage,
  desired_zone,
  property_stage,
  budget,
  budget_currency,
  captured_at,
  notes
)
values (
  'qa-e2e-client',
  'Cliente QA transaccional',
  '8095550199',
  'qa-antony@example.test',
  'Prueba de produccion',
  'Nuevo',
  'Santo Domingo Este',
  'En planos / En construcción',
  3000000,
  'DOP',
  clock_timestamp(),
  'Se revierte al terminar la prueba'
);

select public.crm_save_sale(
  jsonb_build_object(
    'id', 'qa-e2e-sale',
    'client_id', 'qa-e2e-client',
    'project', 'Riviera 2',
    'unit', 'QA-01',
    'developer', 'Constructora LVP',
    'status', 'Opción a compra firmada',
    'sale_price', 3000000,
    'sale_currency', 'DOP',
    'sale_date', current_date,
    'delivery_date', current_date + 180,
    'shared_sale', true,
    'external_agent', 'Broker QA transaccional',
    'commission_rate', 5,
    'commission_amount', 150000,
    'commission_currency', 'DOP',
    'notes', 'Prueba de aceptacion; no es una venta real'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-e2e-installment-1',
      'sale_id', 'qa-e2e-sale',
      'label', 'Inicial personalizada',
      'installmentKind', 'advance',
      'sequence', 1,
      'amount', 12000,
      'due_date', current_date
    ),
    jsonb_build_object(
      'id', 'qa-e2e-installment-2',
      'sale_id', 'qa-e2e-sale',
      -- Etiqueta deliberadamente engañosa: nunca debe autorizar esta cuota.
      'label', 'Avance 100%',
      'installmentKind', 'balance',
      'sequence', 2,
      'amount', 138000,
      'due_date', current_date + 30
    )
  )
);

select public.crm_record_payment(
  jsonb_build_object(
    'id', 'qa-e2e-payment-1',
    'sale_id', 'qa-e2e-sale',
    'installment_id', 'qa-e2e-installment-1',
    'amount', 10000,
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
    'amount', 10000,
    'currency', 'DOP',
    'payment_date', current_date,
    'method', 'Transferencia',
    'reference', 'QA-E2E-REF-001',
    'status', 'Contabilizado',
    'notes', 'Cobro QA transaccional'
  )
);

-- Después de cobrar parte del advance, delivery_date y el vencimiento de balance
-- siguen siendo reprogramables mientras balance no tenga cobros.
select public.crm_save_sale(
  jsonb_build_object(
    'id', 'qa-e2e-sale',
    'client_id', 'qa-e2e-client',
    'project', 'Riviera 2',
    'unit', 'QA-01',
    'developer', 'Constructora LVP',
    'status', 'Opción a compra firmada',
    'sale_price', 3000000,
    'sale_currency', 'DOP',
    'sale_date', current_date,
    'delivery_date', current_date + 210,
    'shared_sale', true,
    'external_agent', 'Broker QA transaccional',
    'commission_rate', 5,
    'commission_amount', 150000,
    'commission_currency', 'DOP',
    'notes', 'Prueba de aceptacion; no es una venta real'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-e2e-installment-1',
      'sale_id', 'qa-e2e-sale',
      'label', 'Texto no autoritativo',
      'installmentKind', 'advance',
      'sequence', 1,
      'amount', 12000,
      'due_date', current_date
    ),
    jsonb_build_object(
      'id', 'qa-e2e-installment-2',
      'sale_id', 'qa-e2e-sale',
      'label', 'Avance 100%',
      'installmentKind', 'balance',
      'sequence', 2,
      'amount', 138000,
      'due_date', current_date + 210
    )
  )
);

-- Pago único es una forma estructural válida y cobrable desde Opción.
select public.crm_save_sale(
  jsonb_build_object(
    'id', 'qa-e2e-single-sale',
    'client_id', 'qa-e2e-client',
    'project', 'Riviera 3',
    'unit', 'QA-SINGLE',
    'developer', 'Constructora LVP',
    'status', 'Opción a compra firmada',
    'sale_price', 100000,
    'sale_currency', 'DOP',
    'sale_date', current_date,
    'commission_rate', 5,
    'commission_amount', 5000,
    'commission_currency', 'DOP'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-e2e-single-installment',
      'sale_id', 'qa-e2e-single-sale',
      'label', 'Etiqueta falsa de saldo',
      'installmentKind', 'single',
      'sequence', 1,
      'amount', 5000,
      'due_date', current_date
    )
  )
);

do $qa_historical_active_duplicate$
declare
  v_rejected boolean := false;
begin
  begin
    perform public.crm_import_historical_sales(
      jsonb_build_object(
        'source_name', 'qa-historical-active-duplicate.tsv',
        'source_sha256', repeat('c', 64),
        'source_row_count', 1
      ),
      jsonb_build_array(
        jsonb_build_object(
          'source_row', 1,
          'developer', 'Constructora LVP',
          'project', 'Riviera 2',
          'unit', 'QA-01',
          'sale_date', current_date::text,
          'sale_price', 3000000,
          'sale_currency', 'DOP',
          'seller_name', 'Vendedor QA',
          'buyer_name', 'Comprador QA',
          'source_snapshot', jsonb_build_object('unit', 'QA-01')
        )
      )
    );
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: se aceptó un duplicado contra venta operativa';
  end if;
  if exists (
    select 1
    from public.crm_historical_import_batches
    where source_sha256 = repeat('c', 64)
  ) then
    raise exception 'QA fallo: el lote contra venta activa no se revirtió';
  end if;
end
$qa_historical_active_duplicate$;

select public.crm_record_payment(
  jsonb_build_object(
    'id', 'qa-e2e-single-payment',
    'sale_id', 'qa-e2e-single-sale',
    'installment_id', 'qa-e2e-single-installment',
    'amount', 5000,
    'currency', 'DOP',
    'payment_date', current_date,
    'method', 'Transferencia',
    'reference', 'QA-E2E-SINGLE-PAID',
    'status', 'Contabilizado'
  )
);

-- Fuerza la ejecución de los constraint triggers diferidos dentro de esta
-- transacción, que terminará en ROLLBACK.
set constraints all immediate;

do $qa_financial_contracts$
declare
  v_rejected boolean;
begin
  if not exists (
    select 1
    from public.crm_sales as s
    join public.crm_clients as c
      on c.owner_id = s.owner_id and c.id = s.client_id
    where s.id = 'qa-e2e-sale'
      and c.desired_zone = 'Santo Domingo Este'
      and c.property_stage = 'En planos / En construcción'
      and s.project = 'Riviera 2'
      and s.developer = 'Constructora LVP'
      and s.delivery_date = current_date + 210
      and s.shared_sale is true
      and s.external_agent = 'Broker QA transaccional'
  ) then
    raise exception 'QA fallo: los campos de retroalimentacion no se conservaron';
  end if;

  if not exists (
    select 1
    from public.crm_commission_installments
    where sale_id = 'qa-e2e-sale'
    group by sale_id
    having count(*) = 2
      and count(*) filter (
        where sequence = 1
          and installment_kind = 'advance'
          and label = 'Avance'
      ) = 1
      and count(*) filter (
        where sequence = 2
          and installment_kind = 'balance'
          and label = 'Saldo'
          and due_date = current_date + 210
      ) = 1
      and sum(amount) = 150000
  ) then
    raise exception 'QA fallo: kind/label/fechas del plan no quedaron canónicos';
  end if;

  if not exists (
    select 1
    from public.crm_commission_installments as i
    join public.crm_payments as p
      on p.owner_id = i.owner_id
     and p.sale_id = i.sale_id
     and p.installment_id = i.id
    where i.id = 'qa-e2e-single-installment'
      and i.installment_kind = 'single'
      and i.label = 'Pago único'
      and p.id = 'qa-e2e-single-payment'
      and p.status = 'Contabilizado'
  ) then
    raise exception 'QA fallo: single no fue canónico/cobrable desde Opción';
  end if;

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
      and sale_status = 'Opción a compra firmada'
      and commission_amount = 150000
      and planned_amount = 150000
      and accounted_amount = 10000
      and remaining_to_collect = 140000
      and plan_matches is true
      and is_overpaid is false
  ) then
    raise exception 'QA fallo: el resumen financiero no coincide';
  end if;

  -- Ataque: una sola cuota advance por 100% no equivale a single.
  v_rejected := false;
  begin
    perform public.crm_save_sale(
      jsonb_build_object(
        'id', 'qa-e2e-advance-100-sale',
        'client_id', 'qa-e2e-client',
        'project', 'Riviera 2',
        'unit', 'QA-ADVANCE-100',
        'developer', 'Constructora LVP',
        'status', 'Opción a compra firmada',
        'sale_price', 3000000,
        'sale_currency', 'DOP',
        'sale_date', current_date,
        'commission_rate', 5,
        'commission_amount', 150000,
        'commission_currency', 'DOP'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-advance-100-installment',
          'sale_id', 'qa-e2e-advance-100-sale',
          'label', 'Avance 100%',
          'installmentKind', 'advance',
          'sequence', 1,
          'amount', 150000,
          'due_date', current_date
        )
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el backend acepto advance como plan único del 100%%';
  end if;

  -- Ataque: label="Avance 100%" no habilita una cuota kind=balance.
  v_rejected := false;
  begin
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-balance-before-delivery',
        'sale_id', 'qa-e2e-sale',
        'installment_id', 'qa-e2e-installment-2',
        'amount', 1,
        'currency', 'DOP',
        'payment_date', current_date,
        'method', 'Transferencia',
        'reference', 'QA-E2E-BALANCE-EARLY',
        'status', 'Contabilizado'
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: balance se cobro antes de Entregado';
  end if;

  -- Ataque: incluso en Entregado, el saldo no puede fecharse antes de la entrega.
  v_rejected := false;
  begin
    perform public.crm_save_sale(
      jsonb_build_object(
        'id', 'qa-e2e-retro-balance-sale',
        'client_id', 'qa-e2e-client',
        'project', 'Riviera 4',
        'unit', 'QA-RETRO-BALANCE',
        'developer', 'Constructora LVP',
        'status', 'Entregado',
        'sale_price', 100000,
        'sale_currency', 'DOP',
        'sale_date', current_date - 10,
        'delivery_date', current_date,
        'commission_rate', 5,
        'commission_amount', 5000,
        'commission_currency', 'DOP'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-retro-advance',
          'sale_id', 'qa-e2e-retro-balance-sale',
          'label', 'Avance',
          'installmentKind', 'advance',
          'sequence', 1,
          'amount', 1000,
          'due_date', current_date - 10
        ),
        jsonb_build_object(
          'id', 'qa-e2e-retro-balance',
          'sale_id', 'qa-e2e-retro-balance-sale',
          'label', 'Saldo',
          'installmentKind', 'balance',
          'sequence', 2,
          'amount', 4000,
          'due_date', current_date
        )
      )
    );
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-retro-balance-payment',
        'sale_id', 'qa-e2e-retro-balance-sale',
        'installment_id', 'qa-e2e-retro-balance',
        'amount', 1,
        'currency', 'DOP',
        'payment_date', current_date - 1,
        'method', 'Transferencia',
        'reference', 'QA-E2E-RETRO-BALANCE',
        'status', 'Contabilizado'
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el saldo acepto payment_date anterior a delivery_date';
  end if;

  -- Ataque: el backend no admite constructoras/proyectos fuera del catálogo visible.
  v_rejected := false;
  begin
    perform public.crm_save_sale(
      jsonb_build_object(
        'id', 'qa-e2e-unknown-developer-sale',
        'client_id', 'qa-e2e-client',
        'project', 'Proyecto fuera de catálogo',
        'unit', 'QA-UNKNOWN',
        'developer', 'Constructora desconocida',
        'status', 'Reservada',
        'sale_price', 100000,
        'sale_currency', 'DOP',
        'sale_date', current_date,
        'commission_rate', 5,
        'commission_amount', 5000,
        'commission_currency', 'DOP'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-unknown-developer-installment',
          'sale_id', 'qa-e2e-unknown-developer-sale',
          'label', 'Pago único',
          'installmentKind', 'single',
          'sequence', 1,
          'amount', 5000,
          'due_date', current_date
        )
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: el backend acepto una constructora fuera del catálogo';
  end if;

  -- Ataque: la escritura directa de clientes tampoco puede inventar una etapa.
  v_rejected := false;
  begin
    insert into public.crm_clients (
      id, name, phone, email, stage, property_stage
    ) values (
      'qa-e2e-invalid-stage-client', 'Cliente etapa inválida', '8095550188',
      'qa-invalid-stage@example.test', 'Etapa inventada', 'Sin definir'
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: authenticated pudo guardar una etapa de cliente inválida';
  end if;

  -- Ataque: ningún cobro contabilizado puede quedar sin cuota estructural.
  v_rejected := false;
  begin
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-without-installment',
        'sale_id', 'qa-e2e-sale',
        'amount', 1,
        'currency', 'DOP',
        'payment_date', current_date,
        'method', 'Transferencia',
        'reference', 'QA-E2E-NO-INSTALLMENT',
        'status', 'Contabilizado'
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: se acepto un cobro sin installment_id';
  end if;

  -- Ataque: Entregado exige una fecha real no futura; no se autocompleta.
  v_rejected := false;
  begin
    perform public.crm_save_sale(
      jsonb_build_object(
        'id', 'qa-e2e-sale',
        'client_id', 'qa-e2e-client',
        'project', 'Riviera 2',
        'unit', 'QA-01',
        'developer', 'Constructora LVP',
        'status', 'Entregado',
        'sale_price', 3000000,
        'sale_currency', 'DOP',
        'sale_date', current_date,
        'delivery_date', current_date + 210,
        'shared_sale', true,
        'external_agent', 'Broker QA transaccional',
        'commission_rate', 5,
        'commission_amount', 150000,
        'commission_currency', 'DOP',
        'notes', 'Prueba de aceptacion; no es una venta real'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-installment-1',
          'sale_id', 'qa-e2e-sale',
          'label', 'Avance',
          'installmentKind', 'advance',
          'sequence', 1,
          'amount', 12000,
          'due_date', current_date
        ),
        jsonb_build_object(
          'id', 'qa-e2e-installment-2',
          'sale_id', 'qa-e2e-sale',
          'label', 'Saldo',
          'installmentKind', 'balance',
          'sequence', 2,
          'amount', 138000,
          'due_date', current_date + 210
        )
      )
    );
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QA fallo: Entregado acepto delivery_date futura';
  end if;

  v_rejected := false;
  begin
    perform public.crm_record_payment(
      jsonb_build_object(
        'id', 'qa-e2e-overpay',
        'sale_id', 'qa-e2e-sale',
        'installment_id', 'qa-e2e-installment-1',
        'amount', 2001,
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
        'project', 'Riviera 2',
        'unit', 'QA-01',
        'developer', 'Constructora LVP',
        'status', 'Opción a compra firmada',
        'sale_price', 3000000,
        'sale_currency', 'DOP',
        'sale_date', current_date,
        'delivery_date', current_date + 210,
        'shared_sale', true,
        'external_agent', 'Broker QA transaccional',
        'commission_rate', 5,
        'commission_amount', 150000,
        'commission_currency', 'DOP',
        'notes', 'Prueba de aceptacion; no es una venta real'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', 'qa-e2e-installment-1',
          'sale_id', 'qa-e2e-sale',
          'label', 'Cuota 1 alterada',
          'installmentKind', 'advance',
          'sequence', 1,
          'amount', 11000,
          'due_date', current_date
        ),
        jsonb_build_object(
          'id', 'qa-e2e-installment-2',
          'sale_id', 'qa-e2e-sale',
          'label', 'Cuota 2 alterada',
          'installmentKind', 'balance',
          'sequence', 2,
          'amount', 139000,
          'due_date', current_date + 210
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

-- Flujo positivo: al registrar la fecha real de entrega, balance queda habilitado.
select public.crm_save_sale(
  jsonb_build_object(
    'id', 'qa-e2e-sale',
    'client_id', 'qa-e2e-client',
    'project', 'Riviera 2',
    'unit', 'QA-01',
    'developer', 'Constructora LVP',
    'status', 'Entregado',
    'sale_price', 3000000,
    'sale_currency', 'DOP',
    'sale_date', current_date,
    'delivery_date', current_date,
    'shared_sale', true,
    'external_agent', 'Broker QA transaccional',
    'commission_rate', 5,
    'commission_amount', 150000,
    'commission_currency', 'DOP',
    'notes', 'Prueba de aceptacion; no es una venta real'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'qa-e2e-installment-1',
      'sale_id', 'qa-e2e-sale',
      'label', 'Avance',
      'installmentKind', 'advance',
      'sequence', 1,
      'amount', 12000,
      'due_date', current_date
    ),
    jsonb_build_object(
      'id', 'qa-e2e-installment-2',
      'sale_id', 'qa-e2e-sale',
      'label', 'Saldo',
      'installmentKind', 'balance',
      'sequence', 2,
      'amount', 138000,
      'due_date', current_date + 210
    )
  )
);

select public.crm_record_payment(
  jsonb_build_object(
    'id', 'qa-e2e-payment-balance',
    'sale_id', 'qa-e2e-sale',
    'installment_id', 'qa-e2e-installment-2',
    'amount', 138000,
    'currency', 'DOP',
    'payment_date', current_date,
    'method', 'Transferencia',
    'reference', 'QA-E2E-BALANCE-PAID',
    'status', 'Contabilizado',
    'notes', 'Saldo habilitado después de Entregado'
  )
);

do $qa_delivered_contract$
begin
  if not exists (
    select 1
    from public.crm_sales
    where id = 'qa-e2e-sale'
      and status = 'Entregado'
      and delivery_date = current_date
  ) or not exists (
    select 1
    from public.crm_payments
    where id = 'qa-e2e-payment-balance'
      and installment_id = 'qa-e2e-installment-2'
      and status = 'Contabilizado'
  ) then
    raise exception 'QA fallo: Entregado no habilitó correctamente el balance';
  end if;
end
$qa_delivered_contract$;

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

  if exists (
    select 1 from public.crm_historical_sales where unit = 'QA-HIST-01'
  ) then
    raise exception 'QA fallo: RLS expuso staging histórico a otro usuario';
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

  if not exists (
    select 1
    from public.crm_audit_log
    where table_name = 'crm_historical_import_batches'
  ) or not exists (
    select 1
    from public.crm_audit_log
    where table_name = 'crm_historical_sales'
  ) then
    raise exception 'QA fallo: staging histórico no quedó auditado';
  end if;
end
$qa_final_contracts$;

-- Habilitar temporalmente el mismo workspace para validar la entrada pública.
reset role;
insert into public.crm_public_lead_settings (
  singleton, owner_id, enabled, created_at, updated_at
)
values (
  true,
  current_setting('qa.owner_id', true)::uuid,
  true,
  clock_timestamp(),
  clock_timestamp()
)
on conflict (singleton) do update
set owner_id = excluded.owner_id,
    enabled = true,
    updated_at = clock_timestamp();

-- Un visitante anonimo no puede leer contenido aun no publicado.
reset role;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'anon')::text,
  true
);
set local role anon;

select public.crm_submit_public_lead(
  jsonb_build_object(
    'name', 'QA Prospecto Web',
    'phone', '809-555-0299',
    'email', 'qa-public-lead@example.test',
    'budget', '175000',
    'budget_currency', 'USD',
    'desired_zone', 'Punta Cana',
    'property_stage', 'En planos / En construcción',
    'intent', 'Invertir',
    'property_interest', 'Proyecto QA',
    'message', 'Prueba transaccional de captura web',
    'page_path', '/',
    'privacy_consent', true,
    'website', ''
  )
);

-- El mismo contacto no debe crear un segundo cliente.
select public.crm_submit_public_lead(
  jsonb_build_object(
    'name', 'QA Prospecto Web',
    'phone', '809-555-0299',
    'email', 'qa-public-lead@example.test',
    'budget', '175000',
    'budget_currency', 'USD',
    'desired_zone', 'Punta Cana',
    'property_stage', 'En planos / En construcción',
    'intent', 'Invertir',
    'property_interest', 'Proyecto QA',
    'message', 'Reintento idempotente',
    'page_path', '/',
    'privacy_consent', true,
    'website', ''
  )
);

select set_config(
  'qa.anon_hidden',
  (not exists (
    select 1 from public.evidence_items where id = 'qa-admin-content'
  ))::text,
  true
);

reset role;

do $qa_public_lead_contract$
begin
  if (
    select count(*)
    from public.crm_clients
    where owner_id = current_setting('qa.owner_id', true)::uuid
      and lower(email) = 'qa-public-lead@example.test'
      and source = 'Página web'
      and stage = 'Nuevo'
      and desired_zone = 'Punta Cana'
  ) <> 1 then
    raise exception 'QA fallo: el formulario público no creó exactamente un cliente Nuevo';
  end if;

  if (
    select count(*)
    from public.crm_public_lead_submissions
    where owner_id = current_setting('qa.owner_id', true)::uuid
      and normalized_email = 'qa-public-lead@example.test'
  ) <> 2 then
    raise exception 'QA fallo: la bitácora pública no registró creación y duplicado';
  end if;
end
$qa_public_lead_contract$;

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
      + (select count(*) from public.crm_historical_import_batches where source_name like 'qa-%')
      + (select count(*) from public.crm_historical_sales where unit like 'QA-%')
      + (select count(*) from public.crm_payments where id like 'qa-%')
      + (select count(*) from public.evidence_items where id like 'qa-%')
  )
) as acceptance_result;
