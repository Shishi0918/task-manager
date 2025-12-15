import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

const saveTemplateSchema = z.object({
  templateName: z.string().min(1),
});

const applyTemplateSchema = z.object({
  templateName: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

const deleteTemplateSchema = z.object({
  templateName: z.string().min(1),
});

export const getTemplates = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // ユーザーのテンプレート一覧を取得（テンプレート名でグループ化）
    const templates = await prisma.taskTemplate.findMany({
      where: { userId: req.userId! },
      select: {
        templateName: true,
        createdAt: true,
        updatedAt: true,
      },
      distinct: ['templateName'],
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.query;
    const { templateName } = saveTemplateSchema.parse(req.body);

    if (!year || !month) {
      res.status(400).json({ error: 'Year and month are required' });
      return;
    }

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    // 現在の月のタスクを取得
    const tasks = await prisma.task.findMany({
      where: {
        isActive: true,
        year: yearNum,
        month: monthNum,
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (tasks.length === 0) {
      res.status(400).json({ error: 'No tasks found in the current month' });
      return;
    }

    // 同名の既存テンプレートを削除
    await prisma.taskTemplate.deleteMany({
      where: {
        userId: req.userId!,
        templateName,
      },
    });

    // 新しいテンプレートを作成
    const templates = tasks.map((task) => {
      // startDateとendDateから日のみを抽出
      let startDay: number | null = null;
      let endDay: number | null = null;

      if (task.startDate) {
        startDay = new Date(task.startDate).getDate();
      }
      if (task.endDate) {
        endDay = new Date(task.endDate).getDate();
      }

      return {
        userId: req.userId!,
        templateName,
        taskName: task.name,
        displayOrder: task.displayOrder,
        startDay,
        endDay,
      };
    });

    await prisma.taskTemplate.createMany({
      data: templates,
    });

    res.json({
      message: 'Template saved successfully',
      templateName,
      count: templates.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Save template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const applyTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName, year, month } = applyTemplateSchema.parse(req.body);

    // 指定されたテンプレートを取得
    const templates = await prisma.taskTemplate.findMany({
      where: {
        userId: req.userId!,
        templateName,
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (templates.length === 0) {
      res.status(400).json({ error: 'Template not found' });
      return;
    }

    // 指定された月の既存タスクを全削除
    await prisma.task.deleteMany({
      where: {
        year,
        month,
      },
    });

    // その月の日数を取得
    const daysInMonth = new Date(year, month, 0).getDate();

    // テンプレートから新しいタスクを作成
    for (const template of templates) {
      let startDateStr: string | undefined = undefined;
      let endDateStr: string | undefined = undefined;

      if (template.startDay && template.endDay) {
        // 月末日を超えないように調整
        const adjustedStartDay = Math.min(template.startDay, daysInMonth);
        const adjustedEndDay = Math.min(template.endDay, daysInMonth);

        startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`;
        endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`;
      }

      await prisma.task.create({
        data: {
          name: template.taskName,
          year,
          month,
          displayOrder: template.displayOrder,
          startDate: startDateStr ? new Date(startDateStr) : null,
          endDate: endDateStr ? new Date(endDateStr) : null,
        },
      });
    }

    res.json({
      message: 'Template applied successfully',
      templateName,
      count: templates.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Apply template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName } = deleteTemplateSchema.parse(req.body);

    // 指定されたテンプレートを削除
    const result = await prisma.taskTemplate.deleteMany({
      where: {
        userId: req.userId!,
        templateName,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({
      message: 'Template deleted successfully',
      templateName,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
