import { Response } from 'express';
import { z } from 'zod';
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

    // Delete all existing yearly tasks for the user
    await prisma.yearlyTask.deleteMany({
      where: { userId: req.userId! },
    });

    // First pass: Create all tasks without parentId
    const createdTasks: { id: string; displayOrder: number }[] = [];
    if (tasks.length > 0) {
      for (const task of tasks) {
        const created = await prisma.yearlyTask.create({
          data: {
            name: task.name,
            displayOrder: task.displayOrder,
            implementationMonth: task.implementationMonth,
            startDay: task.startDay,
            endDay: task.endDay,
            userId: req.userId!,
          },
        });
        createdTasks.push({ id: created.id, displayOrder: created.displayOrder });
      }

      // Second pass: Update parentId for tasks that have it
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.parentIndex !== undefined && task.parentIndex !== null && task.parentIndex >= 0 && task.parentIndex < createdTasks.length) {
          const parentId = createdTasks[task.parentIndex].id;
          await prisma.yearlyTask.update({
            where: { id: createdTasks[i].id },
            data: { parentId },
          });
        }
      }
    }

    // Fetch and return the saved tasks with hierarchy
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

    const rootTasks = yearlyTasks.filter(task => task.parentId === null);

    res.json({
      message: 'Yearly tasks saved successfully',
      count: yearlyTasks.length,
      yearlyTasks: rootTasks,
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
