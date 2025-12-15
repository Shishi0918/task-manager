import { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  carryForwardTasks,
} from '../controllers/task.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getTasks);
router.post('/', createTask);
router.post('/carry-forward', carryForwardTasks);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
