import { ApiProperty } from '@nestjs/swagger';

export class AiTaskSuggestionDto {
  @ApiProperty({
    example:
      'Create a polished onboarding screen that explains the app value clearly. Include responsive layout and accessible call-to-action behavior.',
  })
  description: string;

  @ApiProperty({
    example: [
      'Review the product requirements and target audience',
      'Design the onboarding screen layout and copy',
      'Implement responsive UI states',
      'Test accessibility and mobile behavior',
    ],
    type: [String],
  })
  subTasks: string[];

  @ApiProperty({ example: 'MEDIUM', enum: ['LOW', 'MEDIUM', 'HIGH'] })
  priority: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiProperty({ example: 5 })
  suggestedDaysUntilDue: number;

  @ApiProperty({
    example: '2026-06-27',
    description: 'Suggested due date in YYYY-MM-DD format',
  })
  dueDate: string;
}
