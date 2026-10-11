const express = require('express');
const router = express.Router();
const { getPublicQueue } = require('../controllers/publicController');

router.get('/queue', getPublicQueue);

module.exports = router;