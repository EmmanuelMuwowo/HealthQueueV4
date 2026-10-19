const express = require('express');
const router = express.Router();
const {
  getQueue, callNext, startConsultation, completeConsultation, skipToken, requeueToken,
} = require('../controllers/queueController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/:servicePointId', authenticate,
  authorize('clinician', 'receptionist', 'manager', 'admin'), getQueue);
router.post('/:servicePointId/call-next', authenticate,
  authorize('clinician', 'admin'), callNext);
router.put('/tokens/:id/start', authenticate,
  authorize('clinician', 'admin'), startConsultation);
router.put('/tokens/:id/complete', authenticate,
  authorize('clinician', 'admin'), completeConsultation);
router.put('/tokens/:id/skip', authenticate,
  authorize('clinician', 'admin'), skipToken);
router.put('/tokens/:id/requeue', authenticate,
  authorize('clinician', 'admin'), requeueToken);

module.exports = router;