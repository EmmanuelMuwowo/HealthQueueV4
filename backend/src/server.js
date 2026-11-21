const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const pool = require('./db');
 
const app = express();
 
// Standard security headers (SR10). The API is called from the web app on another port,
// so resources may be shared across origins; CORS below decides which origins may read them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Only the clinic's own web app may call the API from a browser (SR10).
// Requests with no Origin header (test scripts, the evaluation driver) are not browser
// requests and are allowed; they still need a valid login for protected routes.
const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:5180,http://localhost:4180,http://127.0.0.1:5180,http://127.0.0.1:4180')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, done) => {
    if (!origin || allowedOrigins.includes(origin)) return done(null, true);
    return done(null, false);
  },
}));
app.use(express.json());
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const visitRoutes = require('./routes/visits');
app.use('/api/visits', visitRoutes);
const queueRoutes = require('./routes/queue');
app.use('/api/queue', queueRoutes);
const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);
const publicRoutes = require('./routes/public');
app.use('/api/public', publicRoutes);
const appointmentRoutes = require('./routes/appointments');
app.use('/api/appointments', appointmentRoutes);
const patientRoutes = require('./routes/patients');
app.use('/api/patients', patientRoutes);
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
 
// Follow-up booking from the clinician screen (reminders are sent by the reminder job)
const { authenticate, authorize } = require('./middleware/auth');
const { bookFollowUp } = require('./controllers/appointmentController');
app.post('/api/follow-ups', authenticate, authorize('clinician', 'admin'), bookFollowUp);
const { startReminderScheduler } = require('./services/reminderService');
 
// Referral to another service point after a completed consultation
const { referPatient } = require('./controllers/referralController');
app.post('/api/referrals', authenticate, authorize('clinician', 'admin'), referPatient);
 
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM service_points');
    res.json({
      status: 'running',
      database: 'connected',
      service_points: parseInt(result.rows[0].count),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});
 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`HealthQueue v4 server running on port ${PORT}`);
  startReminderScheduler();
});