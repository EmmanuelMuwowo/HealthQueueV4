const express = require('express');
const router = express.Router();
const { getSummary, getByServicePoint, getTrend } = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/summary', authenticate, authorize('manager', 'admin'), getSummary);
router.get('/service-points', authenticate, authorize('manager', 'admin'), getByServicePoint);
router.get('/trend', authenticate, authorize('manager', 'admin'), getTrend);

module.exports = router;