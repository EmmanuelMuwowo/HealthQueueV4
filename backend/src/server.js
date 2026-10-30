const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const app = express();

app.use(cors());
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
});