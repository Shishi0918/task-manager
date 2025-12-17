import { Router } from 'express';
import {
  createOrganization,
  getOrganization,
  inviteUser,
  acceptInvitation,
  removeUser,
  cancelInvitation,
  leaveOrganization,
} from '../controllers/organization.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.post('/', createOrganization);
router.get('/', getOrganization);
router.post('/invite', inviteUser);
router.post('/accept-invite', acceptInvitation);
router.delete('/users/:userId', removeUser);
router.delete('/invitations/:invitationId', cancelInvitation);
router.post('/leave', leaveOrganization);

export default router;
