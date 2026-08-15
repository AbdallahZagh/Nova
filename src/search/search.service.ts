import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { myProjectsWhere } from '../common/task-access';

const EMPTY_SEARCH_RESULTS = {
  projects: [],
  tasks: [],
  users: [],
  whiteboards: [],
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, query?: string) {
    const q = query?.trim();
    if (!q) return EMPTY_SEARCH_RESULTS;

    const accessibleProjectWhere = myProjectsWhere(userId);

    const [projects, tasks, users, whiteboards] = await Promise.all([
      (this.prisma as any).project.findMany({
        where: {
          ...accessibleProjectWhere,
          name: { contains: q, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
        },
        take: 5,
      }),
      (this.prisma as any).task.findMany({
        where: {
          title: { contains: q, mode: 'insensitive' },
          project: accessibleProjectWhere,
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          project: {
            select: {
              name: true,
            },
          },
        },
        take: 5,
      }),
      (this.prisma as any).user.findMany({
        where: {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          username: true,
        },
        take: 5,
      }),
      (this.prisma as any).whiteboard.findMany({
        where: {
          AND: [
            {
              OR: [{ createdById: userId }, { members: { some: { userId } } }],
            },
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                ...(this.matchesUntitled(q)
                  ? [{ title: null }, { title: '' }]
                  : []),
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          projectId: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        take: 5,
      }),
    ]);

    return {
      projects,
      tasks,
      users: users.map((user: any) => ({
        id: user.id,
        name: user.fullName,
        email: user.email,
        username: user.username,
      })),
      whiteboards: whiteboards.map((board: any) => ({
        id: board.id,
        title: board.title?.trim() || 'Untitled whiteboard',
        projectId: board.projectId,
        project: board.project
          ? { id: board.project.id, name: board.project.name }
          : null,
      })),
    };
  }

  private matchesUntitled(query: string) {
    const q = query.toLowerCase();
    return (
      q.length >= 3 &&
      ['untitled', 'untitled whiteboard'].some((label) => label.startsWith(q))
    );
  }
}
