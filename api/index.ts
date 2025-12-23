import express, { Request, Response } from 'express';
import cors from 'cors';
import authRoutes from '../backend/src/routes/auth.routes.js';
import taskRoutes from '../backend/src/routes/task.routes.js';
import completionRoutes from '../backend/src/routes/completion.routes.js';
import templateRoutes from '../backend/src/routes/template.routes.js';
import organizationRoutes from '../backend/src/routes/organization.routes.js';
import spotTaskRoutes from '../backend/src/routes/spotTask.routes.js';
import yearlyTaskRoutes from '../backend/src/routes/yearlyTask.routes.js';
import weeklyTaskRoutes from '../backend/src/routes/weeklyTask.routes.js';
import dailyTaskRoutes from '../backend/src/routes/dailyTask.routes.js';
import projectRoutes from '../backend/src/routes/project.routes.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/completions', completionRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/spot-tasks', spotTaskRoutes);
app.use('/api/yearly-tasks', yearlyTaskRoutes);
app.use('/api/weekly-tasks', weeklyTaskRoutes);
app.use('/api/daily-tasks', dailyTaskRoutes);
app.use('/api/projects', projectRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Debug endpoint
app.get('/api/debug', (_req: Request, res: Response) => {
  res.json({
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + '...',
    hasJwtSecret: !!process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
});

// Vercel Serverless Function handler
export default async (req: Request, res: Response) => {
  await new Promise<void>((resolve) => {
    app(req, res);
    res.on('finish', resolve);
  });
};
