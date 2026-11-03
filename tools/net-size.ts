// Taille d'un snapshot pour N joueurs, avant et après le format compact.
import { packPlayer, type NetPlayer } from '../packages/shared/src/index';
const n = Number(process.argv[2] ?? 8);
const p = (i: number): NetPlayer => ({ id: 'p' + i, x: 12.3456789, y: 5.0000001, z: 33.987654, yaw: 1.23456789, pitch: -0.1234567, alive: true, vx: 8.7654321, vy: -3.2109876, vz: -1.2345678, dashReadyAt: 12.3456789, dashUntil: 10.2345678, padUntil: -1, onGround: false, time: 123.456789, jumpHeld: false, airJumps: 1, airJumpsMax: 1, abilityReadyAt: 100.123456, abilityUsedAt: 99.123456, overchargeUntil: 123456.789, pierceUntil: 0, shield: false, streak: 2, ability: 'grappin', abilityUntil: 1234567.89 });
const all = Array.from({ length: n }, (_, i) => p(i));
const before = JSON.stringify({ t: 'snapshot', time: 1234567.891, ack: 12345, players: all }).length;
const round = (o: object) => { const r = { ...o } as Record<string, unknown>; for (const k in r) if (typeof r[k] === 'number') r[k] = Math.round((r[k] as number) * 1000) / 1000; return r; };
const after = JSON.stringify({ t: 'snapshot', time: 1234567.891, ack: 12345, me: round(all[0]), o: all.slice(1).map(x => packPlayer(x)) }).length;
console.log(`${n} joueurs : ${before} octets avant, ${after} après, par joueur et par snapshot`);
console.log(`débit sortant du serveur à 30 Hz : ${(before * n * 30 / 1e6).toFixed(2)} Mo/s avant, ${(after * n * 30 / 1e6).toFixed(2)} Mo/s après`);
