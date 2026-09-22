import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import emergencyRoutes from './routes/emergency.js';
import patientRoutes from './routes/patients.js';
import clinicalRoutes from './routes/clinical.js';
import catalogRoutes from './routes/catalog.js';
import alertRoutes from './routes/alerts.js';
import adminRoutes from './routes/admin.js';
import appointmentRoutes from './routes/appointments.js';
import pharmacyRoutes from './routes/pharmacy.js';
import { DEMO_USERS } from './seed.js';
import { ROLE_PERMISSIONS } from './permissions.js';
import { errorHandler, notFound } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'medagentx-api', time: new Date().toISOString() });
});

app.get('/api/meta', (req, res) => {
  res.json({
    roles: Object.keys(ROLE_PERMISSIONS),
    permissions: ROLE_PERMISSIONS,
    demoAccounts: DEMO_USERS.filter((u) => u.role !== 'patient'),
    workflow: [
      'Emergency Chat',
      'AI Triage',
      'Emergency ID',
      'Bed Allocation',
      'Doctor Assignment',
      'Doctor Alert',
      'Staff Alert',
      'Admission',
    ],
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api', clinicalRoutes);
app.use('/api', catalogRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/pharmacy', pharmacyRoutes);

// Serve the built frontend if it exists (single-service deployment mode).
const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.use('/api', notFound);
app.use(errorHandler);

export default app;
