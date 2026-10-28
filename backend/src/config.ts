function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export const config = {
  databaseUrl: () => requerida('DATABASE_URL'),
  puerto: Number(process.env.PORT ?? 3000),
  origenFrontend: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  cookieSegura: process.env.NODE_ENV === 'production',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  modeloIa: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
};
