const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const activityLogController = require('../controllers/activityLogController');

router.get('/', auth, activityLogController.getActivityLogs);
router.post('/', auth, activityLogController.createActivityLog);

module.exports = router;
