// Biblioteca de MEDICINA: intermediario de solo lectura hacia CIMA (AEMPS),
// el registro oficial de medicamentos autorizados en España.
// CIMA no permite que una web la consulte directamente desde el navegador
// (no envía cabeceras CORS), por eso las consultas pasan por aquí.
// Solo permite tres consultas concretas y exige una sesión de la app (JWT).
//
// Ya está desplegada en el proyecto "Brais salud". Para volver a desplegarla:
//   supabase functions deploy cima --project-ref fqtzxwpxxysmxdmsbsma
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = "https://cima.aemps.es/cima/rest/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const ALLOWED: Record<string, string[]> = {
  "medicamentos": ["nombre", "pagina", "comerc", "cn", "practiv1"],
  "medicamento": ["nregistro", "cn"],
  "docSegmentado/contenido/2": ["nregistro", "seccion"],
};
const MAX_RESULTS = 60;

const json = (body: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...(cache ? { "Cache-Control": "public, max-age=3600" } : {}) },
  });

// Solo lo que muestra la app (las respuestas de CIMA son muy grandes).
// deno-lint-ignore no-explicit-any
const compact = (m: any) => ({
  nregistro: m.nregistro,
  nombre: m.nombre,
  lab: m.labtitular || m.labcomercializador || "",
  receta: Boolean(m.receta),
  cpresc: m.cpresc || "",
  comerc: Boolean(m.comerc),
  generico: Boolean(m.generico),
  conduc: Boolean(m.conduc),
  dosis: m.dosis || "",
  forma: m.formaFarmaceuticaSimplificada?.nombre || m.formaFarmaceutica?.nombre || "",
  via: (m.viasAdministracion || []).map((v: { nombre: string }) => v.nombre).join(", "),
  pactivos: m.vtm?.nombre || m.pactivos || "",
  // deno-lint-ignore no-explicit-any
  prospecto: (m.docs || []).find((d: any) => d.tipo === 2) || null,
  // deno-lint-ignore no-explicit-any
  foto: (m.fotos || []).find((f: any) => f.tipo === "materialas")?.url || (m.fotos || [])[0]?.url || "",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);
  const url = new URL(req.url);
  const path = url.searchParams.get("ruta") || "";
  const allowed = ALLOWED[path];
  if (!allowed) return json({ error: "Consulta no permitida" }, 400);
  const params = new URLSearchParams();
  for (const k of allowed) {
    const v = url.searchParams.get(k);
    if (v != null && v !== "") params.set(k, v.slice(0, 120));
  }
  if (path === "medicamentos" && !params.get("nombre") && !params.get("cn") && !params.get("practiv1")) return json({ error: "Falta el nombre" }, 400);
  if (path !== "medicamentos" && !params.get("nregistro") && !params.get("cn")) return json({ error: "Falta el número de registro" }, 400);
  try {
    const r = await fetch(`${BASE}${path}?${params}`, { headers: { Accept: "application/json" } });
    if (r.status === 204) return json(path === "medicamentos" ? { total: 0, resultados: [] } : null, 200, true);
    if (!r.ok) return json({ error: `CIMA respondió ${r.status}` }, 502);
    const data = await r.json();
    if (path === "medicamentos") {
      // deno-lint-ignore no-explicit-any
      const list = (data?.resultados || []).map(compact).sort((a: any, b: any) => Number(b.comerc) - Number(a.comerc) || a.nombre.localeCompare(b.nombre, "es"));
      return json({ total: data?.totalFilas ?? list.length, resultados: list.slice(0, MAX_RESULTS) }, 200, true);
    }
    if (path === "medicamento") return json(data ? compact(data) : null, 200, true);
    return json(data, 200, true);
  } catch (e) {
    return json({ error: "No se pudo contactar con CIMA", detalle: String(e) }, 502);
  }
});
