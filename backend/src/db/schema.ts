import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const empresas = pgTable('empresas', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  /** Cómo aparece el dueño en los chats exportados (se detecta en la primera subida). */
  nombreDuenoWhatsapp: text('nombre_dueno_whatsapp'),
  /** Precio por paquete entregado que paga el dueño (por defecto para todos los repartidores). */
  precioPaquete: numeric('precio_paquete', { precision: 10, scale: 2 }).notNull().default('0'),
  creado: timestamp('creado', { withTimezone: true }).defaultNow().notNull(),
});

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  /** null solo para superadmin. */
  empresaId: integer('empresa_id').references(() => empresas.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  passwordHash: text('password_hash').notNull(),
  rol: text('rol', { enum: ['superadmin', 'empresa'] }).notNull().default('empresa'),
  creado: timestamp('creado', { withTimezone: true }).defaultNow().notNull(),
});

export const sesiones = pgTable('sesiones', {
  /** sha256 del token de la cookie (el token en claro nunca se guarda). */
  id: text('id').primaryKey(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  expira: timestamp('expira', { withTimezone: true }).notNull(),
});

export const repartidores = pgTable(
  'repartidores',
  {
    id: serial('id').primaryKey(),
    empresaId: integer('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    /** Nombres con los que aparece en WhatsApp. */
    alias: jsonb('alias').$type<string[]>().notNull().default([]),
    tipoTarifa: text('tipo_tarifa', { enum: ['por_paquete', 'por_dia', 'fijo_mas_variable'] })
      .notNull()
      .default('por_paquete'),
    /** Precio propio por paquete entregado; null = usa el de la empresa. */
    tarifaPaquete: numeric('tarifa_paquete', { precision: 10, scale: 2 }),
    tarifaDia: numeric('tarifa_dia', { precision: 10, scale: 2 }).notNull().default('0'),
    fijoMensual: numeric('fijo_mensual', { precision: 10, scale: 2 }).notNull().default('0'),
    activo: boolean('activo').notNull().default(true),
    /** Si sale como columna en la tabla del resumen. */
    mostrarEnResumen: boolean('mostrar_en_resumen').notNull().default(true),
    creado: timestamp('creado', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('repartidores_empresa_idx').on(t.empresaId)],
);

/** Mensajes del repartidor (nunca los del dueño), deduplicados entre subidas. */
export const mensajes = pgTable(
  'mensajes',
  {
    id: serial('id').primaryKey(),
    empresaId: integer('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    repartidorId: integer('repartidor_id')
      .notNull()
      .references(() => repartidores.id, { onDelete: 'cascade' }),
    /** Hora local del chat, "AAAA-MM-DDTHH:MM:SS". */
    fechaHora: text('fecha_hora').notNull(),
    texto: text('texto').notNull(),
    huella: text('huella').notNull(),
  },
  (t) => [
    uniqueIndex('mensajes_huella_idx').on(t.repartidorId, t.huella),
    index('mensajes_mes_idx').on(t.empresaId, t.fechaHora),
  ],
);

export const importaciones = pgTable('importaciones', {
  id: serial('id').primaryKey(),
  empresaId: integer('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  estado: text('estado', { enum: ['pendiente', 'confirmada', 'cancelada'] }).notNull().default('pendiente'),
  archivos: jsonb('archivos').$type<{ nombreArchivo: string; tipo: string; totalMensajes: number; aviso?: string }[]>().notNull(),
  /**
   * Mientras está pendiente guarda los mensajes detectados para poder confirmarlos.
   * Al confirmar o cancelar se vacía (no se conserva el chat).
   */
  datosPendientes: jsonb('datos_pendientes'),
  resultado: jsonb('resultado').$type<{ repartidores: string[]; mensajesNuevos: number; mensajesRepetidos: number }>(),
  creado: timestamp('creado', { withTimezone: true }).defaultNow().notNull(),
});

// --- Fase 2 en adelante (tablas creadas ya para no tener que migrar luego) ---

export const meses = pgTable(
  'meses',
  {
    id: serial('id').primaryKey(),
    empresaId: integer('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    /** "AAAA-MM" */
    mes: text('mes').notNull(),
    estado: text('estado', { enum: ['abierto', 'cerrado'] }).notNull().default('abierto'),
    /** Última vez que la IA procesó este mes. */
    procesado: timestamp('procesado', { withTimezone: true }),
  },
  (t) => [uniqueIndex('meses_empresa_mes_idx').on(t.empresaId, t.mes)],
);

export const registrosDia = pgTable(
  'registros_dia',
  {
    id: serial('id').primaryKey(),
    empresaId: integer('empresa_id')
      .notNull()
      .references(() => empresas.id, { onDelete: 'cascade' }),
    repartidorId: integer('repartidor_id')
      .notNull()
      .references(() => repartidores.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    salida: integer('salida'),
    /** Paquetes entregados (lo que se paga). */
    entregados: integer('entregados'),
    /** Incidencias (paquetes que no se entregaron). */
    incidencias: integer('incidencias'),
    estado: text('estado', { enum: ['ok', 'dudoso', 'error'] }).notNull().default('ok'),
    notaIa: text('nota_ia'),
    mensajeOriginal: text('mensaje_original'),
    editadoManual: boolean('editado_manual').notNull().default(false),
    revisado: boolean('revisado').notNull().default(false),
  },
  (t) => [uniqueIndex('registros_repartidor_fecha_idx').on(t.repartidorId, t.fecha)],
);

export const ajustes = pgTable('ajustes', {
  id: serial('id').primaryKey(),
  empresaId: integer('empresa_id')
    .notNull()
    .references(() => empresas.id, { onDelete: 'cascade' }),
  repartidorId: integer('repartidor_id')
    .notNull()
    .references(() => repartidores.id, { onDelete: 'cascade' }),
  mes: text('mes').notNull(),
  concepto: text('concepto').notNull(),
  importe: numeric('importe', { precision: 10, scale: 2 }).notNull(),
});
