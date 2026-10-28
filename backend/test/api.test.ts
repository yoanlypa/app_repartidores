import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { CARPETA_MIGRACIONES, type Db, schema } from '../src/db/index.js';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n));

let app: Awaited<ReturnType<typeof crearApp>>;
let cookieA = '';
let cookieB = '';

function formulario(archivos: [string, Buffer][], campos: Record<string, string> = {}) {
  const f = new FormData();
  for (const [nombre, datos] of archivos) f.append('archivos', new Blob([datos]), nombre);
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

async function login(email: string, password: string) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  const c = r.cookies.find((x) => x.name === 'sesion');
  return { r, cookie: c ? `sesion=${c.value}` : '' };
}

beforeAll(async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });

  const [a, b] = await db.insert(schema.empresas).values([{ nombre: 'Repartos A' }, { nombre: 'Repartos B' }]).returning();
  const passwordHash = await hashPassword('secreto123');
  await db.insert(schema.usuarios).values([
    { email: 'a@a.com', nombre: 'Dueño A', passwordHash, empresaId: a.id },
    { email: 'b@b.com', nombre: 'Dueño B', passwordHash, empresaId: b.id },
  ]);

  app = await crearApp({ db: db as unknown as Db, origenFrontend: 'http://localhost:5173', cookieSegura: false });
  cookieA = (await login('a@a.com', 'secreto123')).cookie;
  cookieB = (await login('b@b.com', 'secreto123')).cookie;
});

afterAll(() => app?.close());

describe('login', () => {
  it('rechaza contraseña incorrecta', async () => {
    const { r } = await login('a@a.com', 'mal');
    expect(r.statusCode).toBe(401);
  });

  it('pide sesión para ver repartidores', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/repartidores' });
    expect(r.statusCode).toBe(401);
  });

  it('devuelve el usuario con la cookie de sesión', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/auth/yo', headers: { cookie: cookieA } });
    expect(r.json().empresa.nombre).toBe('Repartos A');
  });
});

describe('subir chats y alta automática de repartidores', () => {
  let importacionId: number;

  it('analiza los chats y detecta dueño y repartidores', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/importaciones/analizar',
      headers: { cookie: cookieA },
      payload: formulario([
        ['Chat de WhatsApp con Juan Moto.txt', fx('Chat de WhatsApp con Juan Moto.txt')],
        ['Chat de WhatsApp con Ana.txt', fx('Chat de WhatsApp con Ana.txt')],
      ]),
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.dueno).toBe('Yoa Jefe');
    expect(body.detectados.map((d: { nombre: string }) => d.nombre)).toEqual(['Ana', 'Juan Moto']);
    expect(body.detectados[0].coincidencia).toBeNull();
    importacionId = body.importacionId;
  });

  it('no deja confirmar la importación desde otra empresa', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${importacionId}/confirmar`,
      headers: { cookie: cookieB },
      payload: { decisiones: [{ clave: 'ana', accion: 'crear' }] },
    });
    expect(r.statusCode).toBe(404);
  });

  it('crea los repartidores al confirmar y guarda solo sus mensajes', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${importacionId}/confirmar`,
      headers: { cookie: cookieA },
      payload: {
        decisiones: [
          { clave: 'ana', accion: 'crear' },
          { clave: 'juan moto', accion: 'crear', nombre: 'Juan Pérez' },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().repartidores).toEqual(['Ana', 'Juan Pérez']);

    const lista = (await app.inject({ method: 'GET', url: '/api/repartidores', headers: { cookie: cookieA } })).json();
    const juan = lista.repartidores.find((x: { nombre: string }) => x.nombre === 'Juan Pérez');
    expect(juan.alias).toContain('Juan Moto');
    expect(juan.totalMensajes).toBe(9);

    const msgs = (
      await app.inject({ method: 'GET', url: `/api/repartidores/${juan.id}/mensajes?mes=2026-09`, headers: { cookie: cookieA } })
    ).json();
    expect(msgs.mensajes).toHaveLength(1);
  });

  it('la otra empresa no ve esos repartidores', async () => {
    const lista = (await app.inject({ method: 'GET', url: '/api/repartidores', headers: { cookie: cookieB } })).json();
    expect(lista.repartidores).toHaveLength(0);
  });

  it('al volver a subir el mismo chat reconoce al repartidor y no duplica mensajes', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/importaciones/analizar',
      headers: { cookie: cookieA },
      payload: formulario([['Chat de WhatsApp con Juan Moto (1).txt', fx('Chat de WhatsApp con Juan Moto.txt')]]),
    });
    const body = r.json();
    // El dueño ya se conoce de la primera subida.
    expect(body.dueno).toBe('Yoa Jefe');
    expect(body.detectados[0].coincidencia.nombre).toBe('Juan Pérez');

    const c = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${body.importacionId}/confirmar`,
      headers: { cookie: cookieA },
      payload: { decisiones: [{ clave: 'juan moto', accion: 'unir', repartidorId: body.detectados[0].coincidencia.id }] },
    });
    expect(c.json()).toMatchObject({ mensajesNuevos: 0, mensajesRepetidos: 9 });
  });

  it('en un grupo crea un repartidor por remitente', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/importaciones/analizar',
      headers: { cookie: cookieA },
      payload: formulario([['Chat de WhatsApp con Repartidores.txt', fx('Chat de WhatsApp con Repartidores.txt')]]),
    });
    const body = r.json();
    expect(body.archivos[0].tipo).toBe('grupo');
    const juan = body.detectados.find((d: { clave: string }) => d.clave === 'juan moto');
    const luis = body.detectados.find((d: { clave: string }) => d.clave === 'luis');
    expect(juan.coincidencia.nombre).toBe('Juan Pérez');
    expect(luis.coincidencia).toBeNull();
  });

  it('avisa de archivos que no son chats', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/importaciones/analizar',
      headers: { cookie: cookieA },
      payload: formulario([['notas.txt', Buffer.from('hola qué tal')]]),
    });
    expect(r.json().archivos[0].tipo).toBe('vacio');
  });
});

describe('CORS', () => {
  it('permite PATCH con cookies desde el frontend', async () => {
    const r = await app.inject({
      method: 'OPTIONS',
      url: '/api/repartidores/1',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PATCH' },
    });
    expect(r.headers['access-control-allow-methods']).toContain('PATCH');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
  });
});
