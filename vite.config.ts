import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'generate-prefab-manifest',
      // At build time, walk public/prefabs/ and write a manifest JSON into the output
      async closeBundle() {
        const fs = await import('fs');
        const prefabsDir = path.resolve(__dirname, 'public/prefabs');
        const outDir = path.resolve(__dirname, 'dist');
        const results: { path: string; folder: string }[] = [];

        function walk(dir: string, folder: string) {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full, folder ? `${folder}/${entry.name}` : entry.name);
            } else if (entry.name.endsWith('.json') && entry.name !== 'prefabs-manifest.json') {
              results.push({
                path: '/prefabs/' + path.relative(prefabsDir, full).replace(/\\/g, '/'),
                folder: folder || '',
              });
            }
          }
        }
        walk(prefabsDir, '');

        if (fs.existsSync(outDir)) {
          fs.writeFileSync(path.join(outDir, 'prefabs-manifest.json'), JSON.stringify(results));
        }
      },
    },
    {
      name: 'serve-ss14-resources',
      configureServer(server) {
        // Dev-only middleware: serve Resources from the parent repo
        const resourcesPath = path.resolve(__dirname, '../../Resources');
        server.middlewares.use('/resources', (req, res, next) => {
          if (!req.url) return next();
          const filePath = path.join(resourcesPath, decodeURIComponent(req.url));
          import('fs').then(fs => {
            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeTypes: Record<string, string> = {
                '.png': 'image/png',
                '.yml': 'text/yaml',
                '.yaml': 'text/yaml',
                '.json': 'application/json',
              };
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
              fs.createReadStream(filePath).pipe(res);
            } else {
              res.statusCode = 404;
              res.end('Not found');
            }
          });
        });

        // Prefab directory listing: returns { path, folder }[] for all .prefab.json files
        const prefabsPath = path.resolve(__dirname, 'public/prefabs');
        server.middlewares.use('/__api/prefabs', (_req, res) => {
          import('fs').then(fs => {
            if (!fs.existsSync(prefabsPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.end('[]');
              return;
            }
            const results: { path: string; folder: string }[] = [];
            function walk(dir: string, folder: string) {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  walk(full, folder ? `${folder}/${entry.name}` : entry.name);
                } else if (entry.name.endsWith('.json')) {
                  results.push({
                    path: '/prefabs/' + path.relative(prefabsPath, full).replace(/\\/g, '/'),
                    folder: folder || '',
                  });
                }
              }
            }
            walk(prefabsPath, '');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results));
          });
        });

        server.middlewares.use('/resources-list', (req, res, next) => {
          if (!req.url) return next();
          const url = new URL(req.url, 'http://localhost');
          const dir = url.searchParams.get('dir') || '';
          const ext = url.searchParams.get('ext') || '.yml';
          const targetDir = path.join(resourcesPath, dir);

          import('fs').then(fs => {
            if (!fs.existsSync(targetDir)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end('[]');
              return;
            }
            const results: string[] = [];
            function walk(currentDir: string) {
              for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
                const full = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                  walk(full);
                } else if (entry.name.endsWith(ext)) {
                  results.push('/' + path.relative(resourcesPath, full).replace(/\\/g, '/'));
                }
              }
            }
            walk(targetDir);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results));
          });
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
    // In production, resources are in public/resources/ which gets copied to dist/resources/
  },
  server: {
    port: 5174,
    fs: {
      allow: [
        path.resolve(__dirname, '../../Resources'),
        path.resolve(__dirname),
      ],
    },
  },
});
