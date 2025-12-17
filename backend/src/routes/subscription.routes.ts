import { Router } from 'express';
import {
  getSubscriptionStatus,
  createCheckoutSession,
  createPortalSession,
} from '../controllers/subscription.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/status', getSubscriptionStatus);
router.post('/checkout', createCheckoutSession);
router.post('/portal', createPortalSession);

export default router;
