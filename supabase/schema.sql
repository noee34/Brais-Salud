-- =============================================================================
-- MEDICINA — estructura de la base de datos en Supabase
-- =============================================================================
--
-- CÓMO USARLO
--   1. Entra en supabase.com y abre el proyecto NUEVO de MEDICINA
--      (no uses el de Nia CV).
--   2. Menú de la izquierda → "SQL Editor" (editor de SQL) → "New query".
--   3. Copia TODO este archivo, pégalo y pulsa "Run" (ejecutar).
--   4. Debe aparecer "Success. No rows returned" (correcto, sin filas).
--   Puedes ejecutarlo más de una vez: no borra nada.
--
-- QUÉ CREA
--   · medicamentos  → cada medicamento con su pauta, horarios, existencias y receta
--   · tomas         → cada toma registrada (realizada u omitida). Es el historial.
--   · reposiciones  → cada compra o recogida de una caja nueva
--   · avisos        → avisos de pocas existencias (para no repetirlos)
--   · ajustes       → preferencias de la cuenta (una fila por cuenta)
--   · eliminar_mi_cuenta() → borra la cuenta y TODOS sus datos (lo pide la propia persona)
--
-- REGLAS DE LA APP QUE SE RESPETAN AQUÍ
--   · Las existencias NO se guardan: se calculan siempre a partir de la
--     cantidad inicial, las reposiciones y las tomas realizadas. Así, al
--     corregir o borrar una toma, el número se recalcula solo y nunca se
--     descuenta dos veces.
--   · Los medicamentos no se borran nunca desde la app: se finalizan o se
--     quitan de la lista ("archivado"). Su historial se conserva.
--   · Cada toma guarda una copia del nombre y la unidad del medicamento, para
--     que el historial y los informes PDF sigan siendo correctos aunque el
--     medicamento cambie después.
--
-- SEGURIDAD
--   "Seguridad por filas" (Row Level Security): cada cuenta solo puede leer,
--   crear, cambiar y borrar SUS filas. La clave pública de la web no permite
--   nada más.
--
-- Las palabras en inglés que quedan (create table, bigint, check…) son el
-- propio lenguaje SQL y no se pueden traducir.
-- =============================================================================


-- Medicamentos -----------------------------------------------------------------
create table if not exists public.medicamentos (
  id                   uuid primary key,
  usuario_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre               text not null check (char_length(nombre) between 1 and 80),
  presentacion         text not null default 'comprimido',
  cantidad_por_toma    numeric not null check (cantidad_por_toma > 0 and cantidad_por_toma <= 1000),
  unidad               text not null check (char_length(unidad) between 1 and 30),
  concentracion        text not null default '' check (char_length(concentracion) <= 60),
  frecuencia           text not null check (frecuencia in ('h4', 'h6', 'h8', 'h12', 'd1', 'd2', 'd3', 'custom', 'demanda')),
  horarios             jsonb not null default '[]'::jsonb,          -- ["08:00", "16:00", "00:00"]
  modo_horario         text not null default 'fijo' check (modo_horario in ('fijo', 'desde_ultima')),
  fecha_inicio         date not null,
  fecha_fin            date,                                         -- vacío = sin fecha definida
  observaciones        text not null default '' check (char_length(observaciones) <= 500),
  estado               text not null default 'activo' check (estado in ('activo', 'pausado', 'finalizado')),
  estado_desde         bigint not null,                              -- cuándo cambió de estado (milisegundos)
  archivado            boolean not null default false,               -- quitado de la lista (el historial se conserva)
  aviso_toma           smallint check (aviso_toma in (0, 5, 15, 30)), -- minutos antes; vacío = sin aviso
  -- Existencias (la cantidad ACTUAL se calcula, no se guarda)
  control_existencias  boolean not null default true,
  existencias_iniciales numeric not null default 0 check (existencias_iniciales >= 0 and existencias_iniciales <= 100000),
  existencias_desde    bigint not null,                              -- momento del recuento inicial
  reserva_minima       numeric not null default 5 check (reserva_minima >= 0),
  umbrales             jsonb not null default '[10, 5, 2]'::jsonb,   -- avisar cuando queden estas unidades
  dias_aviso           smallint not null default 3 check (dias_aviso between 0 and 60),
  necesita_receta      boolean not null default false,
  estado_receta        text not null default 'sin_receta' check (estado_receta in
                         ('sin_receta', 'pendiente_solicitar', 'solicitada', 'disponible', 'pendiente_compra', 'repuesto')),
  estado_receta_desde  bigint not null,
  ultima_reposicion    date,
  prospecto            jsonb not null default '{}'::jsonb,           -- prospecto breve escrito por la persona
  creado               bigint not null,
  modificado           bigint not null
);
create index if not exists medicamentos_usuario on public.medicamentos (usuario_id);
-- Para proyectos creados con una versión anterior de este archivo:
alter table public.medicamentos add column if not exists prospecto jsonb not null default '{}'::jsonb;


