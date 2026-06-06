import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TimelineFilter =
  | 'today'
  | 'tomorrow'
  | 'weekly'
  | 'monthly'
  | 'yearly';

const ASSIGNEE_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  roleTitle: true,
};

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns tasks for a project (or all accessible projects) that have a dueDate,
   * filtered to the requested time window, shaped for Gantt pill rendering.
   */
  async getProjectTimeline(
    userId: string,
    projectId?: string,
    filter?: string,
  ) {
    const window = this.resolveWindow(filter);

    const where: Record<string, any> = {
      dueDate: {
        not: null,
        gte: window.start,
        lte: window.end,
      },
    };

    if (projectId) {
      where.projectId = projectId;
    } else {
      // No specific project — return tasks across all projects the user owns or is a member of
      where.project = {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      };
    }

    const tasks = await (this.prisma as any).task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        dueDate: true,
        completedAt: true,
        projectId: true,
        project: { select: { id: true, name: true } },
        assignee: { select: ASSIGNEE_SELECT },
        assignments: {
          include: { user: { select: ASSIGNEE_SELECT } },
          orderBy: { assignedAt: 'asc' },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startDate: task.createdAt,
      dueDate: task.dueDate,
      completedAt: task.completedAt ?? null,
      project: task.project ?? null,
      assignee: task.assignee ?? null,
      assignees: (task.assignments ?? []).map((assignment: any) => ({
        assignedAt: assignment.assignedAt,
        user: assignment.user,
      })),
      // Convenience fields for the frontend grid
      windowStart: window.start,
      windowEnd: window.end,
      windowLabel: window.label,
    }));
  }

  // ─── Time window helpers ───────────────────────────────────────────────────

  private resolveWindow(filter?: string): {
    start: Date;
    end: Date;
    label: string;
  } {
    const now = new Date();
    const tod = this.startOfDay(now);

    const VALID: TimelineFilter[] = [
      'today',
      'tomorrow',
      'weekly',
      'monthly',
      'yearly',
    ];
    const f = (filter ?? 'monthly') as TimelineFilter;

    if (filter && !VALID.includes(f)) {
      throw new BadRequestException(
        `Invalid filter "${filter}". Allowed values: ${VALID.join(', ')}`,
      );
    }

    switch (f) {
      case 'today':
        return {
          start: tod,
          end: this.endOfDay(tod),
          label: 'Today',
        };

      case 'tomorrow': {
        const tom = this.addDays(tod, 1);
        return {
          start: tom,
          end: this.endOfDay(tom),
          label: 'Tomorrow',
        };
      }

      case 'weekly':
        return {
          start: tod,
          end: this.endOfDay(this.addDays(tod, 6)),
          label: 'This week',
        };

      case 'monthly':
        return {
          start: tod,
          end: this.endOfDay(this.addDays(tod, 29)),
          label: 'This month',
        };

      case 'yearly':
        return {
          start: tod,
          end: this.endOfDay(this.addDays(tod, 364)),
          label: 'This year',
        };
    }
  }

  private startOfDay(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    );
  }

  private endOfDay(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}
