import app from './app.js';
import { get } from './db.js';
import { seed } from './seed.js';

const PORT = Number(process.env.PORT || 4000);

// Auto-seed master data on first boot so the app is immediately usable.
const count = get('SELECT COUNT(*) AS c FROM departments')?.c ?? 0;
if (count === 0) {
  console.log('Empty database detected — seeding hospital master data...');
  seed({ reset: false });
}

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const server = app.listen(PORT, () => {
  console.log(`\n  MedAgentX API listening on http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  Meta:    http://localhost:${PORT}/api/meta\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ERROR: port ${PORT} is already in use.`);
    console.error('  Another MedAgentX API (or other process) is already running.');
    console.error('  Stop it and restart:  pkill -f "src/server.js"  then  npm run dev');
    console.error('  Or use another port:  PORT=4100 npm run dev\n');
    process.exit(1);
  }
  throw err;
});

