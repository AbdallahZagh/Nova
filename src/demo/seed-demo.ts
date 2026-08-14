import * as bcrypt from 'bcrypt';
import {
  DEMO_BIO,
  DEMO_BOARD_TITLE,
  DEMO_EMAIL,
  DEMO_FULL_NAME,
  DEMO_PASSWORD,
  DEMO_PROJECT_NAME,
  DEMO_ROLE_TITLE,
  DEMO_USERNAME,
} from './demo.constants';

type DemoPrisma = {
  user: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    upsert: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<unknown>;
  };
  project: {
    deleteMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  whiteboard: {
    deleteMany: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  task: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
};

function sampleDocument() {
  return {
    canvas: { width: 2000, height: 1500 },
    strokes: [
      {
        id: 'demo-stroke-1',
        tool: 'pen',
        color: '#e8e3e0',
        width: 4,
        points: [
          { x: 180, y: 220, t: 0 },
          { x: 320, y: 260, t: 40 },
          { x: 480, y: 210, t: 80 },
          { x: 640, y: 280, t: 120 },
        ],
      },
      {
        id: 'demo-stroke-2',
        tool: 'highlighter',
        color: '#7c5cff',
        width: 16,
        points: [
          { x: 200, y: 420, t: 0 },
          { x: 520, y: 430, t: 60 },
        ],
      },
    ],
    regions: [],
  };
}

export async function seedDemoWorkspace(prisma: DemoPrisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      username: DEMO_USERNAME,
      passwordHash,
      fullName: DEMO_FULL_NAME,
      roleTitle: DEMO_ROLE_TITLE,
      bio: DEMO_BIO,
      isActive: true,
      isArchived: false,
      isDemo: true,
      avatarUrl: null,
    },
    create: {
      email: DEMO_EMAIL,
      username: DEMO_USERNAME,
      passwordHash,
      fullName: DEMO_FULL_NAME,
      roleTitle: DEMO_ROLE_TITLE,
      bio: DEMO_BIO,
      isActive: true,
      isArchived: false,
      isDemo: true,
    },
  });

  await prisma.whiteboard.deleteMany({ where: { createdById: user.id } });
  await prisma.project.deleteMany({ where: { ownerId: user.id } });

  const dueSoon = new Date();
  dueSoon.setDate(dueSoon.getDate() + 3);
  const dueLater = new Date();
  dueLater.setDate(dueLater.getDate() + 10);

  const project = await prisma.project.create({
    data: {
      name: DEMO_PROJECT_NAME,
      description:
        'A sample launch workspace. Try changing a task status, adding a comment, then open the board and draw.',
      status: 'Active',
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  });

  await prisma.task.create({
    data: {
      title: 'Write launch checklist',
      description: 'Keep this short. Move it to In Progress to see the board update.',
      status: 'To Do',
      priority: 'High',
      dueDate: dueSoon,
      projectId: project.id,
      assigneeId: user.id,
      assignments: { create: { userId: user.id } },
      subtasks: {
        create: [
          { title: 'List blockers', isCompleted: false },
          { title: 'Share with the team', isCompleted: false },
        ],
      },
      comments: {
        create: {
          content: 'Welcome. Edit this task, then try the whiteboard.',
          createdById: user.id,
        },
      },
    },
  });

  await prisma.task.create({
    data: {
      title: 'Review timeline',
      description: 'Open Timeline in the sidebar to see dates across work.',
      status: 'In Progress',
      priority: 'Medium',
      dueDate: dueLater,
      projectId: project.id,
      assigneeId: user.id,
      assignments: { create: { userId: user.id } },
    },
  });

  await prisma.task.create({
    data: {
      title: 'Sketch the flow on the board',
      description: 'Open the Sprint whiteboard, draw a few strokes, then undo.',
      status: 'In Review',
      priority: 'Low',
      projectId: project.id,
      assigneeId: user.id,
      assignments: { create: { userId: user.id } },
    },
  });

  await prisma.whiteboard.create({
    data: {
      title: DEMO_BOARD_TITLE,
      createdById: user.id,
      projectId: project.id,
      lastEditedById: user.id,
      members: { create: { userId: user.id, role: 'ADMIN' } },
      pages: {
        create: {
          index: 0,
          documentJson: sampleDocument(),
          version: 1,
        },
      },
    },
  });

  return user;
}

export async function findDemoUser(prisma: {
  user: { findUnique: (args: unknown) => Promise<{ id: string; isDemo?: boolean } | null> };
}) {
  return prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, isDemo: true },
  });
}
