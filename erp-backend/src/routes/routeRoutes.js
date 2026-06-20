const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const rbac = require('../middlewares/rbacMiddleware');
const routeController = require('../controllers/routeController');

router.get('/deleted', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES']), routeController.getDeletedRoutes);
router.post('/:id/restore', auth, rbac(['MANAGE_PARTIES']), routeController.restoreRoute);
router.delete('/:id/permanent', auth, rbac(['MANAGE_PARTIES']), routeController.permanentlyDeleteRoute);
router.get('/', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES']), routeController.getRoutes);
router.get('/:id', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES']), routeController.getRouteById);
router.post('/bulk-delete', auth, rbac(['MANAGE_PARTIES']), routeController.bulkDeleteRoutes);
router.post('/', auth, rbac(['MANAGE_PARTIES']), routeController.createRoute);
router.put('/:id', auth, rbac(['MANAGE_PARTIES']), routeController.updateRoute);
router.delete('/:id', auth, rbac(['MANAGE_PARTIES']), routeController.deleteRoute);

module.exports = router;
