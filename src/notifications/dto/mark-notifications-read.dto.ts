import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MarkNotificationsReadDto {
  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'Notification ID to mark as read. If omitted, all current user notifications are marked as read.',
  })
  @IsOptional()
  @IsUUID()
  notificationId?: string;
}
