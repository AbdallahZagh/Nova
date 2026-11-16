import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotesService } from './notes.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note-1',
    userId: 'user-1',
    projectId: null,
    title: 'Ideas',
    body: 'Keep this',
    checklist: [],
    color: 'AMBER',
    pinned: false,
    floating: false,
    posX: null,
    posY: null,
    width: null,
    height: null,
    createdAt: new Date('2026-11-12T08:00:00.000Z'),
    updatedAt: new Date('2026-11-12T08:00:00.000Z'),
    project: null,
    ...overrides,
  };
}

function service(options?: { project?: boolean }) {
  const notes = [row()];
  const prisma = {
    note: {
      findMany: jest.fn(async () => notes),
      findFirst: jest.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        notes.find((item) => item.id === where.id && item.userId === where.userId) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row({ ...data, id: 'note-2' }),
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
      delete: jest.fn(async () => row()),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    project: {
      findFirst: jest.fn(async () => (options?.project === false ? null : { id: 'project-1' })),
    },
  };
  return {
    notes: new NotesService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('NotesService', () => {
  it('rejects an empty note', async () => {
    const { notes } = service();
    await expect(notes.create('user-1', { body: '   ', checklist: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates a checklist-only note', async () => {
    const { notes } = service();
    const created = await notes.create('user-1', {
      checklist: [{ id: '1', text: 'Call the client', done: false }],
    });
    expect(created.checklist).toEqual([{ id: '1', text: 'Call the client', done: false }]);
    expect(created.preview).toBe('Call the client');
  });

  it('saves where a sticky was dropped', async () => {
    const { notes, prisma } = service();
    const created = await notes.create('user-1', {
      body: 'Remember',
      floating: true,
      posX: 120,
      posY: 300,
    });
    expect(created.posX).toBe(120);
    expect(created.posY).toBe(300);
    const moved = await notes.update('user-1', 'note-1', { posX: 40, posY: 80 });
    expect(prisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ posX: 40, posY: 80 }),
      }),
    );
    expect(moved.posX).toBe(40);
  });

  it('saves a resized sticky', async () => {
    const { notes, prisma } = service();
    const resized = await notes.update('user-1', 'note-1', { width: 420, height: 300 });
    expect(prisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ width: 420, height: 300 }),
      }),
    );
    expect(resized.width).toBe(420);
    expect(resized.height).toBe(300);
  });

  it('hides another user note', async () => {
    const { notes } = service();
    await expect(notes.get('someone-else', 'note-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a project the user cannot access', async () => {
    const { notes } = service({ project: false });
    await expect(
      notes.create('user-1', { body: 'Private thought', projectId: 'project-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets any account, including the demo one, manage its own notes', async () => {
    const { notes, prisma } = service();
    await expect(notes.remove('user-1', 'note-1')).resolves.toEqual({ message: 'Note deleted' });
    expect(prisma.note.delete).toHaveBeenCalled();
  });
});
