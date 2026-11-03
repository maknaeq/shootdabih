import { startServer } from './http';

const port = Number(process.env.PORT ?? 8787);
const origins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);

startServer(port, origins, process.env.STATIC_DIR).then(s => {
  console.log(`shootdabih : serveur de jeu sur le port ${s.port()}`);
});
