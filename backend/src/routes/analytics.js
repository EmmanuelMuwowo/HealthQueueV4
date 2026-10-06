const express = require('express');
const router = express.Router();
const { getSummary, getByServicePoint } = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/summary', authenticate, authorize('manager', 'admin'), getSummary);
router.get('/service-points', authenticate, authorize('manager', 'admin'), getByServicePoint);

module.exports = router;