const express = require('express');
const router = express.Router();
const { searchPatients } = require('../controllers/patientController');
const { authenticate, authorize } = require('../middleware/auth');

// Names and phone numbers: receptionists and admins only
router.get('/search', authenticate, authorize('receptionist', 'admin'), searchPatients);

module.exports = router;