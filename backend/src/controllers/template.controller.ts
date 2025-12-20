import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

// Helper function to get the previous business day (skip weekends)
const getPreviousBusinessDay = (year: number, month: number, day: number): number => {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  // If it's Saturday (6), go back 1 day to Friday
  if (dayOfWeek === 6) {
    return Math.max(1, day - 1);
  }
  // If it's Sunday (0), go back 2 days to Friday
  if (dayOfWeek === 0) {
    return Math.max(1, day - 2);
  }
  // Otherwise it's a weekday, return as is
  return day;
};

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

const saveMonthlyTemplateSchema = z.object({
  templateName: z.string().min(1),
  tasks: z.array(z.object({
    name: z.string(),
    displayOrder: z.number().int(),
    startDay: z.number().int().min(1).max(31).nullable(),
    endDay: z.number().int().min(1).max(31).nullable(),
  })),
});

const saveYearlyTemplateSchema = z.object({
  templateName: z.string().min(1),
  tasks: z.array(z.object({
    name: z.string(),
    displayOrder: z.number().int(),
    startMonth: z.number().int().min(1).max(12).nullable(),
    endMonth: z.number().int().min(101).max(3131).nullable(), // (startDay * 100 + endDay) の形式: 101〜3131
  })),
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

export const getTemplateDetails = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName } = req.params;

    if (!templateName) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }

    // 指定されたテンプレートの全タスクを取得
    const templates = await prisma.taskTemplate.findMany({
      where: {
        userId: req.userId!,
        templateName: decodeURIComponent(templateName),
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (templates.length === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const tasks = templates.map((template) => ({
      name: template.taskName,
      displayOrder: template.displayOrder,
      startDay: template.startDay,
      endDay: template.endDay,
    }));

    res.json({
      templateName: templates[0].templateName,
      tasks,
    });
  } catch (error) {
    console.error('Get template details error:', error);
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
      res.status(400).json({ error: error.issues });
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

    // 指定された月のユーザーの既存タスクを全削除
    await prisma.task.deleteMany({
      where: {
        userId: req.userId!,
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
        let adjustedStartDay = Math.min(template.startDay, daysInMonth);
        let adjustedEndDay = Math.min(template.endDay, daysInMonth);

        // 開始日が土日の場合、直近の前の営業日に調整
        adjustedStartDay = getPreviousBusinessDay(year, month, adjustedStartDay);

        // 終了日も同様に調整（開始日より前にならないように）
        adjustedEndDay = Math.max(adjustedStartDay, adjustedEndDay);

        startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedStartDay).padStart(2, '0')}`;
        endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(adjustedEndDay).padStart(2, '0')}`;
      }

      await prisma.task.create({
        data: {
          userId: req.userId!,
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
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Apply template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveMonthlyTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName, tasks } = saveMonthlyTemplateSchema.parse(req.body);

    // 同名の既存テンプレートを削除
    await prisma.taskTemplate.deleteMany({
      where: {
        userId: req.userId!,
        templateName,
      },
    });

    // tasksが空でない場合のみ新しいテンプレートを作成
    if (tasks.length > 0) {
      // 新しいテンプレートを作成
      const templates = tasks.map((task) => ({
        userId: req.userId!,
        templateName,
        taskName: task.name,
        displayOrder: task.displayOrder,
        startDay: task.startDay,
        endDay: task.endDay,
      }));

      await prisma.taskTemplate.createMany({
        data: templates,
      });
    }

    res.json({
      message: 'Monthly template saved successfully',
      templateName,
      count: tasks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Save monthly template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveYearlyTemplate = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName, tasks } = saveYearlyTemplateSchema.parse(req.body);

    // 同名の既存テンプレートを削除
    await prisma.taskTemplate.deleteMany({
      where: {
        userId: req.userId!,
        templateName,
      },
    });

    // tasksが空でない場合のみ新しいテンプレートを作成
    if (tasks.length > 0) {
      // 新しいテンプレートを作成（startMonth/endMonthをstartDay/endDayに保存）
      const templates = tasks.map((task) => ({
        userId: req.userId!,
        templateName,
        taskName: task.name,
        displayOrder: task.displayOrder,
        startDay: task.startMonth,
        endDay: task.endMonth,
      }));

      await prisma.taskTemplate.createMany({
        data: templates,
      });
    }

    res.json({
      message: 'Yearly template saved successfully',
      templateName,
      count: tasks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Save yearly template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getYearlyTemplateDetails = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { templateName } = req.params;

    if (!templateName) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }

    // 指定されたテンプレートの全タスクを取得
    const templates = await prisma.taskTemplate.findMany({
      where: {
        userId: req.userId!,
        templateName: decodeURIComponent(templateName),
      },
      orderBy: { displayOrder: 'asc' },
    });

    if (templates.length === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const tasks = templates.map((template) => ({
      name: template.taskName,
      displayOrder: template.displayOrder,
      startMonth: template.startDay,
      endMonth: template.endDay,
    }));

    res.json({
      templateName: templates[0].templateName,
      tasks,
    });
  } catch (error) {
    console.error('Get yearly template details error:', error);
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
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
