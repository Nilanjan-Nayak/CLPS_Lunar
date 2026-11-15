import Fastify from 'fastify';
import cors from '@fastify/cors';
import { JsonRepository } from '../services/api/dist/repo/jsonRepository.js';
import { TerrainService } from '../services/api/dist/services/terrain.js';
import { ImageryService } from '../services/api/dist/services/imagery.js';
import { registerRoutes } from '../services/api/dist/routes/index.js';

let app;

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });
  const repo = new JsonRepository();
  const terrain = new TerrainService();
  const imagery = new ImageryService();
  registerRoutes(fastify, { repo, terrain, imagery });
  await fastify.ready();
  return fastify;
}

export default async function handler(req, res) {
  if (!app) {
    app = await buildApp();
  }

  // Normalize path if Vercel serverless strips the /api prefix
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/?')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  app.server.emit('request', req, res);
}

