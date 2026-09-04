import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(8),
  MINIO_SECRET_KEY: z.string().min(16),
  SESSION_COOKIE_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = schema.parse(env);
  if (config.NODE_ENV === 'production' && /change-me|example|development/i.test(config.SESSION_COOKIE_SECRET)) throw new Error('Production SESSION_COOKIE_SECRET is unsafe.');
  return config;
}
