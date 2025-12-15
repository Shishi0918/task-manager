import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createTaskSchema = z.object({
  name: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  displayOrder: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateTaskSchema = z.object({
  name: z.string().optional(),
  displayOrder: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
});

export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    const tasks = await prisma.task.findMany({
      where: {
        isActive: true,
        year: yearNum,
        month: monthNum,
      },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, year, month, displayOrder, startDate, endDate } = createTaskSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        name,
        year,
        month,
        displayOrder,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    res.status(201).json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, displayOrder, startDate, endDate, isActive, isCompleted } = updateTaskSchema.parse(req.body);

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(isCompleted !== undefined && { isCompleted }),
      },
    });

    res.json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTask = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.task.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const carryForwardTasks = async (
  req: Request,
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

    // 未完了タスクを取得
    const incompleteTasks = await prisma.task.findMany({
      where: {
        isActive: true,
        year: yearNum,
        month: monthNum,
        isCompleted: false,
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (incompleteTasks.length === 0) {
      res.json({ message: 'No incomplete tasks to carry forward', count: 0 });
      return;
    }

    // 翌月の年月を計算
    let nextYear = yearNum;
    let nextMonth = monthNum + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // 翌月の1日の日付文字列
    const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // 翌月にタスクを作成
    const createPromises = incompleteTasks.map((task) =>
      prisma.task.create({
        data: {
          name: task.name,
          year: nextYear,
          month: nextMonth,
          displayOrder: task.displayOrder,
          startDate: new Date(nextMonthFirstDay),
          endDate: new Date(nextMonthFirstDay),
          isActive: true,
          isCompleted: false,
        },
      })
    );

    await Promise.all(createPromises);

    // 当月の未完了タスクを削除
    const taskIds = incompleteTasks.map((task) => task.id);
    await prisma.task.deleteMany({
      where: {
        id: { in: taskIds },
      },
    });

    res.json({
      message: 'Tasks carried forward successfully',
      count: incompleteTasks.length,
      nextYear,
      nextMonth,
    });
  } catch (error) {
    console.error('Carry forward tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
