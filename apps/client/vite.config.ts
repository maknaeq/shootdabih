import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// Version affichée sur la page d'accueil : commit et date de compilation, pour vérifier un déploiement.
const sh = (c: string) => { try { return execSync(c).toString().trim(); } catch { return ''; } };
const version = `${sh('git rev-parse --short HEAD') || 'dev'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(version) },
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 }
});
