import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getYearlyTasks,
  bulkSaveYearlyTasks,
} from '../controllers/yearlyTask.controller.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/yearly-tasks - Get all yearly tasks for the user
router.get('/', getYearlyTasks);

// POST /api/yearly-tasks/bulk-save - Bulk save yearly tasks (replace all)
router.post('/bulk-save', bulkSaveYearlyTasks);

export default router;
