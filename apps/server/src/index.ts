import { startServer } from './http';

const port = Number(process.env.PORT ?? 8787);
const origins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);

startServer(port, origins, process.env.STATIC_DIR).then(s => {
  console.log(`shootdabih : serveur de jeu sur le port ${s.port()}`);
});

// filet de sécurité : une erreur imprévue est journalisée sans arrêter le serveur
process.on('uncaughtException', err => console.error('erreur non rattrapée', err));
process.on('unhandledRejection', err => console.error('promesse rejetée', err));
