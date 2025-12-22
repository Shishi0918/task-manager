import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

const createDailyTaskSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

const updateDailyTaskSchema = z.object({
  name: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const timeStringSchema = z.union([
  z.string().regex(/^\d{2}:\d{2}$/).transform((val) => val),
  z.string().length(0).transform(() => null),
  z.null(),
]);

const bulkSaveSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    displayOrder: z.number().int(),
    startTime: timeStringSchema.optional().nullable(),
    endTime: timeStringSchema.optional().nullable(),
    parentIndex: z.number().int().nullable().optional(),
  })),
});

// Get all daily tasks for the user
export const getDailyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const dailyTasks = await prisma.dailyTask.findMany({
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
    const rootTasks = dailyTasks.filter(task => task.parentId === null);
    res.json({ dailyTasks: rootTasks });
  } catch (error) {
    console.error('Get daily tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new daily task
export const createDailyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = createDailyTaskSchema.parse(req.body);

    const dailyTask = await prisma.dailyTask.create({
      data: {
        ...data,
        userId: req.userId!,
      },
    });

    res.status(201).json({ dailyTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create daily task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a daily task
export const updateDailyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateDailyTaskSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.dailyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Daily task not found' });
      return;
    }

    const dailyTask = await prisma.dailyTask.update({
      where: { id },
      data,
    });

    res.json({ dailyTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update daily task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a daily task
export const deleteDailyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.dailyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Daily task not found' });
      return;
    }

    await prisma.dailyTask.delete({
      where: { id },
    });

    res.json({ message: 'Daily task deleted successfully' });
  } catch (error) {
    console.error('Delete daily task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk delete daily tasks
export const bulkDeleteDailyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Task IDs are required' });
      return;
    }

    // Delete only tasks owned by the user
    const result = await prisma.dailyTask.deleteMany({
      where: {
        id: { in: ids },
        userId: req.userId!,
      },
    });

    res.json({
      message: 'Daily tasks deleted successfully',
      count: result.count,
    });
  } catch (error) {
    console.error('Bulk delete daily tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk save daily tasks (replace all)
export const bulkSaveDailyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { tasks } = bulkSaveSchema.parse(req.body);
    const userId = req.userId!;

    // Use transaction for atomic operation
    await prisma.$transaction(async (tx) => {
      // Delete all existing daily tasks for the user
      await tx.dailyTask.deleteMany({
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
          startTime: task.startTime ?? null,
          endTime: task.endTime ?? null,
          userId,
          parentId,
        };
      });

      // Create all tasks
      await tx.dailyTask.createMany({
        data: tasksWithParentId,
      });
    });

    // Return simple success response
    res.json({
      message: 'Daily tasks saved successfully',
      count: tasks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Bulk save daily tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
