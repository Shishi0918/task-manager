import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AuthRequest } from '../types/index.js';

const timeStringSchema = z.string().transform((val) => {
  if (!val || val === '') return null;
  return val;
}).pipe(z.string().regex(/^\d{2}:\d{2}$/).nullable());

const sourceTypeSchema = z.enum(['monthly', 'yearly', 'spot', 'weekly', 'daily']).nullable().optional();

const createTaskSchema = z.object({
  name: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  displayOrder: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: timeStringSchema.optional().nullable(),
  endTime: timeStringSchema.optional().nullable(),
  sourceType: sourceTypeSchema,
  parentId: z.string().uuid().nullable().optional(),
});

const updateTaskSchema = z.object({
  name: z.string().optional(),
  displayOrder: z.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startTime: timeStringSchema.optional().nullable(),
  endTime: timeStringSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const getTasks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    // ユーザーのタスクを取得（親子関係を含む）
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.userId!,
        isActive: true,
        year: yearNum,
        month: monthNum,
      },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    // ルートレベルのタスクのみを返す（parentIdがnull）
    const rootTasks = tasks.filter(task => task.parentId === null);

    res.json({ tasks: rootTasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { name, year, month, displayOrder, startDate, endDate, startTime, endTime, sourceType, parentId } = createTaskSchema.parse(req.body);

    const task = await prisma.task.create({
      data: {
        userId: req.userId!,
        name,
        year,
        month,
        displayOrder,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        sourceType: sourceType ?? null,
        parentId: parentId || null,
      },
      include: {
        children: true,
      },
    });

    res.status(201).json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, displayOrder, startDate, endDate, startTime, endTime, isActive, isCompleted, parentId } = updateTaskSchema.parse(req.body);

    // タスクの所有者確認
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // parentIdが指定されている場合、循環参照をチェック
    if (parentId !== undefined && parentId !== null) {
      // 自分自身を親にできない
      if (parentId === id) {
        res.status(400).json({ error: 'A task cannot be its own parent' });
        return;
      }

      // 自分の子孫を親にできない（循環参照防止）
      const isDescendant = await checkIsDescendant(id, parentId);
      if (isDescendant) {
        res.status(400).json({ error: 'Cannot set a descendant as parent (circular reference)' });
        return;
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(startTime !== undefined && { startTime: startTime ?? null }),
        ...(endTime !== undefined && { endTime: endTime ?? null }),
        ...(isActive !== undefined && { isActive }),
        ...(isCompleted !== undefined && { isCompleted }),
        ...(parentId !== undefined && { parentId: parentId }),
      },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    res.json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 循環参照チェック用のヘルパー関数
async function checkIsDescendant(taskId: string, potentialParentId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: potentialParentId },
    select: { parentId: true },
  });

  if (!task) return false;
  if (task.parentId === taskId) return true;
  if (task.parentId === null) return false;

  return checkIsDescendant(taskId, task.parentId);
}

export const deleteTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // タスクの所有者確認
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

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

    // ユーザーの未完了タスクを取得
    const incompleteTasks = await prisma.task.findMany({
      where: {
        userId: req.userId!,
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

    // Step 1: 全タスクを作成（parentIdなし）
    const createPromises = incompleteTasks.map((task) =>
      prisma.task.create({
        data: {
          userId: req.userId!,
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

    const createdTasks = await Promise.all(createPromises);

    // Step 2: 旧IDから新IDへのマッピングを作成
    const oldIdToNewId = new Map<string, string>();
    incompleteTasks.forEach((task, index) => {
      oldIdToNewId.set(task.id, createdTasks[index].id);
    });

    // Step 3: parentIdを持つタスクを更新（親も繰越対象の場合のみ）
    const updatePromises: Promise<any>[] = [];
    incompleteTasks.forEach((task, index) => {
      if (task.parentId && oldIdToNewId.has(task.parentId)) {
        const newTaskId = createdTasks[index].id;
        const newParentId = oldIdToNewId.get(task.parentId)!;
        updatePromises.push(
          prisma.task.update({
            where: { id: newTaskId },
            data: { parentId: newParentId },
          })
        );
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

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
