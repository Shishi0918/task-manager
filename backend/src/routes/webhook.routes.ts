import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/webhook.controller.js';

const router = Router();

// Webhook needs raw body for signature verification
// This route is configured with express.raw() in index.ts
router.post('/stripe', handleStripeWebhook);

export default router;
