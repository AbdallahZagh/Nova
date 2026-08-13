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
import { AddWhiteboardMembersDto } from './dto/add-whiteboard-members.dto';
import { ApplyWhiteboardOpsDto } from './dto/apply-ops.dto';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { UpdateWhiteboardDto } from './dto/update-whiteboard.dto';
import { UpdateWhiteboardMemberDto } from './dto/update-whiteboard-member.dto';
import { UploadSnapshotMetaDto } from './dto/upload-snapshot.dto';
import { WhiteboardsService } from './whiteboards.service';

const snapshotUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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
  @RequireProjectRole(
    ProjectRole.OWNER,
    ProjectRole.ADMIN,
    ProjectRole.MEMBER,
    ProjectRole.VIEWER,
  )
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
  @ApiOperation({ summary: 'Rename a whiteboard' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWhiteboardDto,
  ) {
    return this.whiteboardsService.update(userId, id, dto);
  }

  @Post('whiteboards/:id/ops')
  @ApiOperation({
    summary: 'Rename or apply ops to the first page (compat)',
  })
  applyOps(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyWhiteboardOpsDto,
  ) {
    return this.whiteboardsService.applyBoardOps(userId, id, dto);
  }

  @Post('whiteboards/:id/pages')
  @ApiOperation({ summary: 'Add a blank page' })
  addPage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.addPage(userId, id);
  }

  @Delete('whiteboards/:id/pages/:pageId')
  @ApiOperation({ summary: 'Delete a page' })
  removePage(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ) {
    return this.whiteboardsService.removePage(userId, id, pageId);
  }

  @Post('whiteboards/:id/pages/:pageId/ops')
  @ApiOperation({ summary: 'Merge stroke/region ops for a page' })
  applyPageOps(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: ApplyWhiteboardOpsDto,
  ) {
    return this.whiteboardsService.applyPageOps(userId, id, pageId, dto);
  }

  @Put('whiteboards/:id/pages/:pageId/snapshots')
  @ApiOperation({ summary: 'Upsert PNG snapshot for a page' })
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
  @UseInterceptors(snapshotUpload)
  upsertPageSnapshot(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() meta: UploadSnapshotMetaDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Snapshot file is required');
    }

    return this.whiteboardsService.upsertPageSnapshot(
      userId,
      id,
      pageId,
      file.buffer,
      meta.width,
      meta.height,
    );
  }

  @Post('whiteboards/:id/members')
  @ApiOperation({ summary: 'Add collaborators to a whiteboard' })
  addMembers(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddWhiteboardMembersDto,
  ) {
    return this.whiteboardsService.addMembers(userId, id, dto);
  }

  @Patch('whiteboards/:id/members/:userId')
  @ApiOperation({ summary: 'Update a collaborator role' })
  updateMember(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateWhiteboardMemberDto,
  ) {
    return this.whiteboardsService.updateMember(actorId, id, userId, dto);
  }

  @Delete('whiteboards/:id/members/:userId')
  @ApiOperation({ summary: 'Remove a collaborator' })
  removeMember(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.whiteboardsService.removeMember(actorId, id, userId);
  }

  @Delete('whiteboards/:id')
  @ApiOperation({ summary: 'Delete a whiteboard' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.remove(userId, id);
  }
}
