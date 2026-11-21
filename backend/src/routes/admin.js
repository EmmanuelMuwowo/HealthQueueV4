const express = require('express');
const router = express.Router();
const {
  getConfig, updateServicePoint, createServicePoint, updateVisitType, createVisitType,
  listStaff, createStaff, updateStaff, resetStaffPassword,
} = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// Settings are a management decision: clinic manager or administrator
const managers = [authenticate, authorize('manager', 'admin')];

router.get('/config', ...managers, getConfig);
router.post('/service-points', ...managers, createServicePoint);
router.put('/service-points/:id', ...managers, updateServicePoint);
router.put('/visit-types/:id', ...managers, updateVisitType);
router.post('/visit-types', ...managers, createVisitType);

router.get('/staff', ...managers, listStaff);
router.post('/staff', ...managers, createStaff);
router.put('/staff/:id', ...managers, updateStaff);
router.post('/staff/:id/password', ...managers, resetStaffPassword);

module.exports = router;
