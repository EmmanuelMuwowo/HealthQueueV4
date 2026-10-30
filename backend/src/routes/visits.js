const express = require('express');
const router = express.Router();
const { registerVisit, getServicePoints, getCategories } = require('../controllers/visitController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/service-points', getServicePoints);
router.get('/categories', getCategories);
router.post('/', authenticate, authorize('receptionist', 'admin'), registerVisit);

module.exports = router;