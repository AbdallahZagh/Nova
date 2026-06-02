import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Tasks the user owns, is a member of the project for, or is assigned to. */
function accessibleTasksWhere(userId: string) {
  return {
    OR: [
      { assigneeId: userId },
      {
        project: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      },
    ],
  };
}

const PRIORITY_WEIGHT: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Metrics ──────────────────────────────────────────────────────────────

  async getMetrics(userId: string) {
    const today = new Date();
    const accessible = accessibleTasksWhere(userId);

    const tasks = await (this.prisma as any).task.findMany({
      where: accessible,
      select: {
        status: true,
        dueDate: true,
        subtasks: { select: { isCompleted: true } },
      },
    });

    const tasksDueToday = tasks.filter(
      (t: any) =>
        t.dueDate &&
        t.status !== 'Completed' &&
        this.sameCalendarDay(new Date(t.dueDate), today),
    ).length;

    const activeProjectsCount = await (this.prisma as any).project.count({
      where: {
        status: 'Active',
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    let totalSubtasks = 0;
    let completedSubtasks = 0;

    for (const task of tasks) {
      totalSubtasks += task.subtasks.length;
      completedSubtasks += task.subtasks.filter((s: any) => s.isCompleted).length;
    }

    let productivityPercentage: number;

    if (totalSubtasks > 0) {
      productivityPercentage = Math.round((completedSubtasks / totalSubtasks) * 100);
    } else if (tasks.length > 0) {
      const doneTasks = tasks.filter((t: any) => t.status === 'Completed').length;
      productivityPercentage = Math.round((doneTasks / tasks.length) * 100);
    } else {
      productivityPercentage = 0;
    }

    return {
      tasksDueToday,
      activeProjectsCount,
      productivityPercentage,
      _meta: {
        totalSubtasks,
        completedSubtasks,
        totalTasks: tasks.length,
      },
    };
  }

  // ─── Activity heatmap ─────────────────────────────────────────────────────

  async getActivity(userId: string): Promise<Record<string, ActivityEntry[]>> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const tasks = await (this.prisma as any).task.findMany({
      where: {
        ...accessibleTasksWhere(userId),
        OR: [
          { createdAt: { gte: oneYearAgo } },
          { dueDate: { gte: oneYearAgo } },
          { completedAt: { gte: oneYearAgo } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        project: { select: { name: true } },
        subtasks: { select: { isCompleted: true } },
      },
    });

    const map: Record<string, ActivityEntry[]> = {};

    for (const task of tasks) {
      const dateKey = this.resolveDateKey(task);
      const completionPercentage = this.calcCompletion(task);

      if (!map[dateKey]) map[dateKey] = [];

      map[dateKey].push({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? this.toDateString(task.dueDate) : null,
        projectName: task.project?.name ?? null,
        completionPercentage,
      });
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => b.completionPercentage - a.completionPercentage);
    }

    return map;
  }

  // ─── Urgent tasks ─────────────────────────────────────────────────────────

  async getUrgentTasks(userId: string) {
    const tasks = await (this.prisma as any).task.findMany({
      where: {
        ...accessibleTasksWhere(userId),
        status: { not: 'Completed' },
        priority: { in: ['High', 'Critical'] },
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        project: { select: { name: true } },
      },
    });

    const today = this.startOfDay(new Date());

    const sorted = tasks
      .map((task: any) => ({
        id: task.id,
        title: task.title,
        projectName: task.project?.name ?? null,
        priority: task.priority,
        urgency: this.mapUrgency(task.priority),
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        dueLabel: task.dueDate
          ? this.computeDueLabel(task.dueDate, today)
          : 'No due date',
        _dueTime: task.dueDate ? new Date(task.dueDate).getTime() : Number.MAX_SAFE_INTEGER,
        _weight: PRIORITY_WEIGHT[task.priority] ?? 0,
      }))
      .sort((a: any, b: any) => {
        if (a._dueTime !== b._dueTime) return a._dueTime - b._dueTime;
        return b._weight - a._weight;
      })
      .slice(0, 6)
      .map(({ _dueTime, _weight, ...rest }: any) => rest);

    return sorted;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** UI label: High and Critical both surface as "Urgent" in the widget. */
  private mapUrgency(priority: string): string {
    if (priority === 'Critical' || priority === 'High') return 'Urgent';
    return priority;
  }

  private resolveDateKey(task: any): string {
    if (task.status === 'Completed' && task.completedAt) {
      return this.toDateString(task.completedAt);
    }
    if (task.dueDate) {
      return this.toDateString(task.dueDate);
    }
    return this.toDateString(task.createdAt);
  }

  private calcCompletion(task: any): number {
    const total: number = task.subtasks.length;
    if (total === 0) {
      return task.status === 'Completed' ? 100 : 0;
    }
    const done = task.subtasks.filter((s: any) => s.isCompleted).length;
    return Math.round((done / total) * 1000) / 10;
  }

  private sameCalendarDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private computeDueLabel(dueDate: Date, today: Date): string {
    const due = this.startOfDay(dueDate);
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `In ${diffDays} days`;
  }
}

interface ActivityEntry {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectName: string | null;
  completionPercentage: number;
}
