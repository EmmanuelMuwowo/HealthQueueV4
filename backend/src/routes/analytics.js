const express = require('express');
const router = express.Router();
const {
  getSummary, getByServicePoint, getTrend, listTokens, getTokenTimeline, exportCsv,
  getByCategory, getEwtAccuracy,
} = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

const managers = [authenticate, authorize('manager', 'admin')];

router.get('/summary', ...managers, getSummary);
router.get('/service-points', ...managers, getByServicePoint);
router.get('/trend', ...managers, getTrend);
router.get('/tokens', ...managers, listTokens);
router.get('/tokens/:id/timeline', ...managers, getTokenTimeline);
router.get('/export', ...managers, exportCsv);
router.get('/visit-types', ...managers, getByCategory);
router.get('/ewt-accuracy', ...managers, getEwtAccuracy);

module.exports = router;