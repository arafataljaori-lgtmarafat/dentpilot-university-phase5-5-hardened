import { buildApp } from './app.js';

const core = await buildApp();
const close = async (): Promise<void> => { await core.app.close(); process.exit(0); };
process.on('SIGINT', close); process.on('SIGTERM', close);
await core.app.listen({ port: core.config.PORT, host: '0.0.0.0' });
