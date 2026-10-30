# MEDICINA

Aplicación web instalable (PWA) para iPhone para gestionar medicamentos,
registrar tomas, controlar horarios, consultar el historial, calcular
existencias y recordar cuándo pedir recetas.

Construida sobre la **misma base que Nia CV**: HTML, CSS y JavaScript sin
frameworks ni compilación, guardado "primero en el dispositivo, después en la
nube" (IndexedDB + Supabase), funcionamiento sin conexión (service worker),
hojas que suben desde abajo, avisos de guardado, confirmación antes de borrar,
modo claro/oscuro/automático e ilustraciones originales en SVG.

**Instalación y configuración:** [PUESTA-EN-MARCHA.md](PUESTA-EN-MARCHA.md).
**Privacidad:** [PRIVACY.md](PRIVACY.md).

> MEDICINA registra las pautas que indica un profesional sanitario. No
> prescribe, no recomienda dosis y no modifica tratamientos. Los avisos son
> recordatorios de organización.

## Pantallas

| Pestaña | Qué hace |
|---|---|
| **Inicio** | Fecha y saludo · medicamentos activos, tomas realizadas y pendientes de hoy · tarjeta **PRÓXIMA TOMA** con hora y cuenta atrás y botón **REGISTRAR TOMA** · avisos de existencias · **MEDICACIÓN POR REPONER** · tomas de hoy |
| **Medicamentos** | Añadir, editar, pausar, reanudar, finalizar y quitar de la lista · ficha con pauta, próxima toma, **CONTROL DE EXISTENCIAS**, historial de reposiciones y últimas tomas · acceso a **Reposiciones** |
| **Historial** | Todas las tomas (también de medicamentos finalizados) · filtros por medicamento, estado, mes, año o fechas · corregir y eliminar con confirmación · **EXPORTAR INFORME PDF** |
| **Calendario** | Mes a mes con navegación por meses y años · verde realizada, naranja pendiente/retrasada, gris omitida · detalle del día |
| **Perfil** | Correo, contraseña, sesión, sincronización, notificaciones, umbrales por defecto, apariencia, PDF, CSV, copia y restauración, privacidad, cerrar sesión, eliminar cuenta |
| **Reposiciones** (desde Inicio y Medicamentos) | Pocas existencias · necesitan receta · receta solicitada · pendientes de recoger o comprar · repuestos · botón **SOLICITAR RECETA** y estados manuales |

## Reglas que cumple

- **Tomas:** nunca se registran solas. Se guarda la hora real. Las omitidas y pendientes no cuentan como administradas. Doble toque → pide confirmación. Registrar más de 1 h antes de lo previsto → pide confirmación.
- **Próximas tomas:** cada pauta elige *horario fijo* o *contar desde la última toma* (si te retrasas, la siguiente se desplaza). Una toma olvidada sale como *retrasada* hasta la siguiente hora prevista y no se acumula con ella: nunca se propone duplicar.
- **Existencias:** no se guardan; se calculan siempre como *recuento inicial + reposiciones − tomas realizadas*. Corregir, mover o borrar una toma recalcula sin duplicar descuentos.
- **Días restantes:** existencias / consumo diario de la pauta. Sin pauta fija → "Estimación no disponible".
- **Avisos de existencias:** umbrales por medicamento (10, 5, 2…), reserva mínima y días de antelación. Cada aviso tiene un id fijo por periodo (hasta la siguiente reposición), así no se repite ni se duplica entre dispositivos; si saltan varios, solo suena el más importante. Se marcan como atendidos.
- **Historial permanente:** los medicamentos no se borran nunca desde la app (se finalizan o se quitan de la lista); cada toma guarda el nombre del medicamento.
- **PDF:** solo tomas registradas; las previstas sin registrar se cuentan aparte, nunca como realizadas.

## Arquitectura

```
index.html · manifest.webmanifest · sw.js     Carcasa PWA, instalación y uso sin conexión
css/styles.css                                 Sistema visual (paleta sanitaria, modo oscuro)
js/app.js                                      Arranque, pestañas, eventos, avisos de toma
js/store.js · js/sync.js · js/remote-supabase.js   Datos: IndexedDB + bandeja de envío + Supabase
js/auth.js · js/account.js                     Acceso, sesión, contraseña, eliminar cuenta
js/meds.js · js/schedule.js · js/stock.js      Catálogos, pautas/próximas tomas, existencias/avisos (lógica pura)
js/model.js                                    Acciones: registrar tomas y reposiciones, estados, avisos
js/forms.js                                    Formularios (medicamento, toma, reposición, PDF)
js/notify.js                                   Notificaciones y calendario del iPhone (.ics)
js/pdf.js                                      Informe PDF (jsPDF + AutoTable, cargados al exportar)
js/data-io.js                                  CSV, copia de seguridad y restauración sin duplicados
js/views/*.js                                  Inicio, Medicamentos/Reposiciones, Historial, Calendario, Perfil
js/art.js                                      Iconos, logotipo e ilustraciones originales (SVG)
supabase/schema.sql                            Tablas en castellano + Row Level Security
tests/                                         Lógica, sincronización, recorrido E2E y sin conexión
```

Nombres internos del código en inglés (lo habitual); textos, comentarios,
tablas y columnas de Supabase en castellano.

### Tablas de Supabase

- `medicamentos` (pauta, horarios, estado, existencias iniciales, umbrales, receta…)
- `tomas` (medicamento, nombre copiado, fecha y hora real, hora prevista, cantidad, unidad, estado, observaciones)
- `reposiciones` (fecha, cantidad añadida, total después, observaciones)
- `avisos` (avisos de existencias generados y si están atendidos)
- `ajustes` (preferencias de la cuenta)

Todas con `usuario_id` y reglas de seguridad por filas; las tomas, reposiciones
y avisos solo pueden apuntar a medicamentos de la misma cuenta.

## Licencias de terceros

DM Sans (SIL OFL) · supabase-js (MIT) · jsPDF (MIT) · jsPDF-AutoTable (MIT).
Logotipo, iconos e ilustraciones: diseños originales de MEDICINA, inspirados en
la estética sanitaria gallega sin usar logotipos ni símbolos oficiales.
