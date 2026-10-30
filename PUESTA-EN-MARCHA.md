# MEDICINA — Puesta en marcha paso a paso

Esta guía te lleva desde la carpeta del proyecto hasta tener MEDICINA instalada
en el iPhone, con tu cuenta y tus datos guardados en la nube. Son unos 20
minutos y no hace falta programar. Es el mismo proceso que seguiste con Nia CV,
pero con un **proyecto NUEVO de Supabase** (no reutilices el de Nia CV).

---

## 1. Crear el proyecto de Supabase (la base de datos)

1. Entra en <https://supabase.com> con tu cuenta.
2. Pulsa **New project** (*proyecto nuevo*).
3. Rellena:
   - **Name** (*nombre*): `medicina`.
   - **Database password** (*contraseña de la base de datos*): pulsa *Generate* y guárdala en tu gestor de contraseñas. La app no la usa, pero Supabase la pide.
   - **Region** (*región*): elige una de la **Unión Europea**, por ejemplo *West EU (Ireland)* o *Central EU (Frankfurt)*. Los datos de medicación son datos de salud y es preferible que estén en la UE.
4. Pulsa **Create new project** y espera uno o dos minutos.

## 2. Crear las tablas y las reglas de seguridad

1. En el menú de la izquierda: **SQL Editor** (*editor de SQL*) → **New query** (*nueva consulta*).
2. Abre el archivo `supabase/schema.sql` de la carpeta, copia **todo** y pégalo.
3. Pulsa **Run** (*ejecutar*). Debe salir *Success. No rows returned*.

Esto crea las tablas `medicamentos`, `tomas`, `reposiciones`, `avisos` y
`ajustes`, activa la **seguridad por filas** (cada cuenta solo ve lo suyo) y la
función para eliminar la cuenta. Se puede ejecutar varias veces sin borrar nada.

Para comprobarlo: menú **Table Editor** (*editor de tablas*): deben aparecer las
cinco tablas, cada una con la etiqueta *RLS enabled* (*seguridad activada*).

## 3. Configurar el acceso con correo y contraseña

1. Menú **Authentication** (*autenticación*) → **Sign In / Providers** → **Email**: comprueba que está activado y que **Confirm email** (*confirmar correo*) está activado. Así nadie puede crear una cuenta con un correo que no es suyo.
2. Menú **Authentication** → **URL Configuration** (*configuración de direcciones*):
   - **Site URL**: la dirección donde publicarás la app (paso 5), por ejemplo `https://noee34.github.io/medicina/`.
   - **Redirect URLs** (*direcciones de retorno*): añade esa misma dirección.
   Sin esto, los enlaces de "confirmar correo" y "recuperar contraseña" no volverían a la app.
3. Opcional: **Authentication** → **Emails** → plantillas. Puedes traducir los correos al castellano.

> Los correos de Supabase gratuitos tienen un límite bajo por hora. Para uso
> personal es suficiente. Si lo necesitas, en *Authentication → SMTP Settings*
> puedes poner tu propio servidor de correo.

## 4. Conectar la app con tu proyecto

1. Menú **Project Settings** (*ajustes del proyecto*) → **API Keys** (o botón **Connect**).
2. Copia:
   - **Project URL** (*dirección del proyecto*): `https://xxxxxxxx.supabase.co`
   - **Publishable key** (*clave pública*, empieza por `sb_publishable_…`; en proyectos antiguos se llama *anon key*).
3. Abre `js/config.js` y pégalas:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_xxxxxxxxxxxx';
```

> **Nunca** pongas la clave *service_role* ni ninguna *secret key*. La clave
> pública solo permite lo que dejan las reglas de seguridad del paso 2.

## 5. Publicar gratis con GitHub Pages

1. En GitHub, crea un repositorio **nuevo** llamado `medicina` (puede ser público: no contiene datos, solo la app).
2. Sube **todo el contenido** de la carpeta (incluidos `.nojekyll`, `fonts/`, `icons/` y `js/vendor/`).
   - Desde la web: *Add file → Upload files*, arrastra los archivos y carpetas, y pulsa *Commit changes*.
3. En el repositorio: **Settings** (*ajustes*) → **Pages** (*páginas*) → **Deploy from a branch** (*publicar desde una rama*) → rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos la app estará en `https://TU-USUARIO.github.io/medicina/`.
5. Vuelve al paso 3.2 si la dirección no coincide con la que pusiste.

## 6. Instalar en el iPhone

