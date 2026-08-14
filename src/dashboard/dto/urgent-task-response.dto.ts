import { ApiProperty } from '@nestjs/swagger';

export class UrgentTaskResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Task UUID',
  })
  id: string;

  @ApiProperty({
    example: 'Finalise API authentication flow',
    description: 'Task title as shown on the kanban card',
  })
  title: string;

  @ApiProperty({
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    description: 'Parent project UUID used to open the task workspace',
  })
  projectId: string | null;

  @ApiProperty({
    example: 'Nova Core Backend',
    description: 'Name of the parent project the task belongs to',
  })
  projectName: string;

  @ApiProperty({
    example: 'High',
    enum: ['Low', 'Medium', 'High', 'Critical'],
    description: 'Raw priority stored on the task',
  })
  priority: string;

  @ApiProperty({
    example: 'Urgent',
    description:
      'Display label for the widget badge. High and Critical priorities are surfaced as "Urgent".',
  })
  urgency: string;

  @ApiProperty({
    example: '2026-06-02T00:00:00.000Z',
    description: 'Raw ISO 8601 due date string',
    nullable: true,
  })
  dueDate: string | null;

  @ApiProperty({
    example: '2d overdue',
    description:
      'Human-readable deadline label computed at request time relative to the current server date. ' +
      'Possible values: "Nd overdue" | "Yesterday" | "Today" | "Tomorrow" | "In N days"',
  })
  dueLabel: string;
}
