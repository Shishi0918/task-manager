import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from '../backend/src/routes/auth.routes.js';
import taskRoutes from '../backend/src/routes/task.routes.js';
import completionRoutes from '../backend/src/routes/completion.routes.js';
import templateRoutes from '../backend/src/routes/template.routes.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/completions', completionRoutes);
app.use('/api/templates', templateRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Vercel Serverless Function handler
export default async (req: Request, res: Response) => {
  await new Promise<void>((resolve) => {
    app(req, res);
    res.on('finish', resolve);
  });
};
