import {
  Body,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SupportTicketCategory,
  SupportTicketPriority,
} from '../generated/prisma/enums.js';
import { SupportService } from './support.service';

class CreateTicketDto {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsEnum(SupportTicketCategory) category?: SupportTicketCategory;
  @IsOptional() @IsEnum(SupportTicketPriority) priority?: SupportTicketPriority;
  @IsOptional() @IsString() route?: string;
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() platform?: string;
}

@ApiTags('Support')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTicketDto,
    @Headers('user-agent') userAgent?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.support.createTicket(userId, {
      ...dto,
      userAgent,
      file,
    });
  }
}
