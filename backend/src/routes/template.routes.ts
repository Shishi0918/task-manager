import { Router } from 'express';
import { getTemplates, saveTemplate, applyTemplate, deleteTemplate } from '../controllers/template.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getTemplates);
router.post('/save', saveTemplate);
router.post('/apply', applyTemplate);
router.delete('/delete', deleteTemplate);

export default router;
