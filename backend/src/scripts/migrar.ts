import { config } from '../config.js';
import { conectar } from '../db/index.js';

const { migrar, cerrar } = conectar(config.databaseUrl());
await migrar();
await cerrar();
console.log('Migraciones aplicadas.');
