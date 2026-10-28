import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db/index.js';
import { sesiones, usuarios } from './db/schema.js';

export const COOKIE_SESION = 'sesion';
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface UsuarioSesion {
  id: number;
  email: string;
  nombre: string;
  rol: 'superadmin' | 'empresa';
  empresaId: number | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: UsuarioSesion | null;
  }
}

const huella = (token: string) => createHash('sha256').update(token).digest('hex');

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const comprobarPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function crearSesion(db: Db, usuarioId: number) {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DURACION_MS);
  await db.insert(sesiones).values({ id: huella(token), usuarioId, expira });
  // Limpieza oportunista de sesiones caducadas.
  await db.delete(sesiones).where(lt(sesiones.expira, new Date()));
  return { token, expira };
}

export async function borrarSesion(db: Db, token: string) {
  await db.delete(sesiones).where(eq(sesiones.id, huella(token)));
}

export async function usuarioDeToken(db: Db, token: string): Promise<UsuarioSesion | null> {
  const [fila] = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      empresaId: usuarios.empresaId,
    })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(and(eq(sesiones.id, huella(token)), gt(sesiones.expira, new Date())))
    .limit(1);
  return fila ?? null;
}

/** preHandler: exige sesión iniciada. */
export async function requiereSesion(req: FastifyRequest, reply: FastifyReply) {
  if (!req.usuario) return reply.code(401).send({ error: 'Tienes que iniciar sesión.' });
}

/** preHandler: exige un usuario de empresa (todas las consultas filtran por su empresa). */
export async function requiereEmpresa(req: FastifyRequest, reply: FastifyReply) {
  if (!req.usuario) return reply.code(401).send({ error: 'Tienes que iniciar sesión.' });
  if (!req.usuario.empresaId) return reply.code(403).send({ error: 'Tu usuario no pertenece a ninguna empresa.' });
}

/** Empresa del usuario actual (solo usar tras requiereEmpresa). */
export const empresaDe = (req: FastifyRequest) => req.usuario!.empresaId!;
