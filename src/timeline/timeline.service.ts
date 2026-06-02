import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
   * Returns tasks for a project that have a dueDate set, shaped for Gantt rendering.
   * Each task carries:
   *   startDate  — task.createdAt  (left edge of the pill)
   *   dueDate    — task.dueDate    (right edge of the pill)
   *   status     — for colour-coding the pill track
   *   priority   — for visual weight / badge
   *   assignee   — avatar + name rendered inside the pill
   */
  async getProjectTimeline(projectId: string) {
    const tasks = await (this.prisma as any).task.findMany({
      where: {
        projectId,
        // Tasks without a dueDate cannot be positioned on a finite timeline axis
        dueDate: { not: null },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        dueDate: true,
        completedAt: true,
        assignee: { select: ASSIGNEE_SELECT },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Reshape: rename createdAt → startDate so the frontend never has to guess
    return tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startDate: task.createdAt,
      dueDate: task.dueDate,
      completedAt: task.completedAt ?? null,
      assignee: task.assignee ?? null,
    }));
  }
}
