import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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

const VALID_FILTERS: TimelineFilter[] = [
  'today',
  'tomorrow',
  'weekly',
  'monthly',
  'yearly',
];

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns tasks whose due date falls in the requested calendar window,
   * using the caller's timezone so "today" / "this month" match the Gantt.
   */
  async getProjectTimeline(
    userId: string,
    projectId?: string,
    filter?: string,
    tzOffsetMinutes?: string,
  ) {
    const offset = this.parseOffset(tzOffsetMinutes);
    const window = this.resolveWindow(filter, offset);

    const where: Record<string, any> = {
      dueDate: {
        not: null,
        gte: this.addDays(window.start, -1),
        lte: this.addDays(window.end, 1),
      },
    };

    if (projectId) {
      const project = await (this.prisma as any).project.findFirst({
        where: {
          id: projectId,
          OR: [{ ownerId: userId }, { members: { some: { userId } } }],
        },
        select: { id: true },
      });
      if (!project) {
        throw new ForbiddenException('You do not have access to this project');
      }
      where.projectId = projectId;
    } else {
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

    const todayStart = this.localMidnight(
      this.userCalendar(offset),
      offset,
    );

    return tasks
      .filter((task: any) => {
        const due = task.dueDate ? new Date(task.dueDate) : null;
        if (!due || Number.isNaN(due.getTime())) return false;
        return due >= window.start && due <= window.end;
      })
      .map((task: any) => {
        const due = new Date(task.dueDate);
        const open = task.status !== 'Completed';
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          startDate: new Date(task.createdAt).toISOString(),
          dueDate: due.toISOString(),
          completedAt: task.completedAt ?? null,
          overdue: open && due < todayStart,
          project: task.project ?? null,
          assignee: task.assignee ?? null,
          assignees: (task.assignments ?? []).map((assignment: any) => ({
            assignedAt: assignment.assignedAt,
            user: assignment.user,
          })),
          windowStart: window.start.toISOString(),
          windowEnd: window.end.toISOString(),
          windowLabel: window.label,
        };
      });
  }

  private resolveWindow(
    filter: string | undefined,
    tzOffsetMinutes: number,
  ): { start: Date; end: Date; label: string } {
    const f = (filter ?? 'monthly') as TimelineFilter;
    if (filter && !VALID_FILTERS.includes(f)) {
      throw new BadRequestException(
        `Invalid filter "${filter}". Allowed values: ${VALID_FILTERS.join(', ')}`,
      );
    }

    const cal = this.userCalendar(tzOffsetMinutes);

    switch (f) {
      case 'today':
        return {
          start: this.localMidnight(cal, tzOffsetMinutes),
          end: this.localEndOfDay(cal, tzOffsetMinutes),
          label: 'Today',
        };

      case 'tomorrow': {
        const tom = this.shiftCalendar(cal, 1);
        return {
          start: this.localMidnight(tom, tzOffsetMinutes),
          end: this.localEndOfDay(tom, tzOffsetMinutes),
          label: 'Tomorrow',
        };
      }

      case 'weekly': {
        const monday = this.shiftCalendar(cal, -this.daysSinceMonday(cal.weekday));
        const sunday = this.shiftCalendar(monday, 6);
        return {
          start: this.localMidnight(monday, tzOffsetMinutes),
          end: this.localEndOfDay(sunday, tzOffsetMinutes),
          label: 'This week',
        };
      }

      case 'yearly': {
        const start = { y: cal.y, m: 0, d: 1, weekday: 0 };
        const end = { y: cal.y, m: 11, d: 31, weekday: 0 };
        return {
          start: this.localMidnight(start, tzOffsetMinutes),
          end: this.localEndOfDay(end, tzOffsetMinutes),
          label: 'This year',
        };
      }

      case 'monthly':
      default: {
        const start = { y: cal.y, m: cal.m, d: 1, weekday: 0 };
        const lastDay = new Date(Date.UTC(cal.y, cal.m + 1, 0)).getUTCDate();
        const end = { y: cal.y, m: cal.m, d: lastDay, weekday: 0 };
        return {
          start: this.localMidnight(start, tzOffsetMinutes),
          end: this.localEndOfDay(end, tzOffsetMinutes),
          label: 'This month',
        };
      }
    }
  }

  /** JS getTimezoneOffset(): minutes to add to local to get UTC. UTC+3 → -180. */
  private parseOffset(raw?: string): number {
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.abs(n) > 14 * 60) return 0;
    return Math.trunc(n);
  }

  private userCalendar(tzOffsetMinutes: number) {
    const shifted = new Date(Date.now() - tzOffsetMinutes * 60_000);
    return {
      y: shifted.getUTCFullYear(),
      m: shifted.getUTCMonth(),
      d: shifted.getUTCDate(),
      weekday: shifted.getUTCDay(),
    };
  }

  private localMidnight(
    cal: { y: number; m: number; d: number },
    tzOffsetMinutes: number,
  ) {
    return new Date(Date.UTC(cal.y, cal.m, cal.d) + tzOffsetMinutes * 60_000);
  }

  private localEndOfDay(
    cal: { y: number; m: number; d: number },
    tzOffsetMinutes: number,
  ) {
    return new Date(
      Date.UTC(cal.y, cal.m, cal.d, 23, 59, 59, 999) + tzOffsetMinutes * 60_000,
    );
  }

  private shiftCalendar(
    cal: { y: number; m: number; d: number; weekday: number },
    days: number,
  ) {
    const next = new Date(Date.UTC(cal.y, cal.m, cal.d + days));
    return {
      y: next.getUTCFullYear(),
      m: next.getUTCMonth(),
      d: next.getUTCDate(),
      weekday: next.getUTCDay(),
    };
  }

  private daysSinceMonday(weekday: number) {
    return (weekday + 6) % 7;
  }

  private addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setTime(d.getTime() + days * 86_400_000);
    return d;
  }
}
