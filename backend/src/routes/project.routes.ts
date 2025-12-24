import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  bulkDeleteProjects,
  getMembers,
  addMember,
  updateMember,
  deleteMember,
  bulkSaveMembers,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  bulkDeleteTasks,
  bulkUpdateTasks,
  bulkCreateTasks,
} from '../controllers/project.controller.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Project routes
router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/bulk-delete', bulkDeleteProjects);

// Member routes
router.get('/:id/members', getMembers);
router.post('/:id/members', addMember);
router.put('/:id/members/:memberId', updateMember);
router.delete('/:id/members/:memberId', deleteMember);
router.post('/:id/members/bulk-save', bulkSaveMembers);

// Task routes
router.get('/:id/tasks', getTasks);
router.post('/:id/tasks', createTask);
router.put('/:id/tasks/:taskId', updateTask);
router.delete('/:id/tasks/:taskId', deleteTask);
router.post('/:id/tasks/bulk-delete', bulkDeleteTasks);
router.post('/:id/tasks/bulk-update', bulkUpdateTasks);
router.post('/:id/tasks/bulk-create', bulkCreateTasks);

export default router;