1. Abre la dirección en **Safari**.
2. **Compartir** (cuadrado con flecha) → **Añadir a pantalla de inicio** → **Añadir**.
3. Abre **MEDICINA** desde el icono (se abre a pantalla completa).
4. **Crear una cuenta nueva** → correo y contraseña → confirma el correo desde el enlace que te llega → entra.
5. Marca **Mantener la sesión iniciada** si no quieres escribir la contraseña cada vez.

## 7. Avisos y notificaciones en el iPhone

Lo que hace MEDICINA, explicado sin rodeos:

| Situación | Cómo avisa |
|---|---|
| App **abierta** o recién abierta | Notificación del sistema + aviso dentro de la app a la hora de la toma (o 5/15/30 min antes, según el medicamento). |
| App **cerrada** | Con el **Calendario del iPhone**: en la ficha del medicamento → *Añadir al Calendario del iPhone* (o en Perfil → *Añadir todas las tomas*). Se crea un evento diario por cada hora de toma con su alarma. Avisa con el iPhone bloqueado y sin Internet. |
| Pocas existencias | Aviso al registrar tomas y al abrir la app, una sola vez por umbral; se marcan como atendidos. |

Para permitir las notificaciones: iOS 16.4 o posterior, abrir MEDICINA **desde
el icono** de la pantalla de inicio, y en **Perfil → Permitir notificaciones**.

> **Por qué no hay avisos "push" con la app cerrada:** iOS no deja que una web
> programe notificaciones locales. Para enviarlas con la app cerrada haría
> falta un servidor que las mande a su hora: claves VAPID, una función en
> Supabase (*Edge Function*) que envíe las notificaciones Web Push, una tarea
> programada (*pg_cron*) cada minuto y guardar la suscripción de cada iPhone.
> Se puede añadir más adelante; mientras tanto, el Calendario del iPhone es la
> forma fiable. **No dependas solo de notificaciones para tratamientos importantes.**

Si cambias horarios de un medicamento, vuelve a añadirlo al Calendario y borra
los eventos antiguos en la app Calendario.

## 8. Comprobaciones antes de usarla a diario

Marca cada punto:

1. ☐ Crear cuenta, confirmar el correo y entrar.
2. ☐ *¿Has olvidado la contraseña?* → llega el correo → el enlace abre MEDICINA en *Nueva contraseña*.
3. ☐ Perfil → *Cambiar contraseña*.
4. ☐ Añadir un medicamento (por ejemplo, cada 8 horas desde las 08:00, 30 comprimidos).
5. ☐ Inicio → **REGISTRAR TOMA** → sale *Toma registrada correctamente* y las existencias bajan en 1.
6. ☐ Historial → tocar la toma → cambiarla a *Omitida* → las existencias vuelven a subir (sin descontar dos veces).
7. ☐ Registrar una reposición → la cantidad sube y aparece en el historial de reposiciones.
8. ☐ Medicamento con receta → **SOLICITAR RECETA** → aparece en *Reposiciones → Receta solicitada*.
9. ☐ Calendario → los días muestran verde (realizada), naranja (pendiente/retrasada) y gris (omitida).
10. ☐ Historial → **EXPORTAR INFORME PDF** → se abre la hoja de compartir del iPhone → *Guardar en Archivos*.
11. ☐ Abrir la app en otro dispositivo con la misma cuenta → aparecen los mismos datos.
12. ☐ Modo avión → registrar una toma → arriba pone *Sin conexión · 1 pendiente* → quitar el modo avión → pasa a *Guardado*.
13. ☐ Cerrar la app del todo y volver a abrirla → todo sigue ahí.
14. ☐ Crear una segunda cuenta de prueba → no ve nada de la primera.

## 9. Copias de seguridad y recuperación

- Todo está en Supabase: al cambiar de iPhone, basta con instalar la app y entrar.
- Además, de vez en cuando: **Perfil → Crear copia de seguridad** (guárdala en iCloud Drive). Se restaura en *Perfil → Restaurar copia*, sin duplicar nada.
- Supabase gratuito no guarda copias automáticas recuperables por ti; tu copia JSON y los PDF son tu red de seguridad.
- Un proyecto gratuito de Supabase se **pausa tras 7 días sin uso**. Si pasa, entra en supabase.com y pulsa *Restore project*: los datos no se pierden.

## 10. Probar sin nube (opcional)

Con `js/config.js` vacío, la app funciona en **modo local** (sin cuenta, solo en
ese dispositivo). Útil para probarla en el ordenador:

```bash
npm start        # http://localhost:5173
npm test         # pruebas de lógica en 4 zonas horarias + sincronización sin conexión
node tests/e2e.mjs       # recorrido completo en un iPhone emulado (con npm start en marcha)
node tests/offline.mjs   # abre sin conexión y genera PDF sin red
```
