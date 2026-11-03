import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssignTasksDto } from '../tasks/dto/assign-tasks.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { formatValidationErrors, parseDto } from './mcp-dto';
import { publicError } from './mcp-errors';

describe('parseDto', () => {
  it('accepts a valid create-task payload and strips unknown fields', async () => {
    const dto = await parseDto(CreateTaskDto, {
      title: 'Ship MCP',
      projectId: 'project-1',
      extra: 'stripped',
    });

    expect(dto.title).toBe('Ship MCP');
    expect(dto.projectId).toBe('project-1');
    expect((dto as { extra?: string }).extra).toBeUndefined();
  });

  it('rejects an empty title and a bad priority', async () => {
    await expect(
      parseDto(CreateTaskDto, {
        title: '',
        projectId: 'project-1',
        priority: 'Urgent',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a date the API would reject', async () => {
    try {
      await parseDto(CreateTaskDto, {
        title: 'Ship MCP',
        projectId: 'project-1',
        dueDate: 'next week',
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('dueDate');
    }
  });

  it('rejects a single-user assignment with no tasks', async () => {
    try {
      await parseDto(AssignTasksDto, {
        userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        taskIds: [],
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('taskIds');
    }
  });

  it('falls back when class-validator returns no messages', () => {
    expect(formatValidationErrors([{ property: 'title', children: [] }])).toBe(
      'Validation failed',
    );
  });
});

describe('publicError', () => {
  it('returns an HTTP exception message', () => {
    expect(
      publicError(
        new ForbiddenException('You do not have the required project role'),
      ),
    ).toBe('You do not have the required project role');
  });

  it('joins array validation messages', () => {
    const error = new BadRequestException({
      message: ['title should not be empty', 'priority must be a valid enum'],
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(publicError(error)).toBe(
      'title should not be empty; priority must be a valid enum',
    );
  });

  it('hides unexpected failures', () => {
    expect(publicError(new Error('password=secret'))).toBe('Unexpected error');
    expect(publicError('nope')).toBe('Unexpected error');
  });
});
