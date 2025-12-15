import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

const completionSchema = z.object({
  taskId: z.string().uuid(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isCompleted: z.boolean(),
});

export const getCompletions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0);

    const tasks = await prisma.task.findMany({
      where: {
        isActive: true,
        year: yearNum,
        month: monthNum,
      },
      orderBy: { displayOrder: 'asc' },
      include: {
        completions: {
          where: {
            userId: req.userId,
            targetDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });

    const tasksWithCompletions = tasks.map((task) => {
      const completions: Record<string, boolean> = {};

      task.completions.forEach((completion) => {
        const dateStr = completion.targetDate.toISOString().split('T')[0];
        completions[dateStr] = completion.isCompleted;
      });

      return {
        id: task.id,
        name: task.name,
        displayOrder: task.displayOrder,
        startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
        endDate: task.endDate ? task.endDate.toISOString().split('T')[0] : null,
        isCompleted: task.isCompleted,
        completions,
      };
    });

    res.json({
      year: yearNum,
      month: monthNum,
      tasks: tasksWithCompletions,
    });
  } catch (error) {
    console.error('Get completions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const upsertCompletion = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { taskId, targetDate, isCompleted } = completionSchema.parse(
      req.body
    );

    const completion = await prisma.taskCompletion.upsert({
      where: {
        taskId_userId_targetDate: {
          taskId,
          userId: req.userId!,
          targetDate: new Date(targetDate),
        },
      },
      update: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
      create: {
        taskId,
        userId: req.userId!,
        targetDate: new Date(targetDate),
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    res.json({
      id: completion.id,
      taskId: completion.taskId,
      targetDate: completion.targetDate.toISOString().split('T')[0],
      isCompleted: completion.isCompleted,
      completedAt: completion.completedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Upsert completion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0);

    const totalTasks = await prisma.task.count({
      where: {
        isActive: true,
        year: yearNum,
        month: monthNum,
      },
    });

    const daysInMonth = endDate.getDate();
    const totalPossibleCompletions = totalTasks * daysInMonth;

    const completedCount = await prisma.taskCompletion.count({
      where: {
        userId: req.userId,
        targetDate: {
          gte: startDate,
          lte: endDate,
        },
        isCompleted: true,
      },
    });

    const completionRate =
      totalPossibleCompletions > 0
        ? (completedCount / totalPossibleCompletions) * 100
        : 0;

    res.json({
      year: yearNum,
      month: monthNum,
      totalTasks,
      daysInMonth,
      completedCount,
      totalPossibleCompletions,
      completionRate: Math.round(completionRate * 100) / 100,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
