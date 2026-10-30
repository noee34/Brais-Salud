// Conexión con Supabase (base de datos Postgres + usuarios con contraseña).
// Las reglas de seguridad (Row Level Security, ver supabase/schema.sql) hacen
// que cada cuenta solo pueda leer y escribir sus propias filas.
//
// En la base de datos todo tiene nombres en castellano; aquí se traducen a
// los nombres internos que usa la app.

const PAGE = 1000; // Supabase devuelve como máximo 1000 filas por petición
const CHUNK = 500;

/** Tabla de Supabase para cada tipo de registro de la app. */
export const TABLE = { meds: 'medicamentos', intakes: 'tomas', restocks: 'reposiciones', alerts: 'avisos' };

const num = (v) => (v == null ? null : Number(v));
const date = (v) => (v ? String(v).slice(0, 10) : '');

const MAP = {
  meds: {
    to: (r) => ({
      id: r.id, nombre: r.name, presentacion: r.form, cantidad_por_toma: r.dose, unidad: r.unit, concentracion: r.strength || '',
      frecuencia: r.frequency, horarios: r.times || [], modo_horario: r.scheduleMode || 'fijo',
      fecha_inicio: r.startDate, fecha_fin: r.endDate || null, observaciones: r.notes || '',
      estado: r.status, estado_desde: r.statusAt, archivado: Boolean(r.archived), aviso_toma: r.reminder ?? null,
      control_existencias: Boolean(r.stockEnabled), existencias_iniciales: r.stockInitial || 0, existencias_desde: r.stockSince,
      reserva_minima: r.minReserve || 0, umbrales: r.thresholds || [], dias_aviso: r.alertDays ?? 3,
      necesita_receta: Boolean(r.needsRx), estado_receta: r.rxStatus, estado_receta_desde: r.rxStatusAt,
      ultima_reposicion: r.lastRestockDate || null, creado: r.createdAt, modificado: r.updatedAt,
    }),
    from: (x) => ({
      id: x.id, name: x.nombre, form: x.presentacion, dose: num(x.cantidad_por_toma), unit: x.unidad, strength: x.concentracion || '',
      frequency: x.frecuencia, times: x.horarios || [], scheduleMode: x.modo_horario,
      startDate: date(x.fecha_inicio), endDate: date(x.fecha_fin), notes: x.observaciones || '',
      status: x.estado, statusAt: num(x.estado_desde), archived: Boolean(x.archivado), reminder: num(x.aviso_toma),
      stockEnabled: Boolean(x.control_existencias), stockInitial: num(x.existencias_iniciales), stockSince: num(x.existencias_desde),
      minReserve: num(x.reserva_minima), thresholds: (x.umbrales || []).map(Number), alertDays: num(x.dias_aviso),
      needsRx: Boolean(x.necesita_receta), rxStatus: x.estado_receta, rxStatusAt: num(x.estado_receta_desde),
      lastRestockDate: date(x.ultima_reposicion), createdAt: num(x.creado), updatedAt: num(x.modificado),
    }),
  },
  intakes: {
    to: (r) => ({
      id: r.id, medicamento_id: r.medId, medicamento_nombre: r.medName, fecha_hora: r.at, programada: r.scheduledAt ?? null,
      cantidad: r.quantity, unidad: r.unit, estado: r.status, observaciones: r.notes || '', creado: r.createdAt, modificado: r.updatedAt,
    }),
    from: (x) => ({
      id: x.id, medId: x.medicamento_id, medName: x.medicamento_nombre, at: num(x.fecha_hora), scheduledAt: num(x.programada),
      quantity: num(x.cantidad), unit: x.unidad, status: x.estado, notes: x.observaciones || '', createdAt: num(x.creado), updatedAt: num(x.modificado),
    }),
  },
  restocks: {
    to: (r) => ({
      id: r.id, medicamento_id: r.medId, medicamento_nombre: r.medName, fecha_hora: r.at, cantidad: r.quantity,
      total_despues: r.totalAfter, observaciones: r.notes || '', creado: r.createdAt, modificado: r.updatedAt,
    }),
    from: (x) => ({
      id: x.id, medId: x.medicamento_id, medName: x.medicamento_nombre, at: num(x.fecha_hora), quantity: num(x.cantidad),
      totalAfter: num(x.total_despues), notes: x.observaciones || '', createdAt: num(x.creado), updatedAt: num(x.modificado),
    }),
  },
  alerts: {
    to: (r) => ({
      id: r.id, medicamento_id: r.medId, tipo: r.kind, mensaje: r.message, nivel: r.level, silencioso: Boolean(r.silent),
      atendido: Boolean(r.attended), fecha_hora: r.at, creado: r.createdAt, modificado: r.updatedAt,
    }),
    from: (x) => ({
      id: x.id, medId: x.medicamento_id, kind: x.tipo, message: x.mensaje, level: x.nivel, silent: Boolean(x.silencioso),
      attended: Boolean(x.atendido), at: num(x.fecha_hora), createdAt: num(x.creado), updatedAt: num(x.modificado),
    }),
  },
};

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Error de Supabase');
  return data;
};

export class SupabaseRemote {
  constructor(client, userId) {
    this.client = client;
    this.userId = userId;
  }

  async fetchAll(type) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await this.client.from(TABLE[type]).select('*')
        .order('creado', { ascending: true }).order('id').range(from, from + PAGE - 1));
      out.push(...rows.map(MAP[type].from));
      if (rows.length < PAGE) return out;
    }
  }

  async upsert(type, recs) {
    for (let i = 0; i < recs.length; i += CHUNK) {
      const rows = recs.slice(i, i + CHUNK).map((r) => ({ ...MAP[type].to(r), usuario_id: this.userId }));
      check(await this.client.from(TABLE[type]).upsert(rows));
    }
  }

  async remove(type, id) {
    check(await this.client.from(TABLE[type]).delete().eq('id', id));
  }

  async clear(type) {
    check(await this.client.from(TABLE[type]).delete().eq('usuario_id', this.userId));
  }

  async getSettings() {
    const row = check(await this.client.from('ajustes').select('valor').eq('usuario_id', this.userId).maybeSingle());
    return row?.valor ?? null;
  }

  async setSettings(value) {
    check(await this.client.from('ajustes').upsert({ usuario_id: this.userId, valor: value }));
  }

  /** Avisa cuando cambia algo desde otro dispositivo (Supabase Realtime). */
  onChange(cb) {
    const filter = `usuario_id=eq.${this.userId}`;
    const ch = this.client.channel(`medicina-${this.userId}`);
    for (const table of [...Object.values(TABLE), 'ajustes']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, cb);
    }
    ch.subscribe();
    return () => this.client.removeChannel(ch);
  }
}

export { MAP };
