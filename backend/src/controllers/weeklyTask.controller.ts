import { Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const createWeeklyTaskSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int(),
  schedules: z.array(scheduleSchema).optional(),
});

const updateWeeklyTaskSchema = z.object({
  name: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

const bulkSaveSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    displayOrder: z.number().int(),
    parentIndex: z.number().int().nullable().optional(),
    schedules: z.array(scheduleSchema).optional(),
  })),
});

// Get all weekly tasks for the user
export const getWeeklyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const weeklyTasks = await prisma.weeklyTask.findMany({
      where: { userId: req.userId! },
      orderBy: { displayOrder: 'asc' },
      include: {
        schedules: true,
        children: {
          orderBy: { displayOrder: 'asc' },
          include: {
            schedules: true,
            children: {
              orderBy: { displayOrder: 'asc' },
              include: { schedules: true },
            },
          },
        },
      },
    });

    // Return only root level tasks
    const rootTasks = weeklyTasks.filter(task => task.parentId === null);
    res.json({ weeklyTasks: rootTasks });
  } catch (error) {
    console.error('Get weekly tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new weekly task
export const createWeeklyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = createWeeklyTaskSchema.parse(req.body);
    const { schedules, ...taskData } = data;

    const weeklyTask = await prisma.weeklyTask.create({
      data: {
        ...taskData,
        userId: req.userId!,
        schedules: schedules ? {
          create: schedules,
        } : undefined,
      },
      include: { schedules: true },
    });

    res.status(201).json({ weeklyTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create weekly task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a weekly task
export const updateWeeklyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateWeeklyTaskSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.weeklyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Weekly task not found' });
      return;
    }

    const weeklyTask = await prisma.weeklyTask.update({
      where: { id },
      data,
      include: { schedules: true },
    });

    res.json({ weeklyTask });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update weekly task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update schedule for a specific day
export const updateSchedule = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { dayOfWeek, startTime, endTime } = scheduleSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.weeklyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Weekly task not found' });
      return;
    }

    // Upsert the schedule
    const schedule = await prisma.weeklyTaskSchedule.upsert({
      where: {
        weeklyTaskId_dayOfWeek: {
          weeklyTaskId: id,
          dayOfWeek,
        },
      },
      create: {
        weeklyTaskId: id,
        dayOfWeek,
        startTime,
        endTime,
      },
      update: {
        startTime,
        endTime,
      },
    });

    res.json({ schedule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete schedule for a specific day
export const deleteSchedule = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id, dayOfWeek } = req.params;
    const day = parseInt(dayOfWeek);

    // Verify ownership
    const existing = await prisma.weeklyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Weekly task not found' });
      return;
    }

    await prisma.weeklyTaskSchedule.delete({
      where: {
        weeklyTaskId_dayOfWeek: {
          weeklyTaskId: id,
          dayOfWeek: day,
        },
      },
    });

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a weekly task
export const deleteWeeklyTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.weeklyTask.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Weekly task not found' });
      return;
    }

    await prisma.weeklyTask.delete({
      where: { id },
    });

    res.json({ message: 'Weekly task deleted successfully' });
  } catch (error) {
    console.error('Delete weekly task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk delete weekly tasks
export const bulkDeleteWeeklyTasks = async (
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
    const result = await prisma.weeklyTask.deleteMany({
      where: {
        id: { in: ids },
        userId: req.userId!,
      },
    });

    res.json({
      message: 'Weekly tasks deleted successfully',
      count: result.count,
    });
  } catch (error) {
    console.error('Bulk delete weekly tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk save weekly tasks (replace all)
export const bulkSaveWeeklyTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { tasks } = bulkSaveSchema.parse(req.body);
    const userId = req.userId!;

    // Use transaction for atomic operation
    await prisma.$transaction(async (tx) => {
      // Delete all existing weekly tasks for the user (schedules will cascade)
      await tx.weeklyTask.deleteMany({
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
          userId,
          parentId,
        };
      });

      // Create all tasks first
      await tx.weeklyTask.createMany({
        data: tasksWithParentId,
      });

      // Now create all schedules
      const allSchedules: {
        weeklyTaskId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      }[] = [];

      tasks.forEach((task, index) => {
        if (task.schedules && task.schedules.length > 0) {
          task.schedules.forEach(schedule => {
            allSchedules.push({
              weeklyTaskId: taskIds[index],
              dayOfWeek: schedule.dayOfWeek,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
            });
          });
        }
      });

      if (allSchedules.length > 0) {
        await tx.weeklyTaskSchedule.createMany({
          data: allSchedules,
        });
      }
    });

    // Return simple success response
    res.json({
      message: 'Weekly tasks saved successfully',
      count: tasks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Bulk save weekly tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
