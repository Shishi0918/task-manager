import { Router } from 'express';
import {
  getSpotTasks,
  getSpotTasksByYearMonth,
  createSpotTask,
  updateSpotTask,
  deleteSpotTask,
  bulkDeleteSpotTasks,
  bulkSaveSpotTasks,
} from '../controllers/spotTask.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all spot tasks
router.get('/', getSpotTasks);

// Get spot tasks for a specific year/month
router.get('/:year/:month', getSpotTasksByYearMonth);

// Create a new spot task
router.post('/', createSpotTask);

// Bulk save (replace all)
router.post('/bulk-save', bulkSaveSpotTasks);

// Bulk delete
router.post('/bulk-delete', bulkDeleteSpotTasks);

// Update a spot task
router.patch('/:id', updateSpotTask);

// Delete a spot task
router.delete('/:id', deleteSpotTask);

export default router;
