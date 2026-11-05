const express = require('express');
const router = express.Router();
const {
  getConfig, updateServicePoint, updateVisitType, createVisitType,
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
 
// Settings are a management decision: clinic manager or administrator
const managers = [authenticate, authorize('manager', 'admin')];
 
router.get('/config', ...managers, getConfig);
router.put('/service-points/:id', ...managers, updateServicePoint);
router.put('/visit-types/:id', ...managers, updateVisitType);
router.post('/visit-types', ...managers, createVisitType);
 
module.exports = router;
 