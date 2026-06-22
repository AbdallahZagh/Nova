import { ApiProperty } from '@nestjs/swagger';

export class AiTaskDetailsDto {
  @ApiProperty({
    example:
      'Implement a notification preferences panel that lets users control task and project alerts. The work should cover UI state, API integration, and persistence of selected preferences.',
  })
  description: string;

  @ApiProperty({
    example: [
      'Define the notification preference options',
      'Build the settings form UI',
      'Connect the form to the backend API',
      'Test saved preferences across reloads',
    ],
    type: [String],
  })
  subTasks: string[];
}
