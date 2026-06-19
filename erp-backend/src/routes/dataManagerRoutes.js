const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const rbac = require('../middlewares/rbacMiddleware');
const dataManagerController = require('../controllers/dataManagerController');

router.post('/format', auth, rbac(['MANAGE_DATA']), dataManagerController.formatAllData);

module.exports = router;
