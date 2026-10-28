/**
 * Crea un usuario. Uso:
 *   npm run crear-usuario -- --email dueno@empresa.com --nombre "Fabián" --empresa "Repartos Fabián" --password "..."
 *   npm run crear-usuario -- --email yo@yoapro.site --nombre "Yoa" --superadmin --password "..."
 * Si la empresa no existe, se crea. Si el email ya existe, se cambia su contraseña.
 */
import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { conectar } from '../db/index.js';
import { empresas, usuarios } from '../db/schema.js';

const { values: a } = parseArgs({
  options: {
    email: { type: 'string' },
    nombre: { type: 'string' },
    empresa: { type: 'string' },
    password: { type: 'string' },
    superadmin: { type: 'boolean', default: false },
  },
});

if (!a.email || !a.password || (!a.superadmin && !a.empresa)) {
  console.error('Faltan datos. Necesito --email, --password y --empresa (o --superadmin).');
  process.exit(1);
}
if (a.password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const { db, migrar, cerrar } = conectar(config.databaseUrl());
await migrar();

let empresaId: number | null = null;
if (!a.superadmin) {
  const [existe] = await db.select().from(empresas).where(eq(empresas.nombre, a.empresa!)).limit(1);
  empresaId = existe?.id ?? (await db.insert(empresas).values({ nombre: a.empresa! }).returning())[0].id;
}

const email = a.email.trim().toLowerCase();
const passwordHash = await hashPassword(a.password);
const [ya] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
if (ya) {
  await db.update(usuarios).set({ passwordHash }).where(eq(usuarios.id, ya.id));
  console.log(`Contraseña actualizada para ${email}.`);
} else {
  await db.insert(usuarios).values({
    email,
    nombre: a.nombre ?? email,
    passwordHash,
    rol: a.superadmin ? 'superadmin' : 'empresa',
    empresaId,
  });
  console.log(`Usuario ${email} creado${empresaId ? ` en la empresa "${a.empresa}"` : ' (superadmin)'}.`);
}
await cerrar();
