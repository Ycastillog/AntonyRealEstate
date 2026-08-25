-- ARCHIVO OBSOLETO: no configura producción.
--
-- La migración antigua permitía escrituras anónimas. Se conserva este nombre
-- únicamente para fallar de forma segura si alguien sigue una instrucción vieja.
-- Ejecute `supabase-production-setup.sql` completo en Supabase SQL Editor.

do $deprecated$
begin
  raise exception
    'Migracion obsoleta bloqueada: use supabase-production-setup.sql';
end
$deprecated$;
