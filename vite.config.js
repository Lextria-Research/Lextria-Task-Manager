import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-dev-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && (req.url.startsWith('/api/users') || req.url.startsWith('/api/clients'))) {
            try {
              const handlerModule = req.url.startsWith('/api/clients')
                ? await import('./api/clients.js')
                : await import('./api/users.js');
              const handler = handlerModule.default;
              
              // Parse JSON body if present
              let body = {};
              if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
                const buffers = [];
                for await (const chunk of req) {
                  buffers.push(chunk);
                }
                const data = Buffer.concat(buffers).toString();
                if (data) {
                  try {
                    body = JSON.parse(data);
                  } catch (e) {
                    body = {};
                  }
                }
              }
              req.body = body;

              // Mock Vercel response helper methods
              res.status = (statusCode) => {
                res.statusCode = statusCode;
                return res;
              };
              res.json = (jsonData) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(jsonData));
                return res;
              };

              return handler(req, res);
            } catch (err) {
              console.error('Dev API handler error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }
          next();
        });
      },
    },
  ],
});
