import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function assigneeIds(
  assigneeId: string | null | undefined,
  assignments: { userId: string }[],
) {
  return [
    ...new Set(
      [assigneeId, ...assignments.map((assignment) => assignment.userId)].filter(
        Boolean,
      ),
    ),
  ] as string[];
}

function dueSoonLabel(dueDate: Date | null, tomorrow: Date) {
  return dueDate && dueDate >= tomorrow ? 'tomorrow' : 'today';
}

@Injectable()
export class NotificationsScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 6 * * *')
  async sendDueDateReminders() {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);

    const [tasks, subtasks] = await Promise.all([
      (this.prisma as any).task.findMany({
        where: {
          status: { not: 'Completed' },
          dueDate: { gte: today, lt: afterTomorrow },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          projectId: true,
          assigneeId: true,
          assignments: { select: { userId: true } },
        },
      }),
      (this.prisma as any).subtask.findMany({
        where: {
          isCompleted: false,
          dueDate: { gte: today, lt: afterTomorrow },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          assignments: { select: { userId: true } },
          task: { select: { id: true, title: true, projectId: true } },
        },
      }),
    ]);

    for (const task of tasks) {
      await this.notifications.notifyUsers(
        assigneeIds(task.assigneeId, task.assignments),
        'TASK_DUE_REMINDER',
        'Task due soon',
        `${task.title} is due ${dueSoonLabel(task.dueDate, tomorrow)}.`,
        {
          taskId: task.id,
          projectId: task.projectId,
          dueDate: task.dueDate,
          url: `/projects/${task.projectId}?task=${task.id}`,
        },
      );
    }

    for (const subtask of subtasks) {
      await this.notifications.notifyUsers(
        assigneeIds(null, subtask.assignments),
        'SUBTASK_DUE_REMINDER',
        'Subtask due soon',
        `${subtask.title} is due ${dueSoonLabel(subtask.dueDate, tomorrow)}.`,
        {
          subtaskId: subtask.id,
          taskId: subtask.task.id,
          projectId: subtask.task.projectId,
          dueDate: subtask.dueDate,
          url: `/projects/${subtask.task.projectId}?task=${subtask.task.id}`,
        },
      );
    }
  }

  @Cron('0 7 * * *')
  async sendOverdueNudges() {
    const today = startOfDay(new Date());
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000);

    const tasks = await (this.prisma as any).task.findMany({
      where: {
        status: { not: 'Completed' },
        dueDate: { lt: today },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        projectId: true,
        assigneeId: true,
        assignments: { select: { userId: true } },
      },
    });

    if (tasks.length === 0) return;

    const recent = await (this.prisma as any).notification.findMany({
      where: {
        type: 'TASK_OVERDUE',
        createdAt: { gte: since },
      },
      select: { userId: true, metadata: true },
    });
    const alreadyNudged = new Set(
      recent.map((item: any) => {
        const taskId = item?.metadata?.taskId;
        return taskId ? `${item.userId}:${taskId}` : '';
      }),
    );

    for (const task of tasks) {
      const recipients = assigneeIds(task.assigneeId, task.assignments).filter(
        (userId) => !alreadyNudged.has(`${userId}:${task.id}`),
      );
      if (recipients.length === 0) continue;

      await this.notifications.notifyUsers(
        recipients,
        'TASK_OVERDUE',
        'Task is late',
        `${task.title} is past due.`,
        {
          taskId: task.id,
          projectId: task.projectId,
          dueDate: task.dueDate,
          url: `/projects/${task.projectId}?task=${task.id}`,
        },
      );
    }
  }
}
