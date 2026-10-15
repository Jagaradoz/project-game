/** Optional developer asset viewer. Separate from the public application's routes. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/assets/', import.meta.url));
const catalog = fileURLToPath(new URL('./asset-catalog.html', import.meta.url));
const types = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path === '/' ? catalog : path.startsWith('/assets/') ? resolve(root, path.slice(8)) : null;
    if (!file || file !== catalog && !file.startsWith(resolve(root) + sep)) { res.writeHead(404); res.end('Not found'); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(3101, '127.0.0.1', () => console.log('Developer asset catalog: http://127.0.0.1:3101'));
