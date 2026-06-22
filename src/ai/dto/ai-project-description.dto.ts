import { ApiProperty } from '@nestjs/swagger';

export class AiProjectDescriptionDto {
  @ApiProperty({
    example:
      'Nova Analytics is a focused project for building clear reporting tools around team productivity and delivery health. It should prioritize actionable dashboards, reliable task metrics, and a clean experience for project owners and collaborators.',
  })
  description: string;
}
