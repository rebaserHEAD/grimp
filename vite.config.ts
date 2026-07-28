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
      name: 'serve-prefabs',
      configureServer(server) {
        // Prefab directory listing: returns { path, folder }[] for all .prefab.json files
        const prefabsPath = path.resolve(__dirname, 'public/prefabs');
        server.middlewares.use('/__api/prefabs', (_req, res) => {
          import('fs').then((fs) => {
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
      },
    },
  ],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5174,
  },
});
