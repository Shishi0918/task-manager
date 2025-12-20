import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import taskRoutes from './routes/task.routes.js';
import completionRoutes from './routes/completion.routes.js';
import templateRoutes from './routes/template.routes.js';
import spotTaskRoutes from './routes/spotTask.routes.js';
import organizationRoutes from './routes/organization.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Standard middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/completions', completionRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/spot-tasks', spotTaskRoutes);
app.use('/api/organization', organizationRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
