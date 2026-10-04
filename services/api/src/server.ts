import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { ASSETS_DIR, JsonRepository } from './repo/jsonRepository.js';
import { TerrainService } from './services/terrain.js';
import { ImageryService } from './services/imagery.js';
import { registerRoutes } from './routes/index.js';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
await app.register(cors, { origin: true });

// Asset storage: local folder in development; object storage/CDN in production (same URL contract).
await app.register(fastifyStatic, {
  root: ASSETS_DIR,
  prefix: '/assets/',
  decorateReply: false,
  cacheControl: true,
  maxAge: '7d',
  immutable: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
  },
});

const repo = new JsonRepository();
const terrain = new TerrainService();
const imagery = new ImageryService();
registerRoutes(app, { repo, terrain, imagery });

app.get('/', async () => ({
  service: 'clps-lunar-browser-api',
  version: '0.1.0',
  docs: '/api/v1',
}));

app.listen({ port: PORT, host: HOST }).then(() => {
  app.log.info(`assets served from ${path.relative(process.cwd(), ASSETS_DIR)}`);
});
