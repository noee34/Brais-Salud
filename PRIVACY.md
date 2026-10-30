# Privacidad de MEDICINA

MEDICINA trata datos de medicación, que son **datos de salud**: una categoría
especial según el Reglamento General de Protección de Datos (RGPD, art. 9) y la
Ley Orgánica 3/2018 (LOPDGDD).

## Qué datos se guardan
- Correo electrónico de la cuenta (para entrar y recuperar la contraseña).
- Medicamentos, pautas y horarios que introduces.
- Tomas registradas (hora real, cantidad, estado, observaciones).
- Existencias iniciales, reposiciones y estado de las recetas.
- Avisos de existencias y preferencias de la app.

No hay analíticas, publicidad, cookies de seguimiento ni envío a terceros.

## Dónde
- En tu iPhone (IndexedDB), para que funcione sin conexión.
- En tu propio proyecto de Supabase (PostgreSQL), con conexión cifrada (HTTPS).
  Recomendado: región de la Unión Europea.

## Quién puede verlos
Solo tu cuenta. Las reglas de seguridad por filas (Row Level Security) impiden
que otra cuenta lea o modifique tus datos, y la clave pública de la web no
permite saltárselas. La app no envía nada a médicos ni farmacias.

## Tus derechos
- **Acceso y portabilidad:** informe PDF, CSV y copia de seguridad (Perfil).
- **Rectificación:** puedes corregir cualquier toma, medicamento o reposición.
- **Supresión:** Perfil → Eliminar cuenta borra la cuenta y todos sus datos,
  en la nube y en el dispositivo, tras una confirmación expresa.

## Responsabilidad
Quien publica la app y crea el proyecto de Supabase es el responsable del
tratamiento. Si la usas solo para ti, se trata de un uso personal y doméstico.
Si la ofreces a otras personas, necesitarás informarles, obtener su
consentimiento explícito para tratar datos de salud y firmar el acuerdo de
encargado del tratamiento (DPA) que ofrece Supabase.

MEDICINA es una herramienta de organización: no es un producto sanitario, no
prescribe ni modifica tratamientos.