-- Tomas (historial) --------------------------------------------------------------
create table if not exists public.tomas (
  id                 uuid primary key,
  usuario_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medicamento_id     uuid not null,                     -- tratamiento al que pertenece
  medicamento_nombre text not null,                     -- copia del nombre en el momento de la toma
  fecha_hora         bigint not null,                   -- hora REAL de la toma (milisegundos)
  programada         bigint,                            -- hora prevista que cubre (vacío si fue una toma suelta)
  cantidad           numeric not null check (cantidad >= 0 and cantidad <= 1000),
  unidad             text not null,
  estado             text not null check (estado in ('realizada', 'omitida')),
  observaciones      text not null default '' check (char_length(observaciones) <= 500),
  creado             bigint not null,
  modificado         bigint not null
);
create index if not exists tomas_usuario_fecha on public.tomas (usuario_id, fecha_hora);
create index if not exists tomas_medicamento on public.tomas (medicamento_id, fecha_hora);


-- Reposiciones -------------------------------------------------------------------
create table if not exists public.reposiciones (
  id                 uuid primary key,
  usuario_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medicamento_id     uuid not null,
  medicamento_nombre text not null,
  fecha_hora         bigint not null,                   -- fecha de la reposición
  cantidad           numeric not null check (cantidad > 0 and cantidad <= 100000),
  total_despues      numeric not null,                  -- existencias que quedaron tras reponer
  observaciones      text not null default '' check (char_length(observaciones) <= 500),
  creado             bigint not null,
  modificado         bigint not null
);
create index if not exists reposiciones_usuario_fecha on public.reposiciones (usuario_id, fecha_hora);


-- Avisos de existencias ------------------------------------------------------------
-- El id es fijo para cada aviso (medicamento + periodo + tipo), así dos
-- dispositivos que generan el mismo aviso no lo duplican.
create table if not exists public.avisos (
  id              text primary key check (char_length(id) <= 200),
  usuario_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medicamento_id  uuid not null,
  tipo            text not null,                        -- u10, u5, u2, minimo, dias, agotado
  mensaje         text not null check (char_length(mensaje) <= 400),
  nivel           text not null check (nivel in ('naranja', 'rojo')),
  silencioso      boolean not null default false,       -- cubierto por un aviso más importante
  atendido        boolean not null default false,
  fecha_hora      bigint not null,
  creado          bigint not null,
  modificado      bigint not null
);
create index if not exists avisos_usuario on public.avisos (usuario_id, fecha_hora);


-- Ajustes --------------------------------------------------------------------------
create table if not exists public.ajustes (
  usuario_id  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  valor       jsonb not null default '{}'::jsonb
);


-- Reglas de acceso: cada cuenta solo ve y toca lo suyo ------------------------------
alter table public.medicamentos enable row level security;
alter table public.tomas        enable row level security;
alter table public.reposiciones enable row level security;
alter table public.avisos       enable row level security;
alter table public.ajustes      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['medicamentos', 'tomas', 'reposiciones', 'avisos', 'ajustes'] loop
    execute format('drop policy if exists "propias_leer" on public.%I', t);
    execute format('drop policy if exists "propias_crear" on public.%I', t);
    execute format('drop policy if exists "propias_cambiar" on public.%I', t);
    execute format('drop policy if exists "propias_borrar" on public.%I', t);
    execute format('create policy "propias_leer" on public.%I for select to authenticated using ((select auth.uid()) = usuario_id)', t);
    execute format('create policy "propias_crear" on public.%I for insert to authenticated with check ((select auth.uid()) = usuario_id)', t);
    execute format('create policy "propias_cambiar" on public.%I for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id)', t);
    execute format('create policy "propias_borrar" on public.%I for delete to authenticated using ((select auth.uid()) = usuario_id)', t);
    -- Nadie sin sesión puede tocar nada
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Una toma, reposición o aviso solo puede apuntar a un medicamento de la MISMA cuenta.
create or replace function public.comprobar_medicamento_propio()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.medicamentos m where m.id = new.medicamento_id and m.usuario_id = new.usuario_id) then
    raise exception 'El medicamento no pertenece a esta cuenta';
  end if;
  return new;
end $$;

drop trigger if exists tomas_medicamento_propio on public.tomas;
create trigger tomas_medicamento_propio before insert or update of medicamento_id on public.tomas
  for each row execute function public.comprobar_medicamento_propio();
drop trigger if exists reposiciones_medicamento_propio on public.reposiciones;
create trigger reposiciones_medicamento_propio before insert or update of medicamento_id on public.reposiciones
  for each row execute function public.comprobar_medicamento_propio();
drop trigger if exists avisos_medicamento_propio on public.avisos;
create trigger avisos_medicamento_propio before insert or update of medicamento_id on public.avisos
  for each row execute function public.comprobar_medicamento_propio();


-- Eliminar la cuenta (solo la propia, y solo si la persona lo confirma en la app) -----
-- Borra el usuario; por "on delete cascade" desaparecen también todos sus datos.
create or replace function public.eliminar_mi_cuenta()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No hay sesión iniciada'; end if;
  delete from public.tomas where usuario_id = uid;
  delete from public.reposiciones where usuario_id = uid;
  delete from public.avisos where usuario_id = uid;
  delete from public.medicamentos where usuario_id = uid;
  delete from public.ajustes where usuario_id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;


-- Cambios en vivo entre dispositivos (Supabase Realtime) -----------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['medicamentos', 'tomas', 'reposiciones', 'avisos', 'ajustes'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
