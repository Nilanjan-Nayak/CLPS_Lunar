/**
 * Imagery service — proxies and caches NASA Solar System Treks WMTS tiles (LROC WAC global mosaic, 100 m/px)
 * so the frontend only ever talks to this API. Tiles are cached on disk under assets/.cache/imagery.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR } from '../repo/jsonRepository.js';

export interface ImageryLayer {
  id: string;
  assetId: string;
  name: string;
  upstreamTemplate: string;
  contentType: string;
  minLevel: number;
  maxLevel: number;
}

const LAYERS: Record<string, ImageryLayer> = {
  'lroc-wac': {
    id: 'lroc-wac',
    assetId: 'nasa-trek-lroc-wac-mosaic-303ppd',
    name: 'LROC WAC global mosaic (303 ppd)',
    upstreamTemplate: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
    contentType: 'image/jpeg',
    minLevel: 0,
    maxLevel: 8,
  },
};

export class ImageryService {
  private cacheDir = path.join(ASSETS_DIR, '.cache', 'imagery');
  private inflight = new Map<string, Promise<Buffer | null>>();

  index() {
    const p = path.join(ASSETS_DIR, 'lunar/imagery/lroc-wac-303ppd/index.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { version: 1, layers: [] };
  }

  layer(id: string) {
    return LAYERS[id] ?? null;
  }

  /** Validate WMTS indices for an equirectangular default028mm matrix: cols = 2^(z+1), rows = 2^z. */
  valid(layer: ImageryLayer, z: number, y: number, x: number) {
    if (![z, y, x].every(Number.isInteger)) return false;
    if (z < layer.minLevel || z > layer.maxLevel) return false;
    return y >= 0 && y < 2 ** z && x >= 0 && x < 2 ** (z + 1);
  }

  async tile(layer: ImageryLayer, z: number, y: number, x: number): Promise<Buffer | null> {
    const file = path.join(this.cacheDir, layer.id, String(z), `${y}_${x}${layer.contentType === 'image/png' ? '.png' : '.jpg'}`);
    if (fs.existsSync(file)) return fs.promises.readFile(file);
    const key = `${layer.id}/${z}/${y}/${x}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const url = layer.upstreamTemplate.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'clps-lunar-browser/0.1 (+services/api imagery proxy)' } });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(file, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}
