import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { borrarSesion, COOKIE_SESION, comprobarPassword, crearSesion, requiereSesion } from '../auth.js';
import type { Db } from '../db/index.js';
import { empresas, usuarios } from '../db/schema.js';

const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// Hash válido para comparar aunque el email no exista (mismo tiempo de respuesta).
const HASH_FALSO = bcrypt.hashSync('contraseña-que-no-existe', 12);

export const rutasAuth: FastifyPluginAsync<{ db: Db; cookieSegura: boolean }> = async (app, { db, cookieSegura }) => {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const datos = Login.safeParse(req.body);
      if (!datos.success) return reply.code(400).send({ error: 'Escribe tu email y tu contraseña.' });

      const [u] = await db.select().from(usuarios).where(eq(usuarios.email, datos.data.email)).limit(1);
      const ok = await comprobarPassword(datos.data.password, u?.passwordHash ?? HASH_FALSO);
      if (!u || !ok) return reply.code(401).send({ error: 'Email o contraseña incorrectos.' });

      const { token, expira } = await crearSesion(db, u.id);
      reply.setCookie(COOKIE_SESION, token, {
        httpOnly: true,
        secure: cookieSegura,
        sameSite: 'lax',
        path: '/',
        expires: expira,
      });
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE_SESION];
    if (token) await borrarSesion(db, token);
    reply.clearCookie(COOKIE_SESION, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/yo', { preHandler: requiereSesion }, async (req) => {
    const u = req.usuario!;
    const empresa = u.empresaId
      ? (await db.select().from(empresas).where(eq(empresas.id, u.empresaId)).limit(1))[0]
      : null;
    return {
      usuario: { nombre: u.nombre, email: u.email, rol: u.rol },
      empresa: empresa ? { id: empresa.id, nombre: empresa.nombre, nombreDuenoWhatsapp: empresa.nombreDuenoWhatsapp } : null,
    };
  });
};
