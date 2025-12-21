import { Router } from 'express';
import {
  getWeeklyTasks,
  createWeeklyTask,
  updateWeeklyTask,
  updateSchedule,
  deleteSchedule,
  deleteWeeklyTask,
  bulkDeleteWeeklyTasks,
  bulkSaveWeeklyTasks,
} from '../controllers/weeklyTask.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all weekly tasks
router.get('/', getWeeklyTasks);

// Create a new weekly task
router.post('/', createWeeklyTask);

// Bulk save (replace all)
router.post('/bulk-save', bulkSaveWeeklyTasks);

// Bulk delete
router.post('/bulk-delete', bulkDeleteWeeklyTasks);

// Update a weekly task
router.patch('/:id', updateWeeklyTask);

// Update schedule for a specific day
router.put('/:id/schedule', updateSchedule);

// Delete schedule for a specific day
router.delete('/:id/schedule/:dayOfWeek', deleteSchedule);

// Delete a weekly task
router.delete('/:id', deleteWeeklyTask);

export default router;
