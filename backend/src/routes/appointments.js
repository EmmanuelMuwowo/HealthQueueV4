const express = require('express');
const router = express.Router();
const {
  bookAppointment, listAppointments, cancelAppointment, checkIn,
} = require('../controllers/appointmentController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('receptionist', 'manager', 'admin'), listAppointments);
router.post('/', authenticate, authorize('receptionist', 'admin'), bookAppointment);
router.put('/:id/cancel', authenticate, authorize('receptionist', 'admin'), cancelAppointment);
router.post('/:id/check-in', authenticate, authorize('receptionist', 'admin'), checkIn);

module.exports = router;