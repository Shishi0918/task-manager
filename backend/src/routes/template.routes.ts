import { Router } from 'express';
import { getTemplates, getTemplateDetails, saveTemplate, applyTemplate, deleteTemplate, saveMonthlyTemplate, saveYearlyTemplate, getYearlyTemplateDetails } from '../controllers/template.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = Router();

router.use(authMiddleware);
router.use(requireActiveSubscription);

router.get('/', getTemplates);
router.get('/yearly/:templateName', getYearlyTemplateDetails);
router.get('/:templateName', getTemplateDetails);
router.post('/save', saveTemplate);
router.post('/save-monthly', saveMonthlyTemplate);
router.post('/save-yearly', saveYearlyTemplate);
router.post('/apply', applyTemplate);
router.delete('/delete', deleteTemplate);

export default router;
