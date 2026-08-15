import { Injectable } from '@nestjs/common';
import { myProjectsWhere, myTasksWhere } from '../common/task-access';
import { PrismaService } from '../prisma/prisma.service';

const PRIORITY_WEIGHT: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

type ActivityEntry = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  completionPercentage: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const [metrics, activity, urgentTasks, continueData] = await Promise.all([
      this.getMetrics(userId),
      this.getActivity(userId),
      this.getUrgentTasks(userId),
      this.getContinue(userId),
    ]);

    return {
      metrics,
      activity,
      urgentTasks,
      continue: continueData,
    };
  }

  private async getMetrics(userId: string) {
    const today = this.startOfDay(new Date());
    const tomorrow = this.addDays(today, 1);
    const mine = myTasksWhere(userId);

    const [
      tasksDueToday,
      activeProjectsCount,
      totalSubtasks,
      completedSubtasks,
      totalTasks,
      completedTasks,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          AND: [
            mine,
            {
              status: { not: 'Completed' },
              dueDate: { gte: today, lt: tomorrow },
            },
          ],
        },
      }),
      this.prisma.project.count({
        where: { status: 'Active', ...myProjectsWhere(userId) },
      }),
      this.prisma.subtask.count({ where: { task: mine } }),
      this.prisma.subtask.count({
        where: { isCompleted: true, task: mine },
      }),
      this.prisma.task.count({ where: mine }),
      this.prisma.task.count({
        where: { AND: [mine, { status: 'Completed' }] },
      }),
    ]);

    let productivityPercentage = 0;
    if (totalSubtasks > 0) {
      productivityPercentage = Math.round(
        (completedSubtasks / totalSubtasks) * 100,
      );
    } else if (totalTasks > 0) {
      productivityPercentage = Math.round((completedTasks / totalTasks) * 100);
    }

    return {
      tasksDueToday,
      activeProjectsCount,
      productivityPercentage,
      _meta: {
        totalSubtasks,
        completedSubtasks,
        totalTasks,
      },
    };
  }

  private async getActivity(
    userId: string,
  ): Promise<Record<string, ActivityEntry[]>> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          myTasksWhere(userId),
          {
            OR: [
              { createdAt: { gte: oneYearAgo } },
              { dueDate: { gte: oneYearAgo } },
              { completedAt: { gte: oneYearAgo } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        project: { select: { id: true, name: true } },
        _count: { select: { subtasks: true } },
      },
    });

    const completedByTask = new Map<string, number>();
    if (tasks.length > 0) {
      const grouped = await this.prisma.subtask.groupBy({
        by: ['taskId'],
        where: {
          isCompleted: true,
          taskId: { in: tasks.map((task) => task.id) },
        },
        _count: { _all: true },
      });
      for (const row of grouped) {
        completedByTask.set(row.taskId, row._count._all);
      }
    }

    const map: Record<string, ActivityEntry[]> = {};

    for (const task of tasks) {
      const dateKey = this.resolveDateKey(task);
      const total = task._count.subtasks;
      const done = completedByTask.get(task.id) ?? 0;
      const completionPercentage =
        total === 0
          ? task.status === 'Completed'
            ? 100
            : 0
          : Math.round((done / total) * 1000) / 10;

      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate ? this.toDateString(task.dueDate) : null,
        projectId: task.project?.id ?? null,
        projectName: task.project?.name ?? null,
        completionPercentage,
      });
    }

    for (const key of Object.keys(map)) {
      map[key].sort(
        (a, b) => b.completionPercentage - a.completionPercentage,
      );
    }

    return map;
  }

  private async getUrgentTasks(userId: string) {
    const today = this.startOfDay(new Date());
    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [
          myTasksWhere(userId),
          {
            status: { not: 'Completed' },
            priority: { in: ['High', 'Critical'] },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      take: 6,
    });

    return tasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.project?.id ?? null,
        projectName: task.project?.name ?? null,
        priority: task.priority,
        urgency: this.mapUrgency(task.priority),
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        dueLabel: task.dueDate
          ? this.computeDueLabel(task.dueDate, today)
          : 'No due date',
        _dueTime: task.dueDate
          ? task.dueDate.getTime()
          : Number.MAX_SAFE_INTEGER,
        _weight: PRIORITY_WEIGHT[task.priority] ?? 0,
      }))
      .sort((a, b) => {
        if (a._dueTime !== b._dueTime) return a._dueTime - b._dueTime;
        return b._weight - a._weight;
      })
      .map(({ _dueTime, _weight, ...rest }) => rest);
  }

  private async getContinue(userId: string) {
    const today = this.startOfDay(new Date());
    const tomorrow = this.addDays(today, 1);
    const projectsWhere = myProjectsWhere(userId);

    const [lastProject, lastWhiteboard, dueToday] = await Promise.all([
      this.prisma.project.findFirst({
        where: projectsWhere,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, status: true, updatedAt: true },
      }),
      this.prisma.whiteboard.findFirst({
        where: {
          OR: [{ createdById: userId }, { members: { some: { userId } } }],
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          lastEditedAt: true,
          updatedAt: true,
          projectId: true,
        },
      }),
      this.prisma.task.findMany({
        where: {
          AND: [
            myTasksWhere(userId),
            {
              status: { not: 'Completed' },
              dueDate: { gte: today, lt: tomorrow },
            },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 4,
      }),
    ]);

    return {
      lastProject: lastProject
        ? {
            id: lastProject.id,
            name: lastProject.name,
            status: lastProject.status,
            updatedAt: lastProject.updatedAt.toISOString(),
          }
        : null,
      lastWhiteboard: lastWhiteboard
        ? {
            id: lastWhiteboard.id,
            title: lastWhiteboard.title?.trim() || 'Untitled board',
            projectId: lastWhiteboard.projectId ?? null,
            lastEditedAt: (
              lastWhiteboard.lastEditedAt ?? lastWhiteboard.updatedAt
            ).toISOString(),
          }
        : null,
      dueToday: dueToday.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        projectId: task.project?.id ?? null,
        projectName: task.project?.name ?? null,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      })),
    };
  }

  private mapUrgency(priority: string): string {
    if (priority === 'Critical' || priority === 'High') return 'Urgent';
    return priority;
  }

  private resolveDateKey(task: {
    status: string;
    completedAt: Date | null;
    dueDate: Date | null;
    createdAt: Date;
  }): string {
    if (task.status === 'Completed' && task.completedAt) {
      return this.toDateString(task.completedAt);
    }
    if (task.dueDate) {
      return this.toDateString(task.dueDate);
    }
    return this.toDateString(task.createdAt);
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private computeDueLabel(dueDate: Date, today: Date): string {
    const due = this.startOfDay(dueDate);
    const diffDays = Math.round(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `In ${diffDays} days`;
  }
}
