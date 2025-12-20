import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

const createSpotTaskSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int(),
  implementationYear: z.number().int().min(2000).max(2100),
  implementationMonth: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31).nullable(),
  endDay: z.number().int().min(1).max(31).nullable(),
});

const updateSpotTaskSchema = z.object({
  name: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
  implementationYear: z.number().int().min(2000).max(2100).optional(),
  implementationMonth: z.number().int().min(1).max(12).optional(),
  startDay: z.number().int().min(1).max(31).nullable().optional(),
  endDay: z.number().int().min(1).max(31).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const bulkSaveSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    displayOrder: z.number().int(),
    implementationYear: z.number().int().min(2000).max(2100),
    implementationMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31).nullable(),
    endDay: z.number().int().min(1).max(31).nullable(),
    parentIndex: z.number().int().nullable().optional(), // Index of parent task in array
  })),
});

// Get all spot tasks for the user
export const getSpotTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const spotTasks = await prisma.spotTask.findMany({
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

    // ルートレベルのタスクのみを返す
    const rootTasks = spotTasks.filter(task => task.parentId === null);
    res.json({ spotTasks: rootTasks });
  } catch (error) {
    console.error('Get spot tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get spot tasks for a specific year and month
export const getSpotTasksByYearMonth = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.params;

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    const spotTasks = await prisma.spotTask.findMany({
      where: {
        userId: req.userId!,
        implementationYear: yearNum,
        implementationMonth: monthNum,
      },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ spotTasks });
  } catch (error) {
    console.error('Get spot tasks by year/month error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new spot task
export const createSpotTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = createSpotTaskSchema.parse(req.body);

    const spotTask = await prisma.spotTask.create({
      data: {
        ...data,
        userId: req.userId!,
      },
    });

    res.status(201).json({ spotTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create spot task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a spot task
export const updateSpotTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateSpotTaskSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.spotTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Spot task not found' });
      return;
    }

    const spotTask = await prisma.spotTask.update({
      where: { id },
      data,
    });

    res.json({ spotTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update spot task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a spot task
export const deleteSpotTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.spotTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Spot task not found' });
      return;
    }

    await prisma.spotTask.delete({
      where: { id },
    });

    res.json({ message: 'Spot task deleted successfully' });
  } catch (error) {
    console.error('Delete spot task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk delete spot tasks
export const bulkDeleteSpotTasks = async (
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
    const result = await prisma.spotTask.deleteMany({
      where: {
        id: { in: ids },
        userId: req.userId!,
      },
    });

    res.json({
      message: 'Spot tasks deleted successfully',
      count: result.count,
    });
  } catch (error) {
    console.error('Bulk delete spot tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk save spot tasks (replace all)
export const bulkSaveSpotTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { tasks } = bulkSaveSchema.parse(req.body);

    // Delete all existing spot tasks for the user
    await prisma.spotTask.deleteMany({
      where: { userId: req.userId! },
    });

    // First pass: Create all tasks without parentId
    const createdTasks: { id: string; displayOrder: number }[] = [];
    if (tasks.length > 0) {
      for (const task of tasks) {
        const created = await prisma.spotTask.create({
          data: {
            name: task.name,
            displayOrder: task.displayOrder,
            implementationYear: task.implementationYear,
            implementationMonth: task.implementationMonth,
            startDay: task.startDay,
            endDay: task.endDay,
            userId: req.userId!,
          },
        });
        createdTasks.push({ id: created.id, displayOrder: created.displayOrder });
      }

      // Second pass: Update parentId for tasks that have it
      // parentIndex is the index of the parent task in the array
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.parentIndex !== undefined && task.parentIndex !== null && task.parentIndex >= 0 && task.parentIndex < createdTasks.length) {
          const parentId = createdTasks[task.parentIndex].id;
          await prisma.spotTask.update({
            where: { id: createdTasks[i].id },
            data: { parentId },
          });
        }
      }
    }

    // Fetch and return the saved tasks with hierarchy
    const spotTasks = await prisma.spotTask.findMany({
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

    const rootTasks = spotTasks.filter(task => task.parentId === null);

    res.json({
      message: 'Spot tasks saved successfully',
      count: spotTasks.length,
      spotTasks: rootTasks,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Bulk save spot tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
