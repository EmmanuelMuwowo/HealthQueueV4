const express = require('express');
const router = express.Router();
const { registerVisit, getServicePoints } = require('../controllers/visitController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/service-points', getServicePoints);
router.post('/', authenticate, authorize('receptionist', 'admin'), registerVisit);

module.exports = router;