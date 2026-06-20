const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const rbac = require('../middlewares/rbacMiddleware');
const partyController = require('../controllers/partyController');

router.get('/stats', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES']), partyController.getPartyStats);
router.post('/merge', auth, rbac('MANAGE_PARTIES'), partyController.mergeParties);
router.get('/deleted', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES']), partyController.getDeletedParties);
router.post('/:id/restore', auth, rbac('MANAGE_PARTIES'), partyController.restoreParty);
router.delete('/:id/permanent', auth, rbac('MANAGE_PARTIES'), partyController.permanentlyDeleteParty);
router.get('/', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES']), partyController.getParties);
router.get('/:id', auth, rbac(['MANAGE_PARTIES', 'VIEW_PARTIES', 'CREATE_PARTIES']), partyController.getPartyById);
router.post('/bulk-delete', auth, rbac('MANAGE_PARTIES'), partyController.bulkDeleteParties);
router.post('/import', auth, rbac(['MANAGE_PARTIES', 'CREATE_PARTIES']), partyController.importParties);
router.post('/', auth, rbac(['MANAGE_PARTIES', 'CREATE_PARTIES']), partyController.createParty);
router.put('/:id', auth, rbac('MANAGE_PARTIES'), partyController.updateParty);
router.delete('/:id', auth, rbac('MANAGE_PARTIES'), partyController.deleteParty);
router.post('/:id/link-company', auth, rbac('MANAGE_PARTIES'), partyController.linkPartyToCompany);
router.post('/:id/unlink-company', auth, rbac('MANAGE_PARTIES'), partyController.unlinkPartyFromCompany);

module.exports = router;
