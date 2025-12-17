import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
});

const inviteSchema = z.object({
  email: z.string().email(),
});

// Create a new organization
export const createOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = createOrgSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.organizationId) {
      res.status(400).json({ error: 'User already belongs to an organization' });
      return;
    }

    // Set trial to 7 days from now
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create organization and update user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          trialEndsAt,
          subscriptionStatus: 'TRIALING',
        },
      });

      await tx.user.update({
        where: { id: req.userId },
        data: {
          organizationId: organization.id,
          planType: 'ORGANIZATION',
          role: 'ADMIN',
          // Clear individual subscription fields
          subscriptionStatus: 'EXPIRED',
          subscriptionId: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
        },
      });

      return organization;
    });

    res.status(201).json({ organization: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
};

// Get current organization
export const getOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        organization: {
          include: {
            users: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
                createdAt: true,
              },
            },
            invitations: {
              where: {
                expiresAt: { gt: new Date() },
              },
              select: {
                id: true,
                email: true,
                expiresAt: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.organization) {
      res.status(404).json({ error: 'No organization found' });
      return;
    }

    res.json({
      organization: user.organization,
      currentUserRole: user.role,
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
};

// Invite a user to organization
export const inviteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email } = inviteSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        organization: {
          include: {
            users: true,
            invitations: {
              where: {
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
      },
    });

    if (!user || !user.organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can invite users' });
      return;
    }

    // Check if max users reached
    const currentCount = user.organization.users.length + user.organization.invitations.length;
    if (currentCount >= user.organization.maxUsers) {
      res.status(400).json({ error: `Maximum ${user.organization.maxUsers} users allowed` });
      return;
    }

    // Check if email already in org
    const existingMember = user.organization.users.find(u => u.email === email);
    if (existingMember) {
      res.status(400).json({ error: 'User is already a member' });
      return;
    }

    // Check if invitation already exists
    const existingInvitation = user.organization.invitations.find(i => i.email === email);
    if (existingInvitation) {
      res.status(400).json({ error: 'Invitation already sent to this email' });
      return;
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.invitation.create({
      data: {
        organizationId: user.organization.id,
        email,
        token,
        expiresAt,
      },
    });

    // In production, send email with invitation link
    // For now, return the token
    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        // Include token for testing - in production, send via email
        inviteUrl: `${process.env.FRONTEND_URL}/join?token=${token}`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
};

// Accept invitation
export const acceptInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        organization: true,
      },
    });

    if (!invitation) {
      res.status(404).json({ error: 'Invalid invitation' });
      return;
    }

    if (invitation.expiresAt < new Date()) {
      res.status(400).json({ error: 'Invitation has expired' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.email !== invitation.email) {
      res.status(403).json({ error: 'Invitation is for a different email' });
      return;
    }

    if (user.organizationId) {
      res.status(400).json({ error: 'User already belongs to an organization' });
      return;
    }

    // Join organization
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.userId },
        data: {
          organizationId: invitation.organizationId,
          planType: 'ORGANIZATION',
          role: 'MEMBER',
          // Clear individual subscription
          subscriptionStatus: 'EXPIRED',
          subscriptionId: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
        },
      });

      await tx.invitation.delete({
        where: { id: invitation.id },
      });
    });

    res.json({
      message: 'Successfully joined organization',
      organization: invitation.organization,
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
};

// Remove user from organization (admin only)
export const removeUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;

    const admin = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { organization: true },
    });

    if (!admin || !admin.organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (admin.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can remove users' });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Cannot remove yourself' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.organizationId !== admin.organizationId) {
      res.status(404).json({ error: 'User not found in organization' });
      return;
    }

    // Remove user from organization
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        organizationId: null,
        planType: 'INDIVIDUAL',
        role: 'MEMBER',
        subscriptionStatus: 'EXPIRED',
      },
    });

    res.json({ message: 'User removed from organization' });
  } catch (error) {
    console.error('Remove user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
};

// Cancel invitation
export const cancelInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { invitationId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user || !user.organizationId) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can cancel invitations' });
      return;
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== user.organizationId) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    await prisma.invitation.delete({
      where: { id: invitationId },
    });

    res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
};

// Leave organization
export const leaveOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        organization: {
          include: { users: true },
        },
      },
    });

    if (!user || !user.organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Check if user is the only admin
    if (user.role === 'ADMIN') {
      const adminCount = user.organization.users.filter(u => u.role === 'ADMIN').length;
      if (adminCount === 1 && user.organization.users.length > 1) {
        res.status(400).json({ error: 'Cannot leave: you are the only admin. Transfer admin role first.' });
        return;
      }
    }

    // If last user, delete organization
    if (user.organization.users.length === 1) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.userId },
          data: {
            organizationId: null,
            planType: 'INDIVIDUAL',
            role: 'MEMBER',
            subscriptionStatus: 'EXPIRED',
          },
        });

        await tx.organization.delete({
          where: { id: user.organizationId! },
        });
      });
    } else {
      await prisma.user.update({
        where: { id: req.userId },
        data: {
          organizationId: null,
          planType: 'INDIVIDUAL',
          role: 'MEMBER',
          subscriptionStatus: 'EXPIRED',
        },
      });
    }

    res.json({ message: 'Left organization' });
  } catch (error) {
    console.error('Leave organization error:', error);
    res.status(500).json({ error: 'Failed to leave organization' });
  }
};
