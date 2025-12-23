import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types/index.js';
import { prisma } from '../utils/prisma.js';

// Schemas
const createProjectSchema = z.object({
  name: z.string().min(1),
  members: z.array(z.object({
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  })).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
});

const memberSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  displayOrder: z.number().int().optional(),
});

const taskSchema = z.object({
  name: z.string(),
  memberId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  displayOrder: z.number().int(),
  isCompleted: z.boolean().optional(),
});

// Get all projects for user
export const getProjects = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId! },
      include: {
        tasks: {
          select: {
            startDate: true,
            endDate: true,
          },
        },
        _count: {
          select: { tasks: true, members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate start/end dates from tasks
    const projectsWithDates = projects.map(project => {
      const startDates = project.tasks
        .map(t => t.startDate)
        .filter((d): d is Date => d !== null);
      const endDates = project.tasks
        .map(t => t.endDate)
        .filter((d): d is Date => d !== null);

      const startDate = startDates.length > 0
        ? new Date(Math.min(...startDates.map(d => d.getTime())))
        : null;
      const endDate = endDates.length > 0
        ? new Date(Math.max(...endDates.map(d => d.getTime())))
        : null;

      return {
        id: project.id,
        name: project.name,
        startDate: startDate?.toISOString().split('T')[0] ?? null,
        endDate: endDate?.toISOString().split('T')[0] ?? null,
        taskCount: project._count.tasks,
        memberCount: project._count.members,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    });

    res.json({ projects: projectsWithDates });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single project with members and tasks
export const getProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: req.userId!,
      },
      include: {
        members: {
          orderBy: { displayOrder: 'asc' },
        },
        tasks: {
          orderBy: { displayOrder: 'asc' },
          include: {
            member: true,
            children: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create project
export const createProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        name: data.name,
        userId: req.userId!,
        members: data.members ? {
          create: data.members.map((m, i) => ({
            name: m.name,
            color: m.color,
            displayOrder: i + 1,
          })),
        } : undefined,
      },
      include: {
        members: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    res.status(201).json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update project
export const updateProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await prisma.project.update({
      where: { id },
      data,
    });

    res.json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete project
export const deleteProject = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await prisma.project.delete({
      where: { id },
    });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk delete projects
export const bulkDeleteProjects = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Project IDs are required' });
      return;
    }

    const result = await prisma.project.deleteMany({
      where: {
        id: { in: ids },
        userId: req.userId!,
      },
    });

    res.json({ message: 'Projects deleted successfully', count: result.count });
  } catch (error) {
    console.error('Bulk delete projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get project members
export const getMembers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ members });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add member
export const addMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = memberSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get max display order
    const maxOrder = await prisma.projectMember.aggregate({
      where: { projectId: id },
      _max: { displayOrder: true },
    });

    const member = await prisma.projectMember.create({
      data: {
        projectId: id,
        name: data.name,
        color: data.color,
        displayOrder: data.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });

    res.status(201).json({ member });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update member
export const updateMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id, memberId } = req.params;
    const data = memberSchema.partial().parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const member = await prisma.projectMember.update({
      where: { id: memberId },
      data,
    });

    res.json({ member });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete member
export const deleteMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id, memberId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await prisma.projectMember.delete({
      where: { id: memberId },
    });

    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk save members (replace all)
export const bulkSaveMembers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { members } = req.body;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Delete all existing members and recreate
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: { projectId: id },
      });

      if (members && members.length > 0) {
        await tx.projectMember.createMany({
          data: members.map((m: { name: string; color: string }, i: number) => ({
            projectId: id,
            name: m.name,
            color: m.color,
            displayOrder: i + 1,
          })),
        });
      }
    });

    const updatedMembers = await prisma.projectMember.findMany({
      where: { projectId: id },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ members: updatedMembers });
  } catch (error) {
    console.error('Bulk save members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get project tasks
export const getTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const tasks = await prisma.projectTask.findMany({
      where: { projectId: id },
      orderBy: { displayOrder: 'asc' },
      include: {
        member: true,
      },
    });

    res.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create task
export const createTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = taskSchema.parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: id,
        name: data.name,
        memberId: data.memberId,
        parentId: data.parentId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        displayOrder: data.displayOrder,
        isCompleted: data.isCompleted ?? false,
      },
      include: {
        member: true,
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

// Update task
export const updateTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id, taskId } = req.params;
    const data = taskSchema.partial().parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.memberId !== undefined) updateData.memberId = data.memberId;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
    if (data.isCompleted !== undefined) updateData.isCompleted = data.isCompleted;

    const task = await prisma.projectTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        member: true,
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

// Delete task
export const deleteTask = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id, taskId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await prisma.projectTask.delete({
      where: { id: taskId },
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk delete tasks
export const bulkDeleteTasks = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { ids } = req.body;

    const project = await prisma.project.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await prisma.projectTask.deleteMany({
      where: {
        id: { in: ids },
        projectId: id,
      },
    });

    res.json({ message: 'Tasks deleted successfully', count: result.count });
  } catch (error) {
    console.error('Bulk delete tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
