import { Router } from 'express';
import {
  getCompletions,
  upsertCompletion,
  getStats,
} from '../controllers/completion.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = Router();

router.use(authMiddleware);
router.use(requireActiveSubscription);

router.get('/', getCompletions);
router.post('/', upsertCompletion);
router.get('/stats', getStats);

export default router;
