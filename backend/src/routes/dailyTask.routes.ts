import { Router } from 'express';
import {
  getDailyTasks,
  createDailyTask,
  updateDailyTask,
  deleteDailyTask,
  bulkDeleteDailyTasks,
  bulkSaveDailyTasks,
} from '../controllers/dailyTask.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all daily tasks
router.get('/', getDailyTasks);

// Create a new daily task
router.post('/', createDailyTask);

// Bulk save (replace all)
router.post('/bulk-save', bulkSaveDailyTasks);

// Bulk delete
router.post('/bulk-delete', bulkDeleteDailyTasks);

// Update a daily task
router.patch('/:id', updateDailyTask);

// Delete a daily task
router.delete('/:id', deleteDailyTask);

export default router;
