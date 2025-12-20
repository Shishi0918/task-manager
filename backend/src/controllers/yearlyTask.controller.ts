import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

const bulkSaveSchema = z.object({
  tasks: z.array(z.object({
    name: z.string(),
    displayOrder: z.number().int(),
    implementationMonth: z.number().int().min(1).max(12).nullable(),
    startDay: z.number().int().min(1).max(31).nullable(),
    endDay: z.number().int().min(1).max(31).nullable(),
    parentIndex: z.number().int().nullable().optional(),
  })),
});

// Get all yearly tasks for the user
export const getYearlyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const yearlyTasks = await prisma.yearlyTask.findMany({
      where: { userId: req.userId! },
      orderBy: { displayOrder: 'asc' },
      include: {
        children: {
          orderBy: { displayOrder: 'asc' },
          include: {
            children: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    // Return only root level tasks
    const rootTasks = yearlyTasks.filter(task => task.parentId === null);
    res.json({ yearlyTasks: rootTasks });
  } catch (error) {
    console.error('Get yearly tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk save yearly tasks (replace all)
export const bulkSaveYearlyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { tasks } = bulkSaveSchema.parse(req.body);
    const userId = req.userId!;

    // Use transaction for atomic operation
    await prisma.$transaction(async (tx) => {
      // Delete all existing yearly tasks for the user
      await tx.yearlyTask.deleteMany({
        where: { userId },
      });

      if (tasks.length === 0) {
        return;
      }

      // Generate UUIDs for all tasks upfront
      const taskIds = tasks.map(() => crypto.randomUUID());

      // Calculate parentId for each task based on parentIndex
      const tasksWithParentId = tasks.map((task, index) => {
        let parentId: string | null = null;
        if (task.parentIndex !== undefined && task.parentIndex !== null &&
            task.parentIndex >= 0 && task.parentIndex < taskIds.length) {
          parentId = taskIds[task.parentIndex];
        }
        return {
          id: taskIds[index],
          name: task.name,
          displayOrder: task.displayOrder,
          implementationMonth: task.implementationMonth,
          startDay: task.startDay,
          endDay: task.endDay,
          userId,
          parentId,
        };
      });

      // Use createMany for bulk insert (much faster than individual creates)
      await tx.yearlyTask.createMany({
        data: tasksWithParentId,
      });
    });

    // Return simple success response without re-fetching all data
    res.json({
      message: 'Yearly tasks saved successfully',
      count: tasks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Bulk save yearly tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
