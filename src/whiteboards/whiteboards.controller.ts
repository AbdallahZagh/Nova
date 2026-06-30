import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ProjectRole,
  RequireProjectRole,
} from '../common/decorators/require-project-role.decorator';
import { ProjectRoleGuard } from '../common/guards/project-role.guard';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { UpdateWhiteboardDto } from './dto/update-whiteboard.dto';
import { UploadSnapshotMetaDto } from './dto/upload-snapshot.dto';
import { WhiteboardsService } from './whiteboards.service';

@ApiTags('Whiteboards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api')
export class WhiteboardsController {
  constructor(private readonly whiteboardsService: WhiteboardsService) {}

  @Post('whiteboards')
  @ApiOperation({ summary: 'Create a whiteboard' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWhiteboardDto,
  ) {
    return this.whiteboardsService.create(userId, dto);
  }

  @Get('whiteboards')
  @ApiOperation({ summary: 'List whiteboards accessible to the user' })
  findMine(@CurrentUser('id') userId: string) {
    return this.whiteboardsService.findMine(userId);
  }

  @Get('projects/:projectId/whiteboards')
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER)
  @ApiOperation({ summary: 'List whiteboards for a project' })
  findByProject(
    @CurrentUser('id') userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.whiteboardsService.findByProject(userId, projectId);
  }

  @Get('whiteboards/:id')
  @ApiOperation({ summary: 'Get a whiteboard by id' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.findOne(userId, id);
  }

  @Patch('whiteboards/:id')
  @ApiOperation({
    summary: 'Save whiteboard strokes/regions (raw points only, no snapshot)',
  })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWhiteboardDto,
  ) {
    return this.whiteboardsService.update(userId, id, dto);
  }

  @Delete('whiteboards/:id')
  @ApiOperation({ summary: 'Delete a whiteboard' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.remove(userId, id);
  }

  @Put('whiteboards/:id/snapshots')
  @ApiOperation({
    summary:
      'Upsert PNG snapshot (overwrites snapshot_{id}.png — not called on debounced PATCH)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['file', 'width', 'height'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upsertSnapshot(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadSnapshotMetaDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Snapshot file is required');
    }

    return this.whiteboardsService.upsertSnapshot(
      userId,
      id,
      file.buffer,
      meta.width,
      meta.height,
    );
  }
}
