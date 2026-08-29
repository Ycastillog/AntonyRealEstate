-- Antony CRM - asignar una cuenta propietaria y una cuenta de soporte al mismo workspace
--
-- Prerrequisitos:
--   1. Ejecutar primero supabase-production-setup.sql.
--   2. Crear o invitar ambas cuentas en Supabase Authentication.
--   3. Sustituir OWNER_EMAIL_HERE y SUPPORT_EMAIL_HERE solo en SQL Editor.
--
-- Este script no copia, duplica ni cambia filas financieras. El workspace técnico
-- permanece ligado a la cuenta que ya contiene los datos y ambas cuentas reciben
-- el mismo owner_id mediante app_metadata protegido por Supabase Auth.

begin;

do $crm_shared_workspace$
declare
  v_owner_email text := lower('OWNER_EMAIL_HERE');
  v_support_email text := lower('SUPPORT_EMAIL_HERE');
  v_owner_id uuid;
  v_support_id uuid;
  v_workspace_owner_id uuid;
  v_owner_matches integer;
  v_support_matches integer;
  v_client_count bigint;
  v_sale_count bigint;
  v_installment_count bigint;
  v_payment_count bigint;
begin
  if v_owner_email in ('', 'owner_email_here')
     or v_support_email in ('', 'support_email_here') then
    raise exception
      'Sustituya OWNER_EMAIL_HERE y SUPPORT_EMAIL_HERE antes de ejecutar';
  end if;

  if v_owner_email = v_support_email then
    raise exception 'Propietario y soporte deben ser cuentas diferentes';
  end if;

  select count(*), min(id)
    into v_owner_matches, v_owner_id
  from auth.users
  where lower(email) = v_owner_email;

  select count(*), min(id)
    into v_support_matches, v_support_id
  from auth.users
  where lower(email) = v_support_email;

  if v_owner_matches <> 1 then
    raise exception 'No existe exactamente una cuenta propietaria para %', v_owner_email;
  end if;
  if v_support_matches <> 1 then
    raise exception 'No existe exactamente una cuenta de soporte para %', v_support_email;
  end if;

  -- La cuenta de soporte es la propietaria técnica actual porque ya contiene la
  -- cartera. Mantener ese UUID evita una migración destructiva de claves foráneas.
  v_workspace_owner_id := v_support_id;

  select count(*) into v_client_count
  from public.crm_clients where owner_id = v_workspace_owner_id;
  select count(*) into v_sale_count
  from public.crm_sales where owner_id = v_workspace_owner_id;
  select count(*) into v_installment_count
  from public.crm_commission_installments where owner_id = v_workspace_owner_id;
  select count(*) into v_payment_count
  from public.crm_payments where owner_id = v_workspace_owner_id;

  if v_client_count = 0 and v_sale_count = 0 then
    raise exception
      'La cuenta de soporte no contiene la cartera que se esperaba compartir';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'role', 'admin',
      'crm_workspace_owner_id', v_workspace_owner_id::text,
      'crm_access_role', 'owner'
    )
  where id = v_owner_id;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'role', 'admin',
      'crm_workspace_owner_id', v_workspace_owner_id::text,
      'crm_access_role', 'support'
    )
  where id = v_support_id;

  raise notice
    'Workspace compartido: owner %, support %, clientes %, ventas %, cuotas %, cobros %',
    v_owner_email,
    v_support_email,
    v_client_count,
    v_sale_count,
    v_installment_count,
    v_payment_count;
end
$crm_shared_workspace$;

commit;

-- Ambas cuentas deben cerrar sesión y volver a entrar para renovar su JWT y
-- recibir crm_workspace_owner_id y crm_access_role.
