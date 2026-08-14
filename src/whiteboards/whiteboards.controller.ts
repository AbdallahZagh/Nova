import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
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
import { CreateWhiteboardCommentDto } from './dto/create-whiteboard-comment.dto';
import { CreateWhiteboardDto } from './dto/create-whiteboard.dto';
import { CreateWhiteboardInviteDto } from './dto/create-whiteboard-invite.dto';
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

  @Post('whiteboards/:id/duplicate')
  @ApiOperation({ summary: 'Duplicate a whiteboard' })
  duplicate(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.duplicate(userId, id);
  }

  @Get('whiteboards/:id/activity')
  @ApiOperation({ summary: 'List whiteboard activity history' })
  listActivity(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.listActivity(userId, id);
  }

  @Get('whiteboards/:id/comments')
  @ApiOperation({ summary: 'List whiteboard comments' })
  listComments(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.whiteboardsService.listComments(userId, id);
  }

  @Post('whiteboards/:id/comments')
  @ApiOperation({ summary: 'Add a whiteboard comment' })
  addComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWhiteboardCommentDto,
  ) {
    return this.whiteboardsService.addComment(userId, id, dto);
  }

  @Delete('whiteboards/:id/comments/:commentId')
  @ApiOperation({ summary: 'Delete a whiteboard comment' })
  removeComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.whiteboardsService.removeComment(userId, id, commentId);
  }

  @Post('whiteboards/:id/invites')
  @ApiOperation({ summary: 'Create a one-time invite link' })
  createInvite(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWhiteboardInviteDto,
  ) {
    return this.whiteboardsService.createInvite(userId, id, dto);
  }

  @Get('whiteboard-invites/:token')
  @ApiOperation({ summary: 'Preview a whiteboard invite' })
  getInvite(@Param('token') token: string) {
    return this.whiteboardsService.getInvite(token);
  }

  @Post('whiteboard-invites/:token/accept')
  @ApiOperation({ summary: 'Accept a one-time whiteboard invite' })
  acceptInvite(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
  ) {
    return this.whiteboardsService.acceptInvite(userId, token);
  }

  @Get('whiteboards/:id/export/png')
  @ApiOperation({ summary: 'Export a whiteboard page as PNG' })
  @Header('Content-Type', 'image/png')
  async exportPng(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('pageId') pageId?: string,
  ) {
    const file = await this.whiteboardsService.exportBoard(
      userId,
      id,
      'png',
      pageId,
    );
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('whiteboards/:id/export/pdf')
  @ApiOperation({ summary: 'Export whiteboard pages as PDF' })
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.whiteboardsService.exportBoard(userId, id, 'pdf');
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('whiteboards/:id/export/zip')
  @ApiOperation({ summary: 'Export whiteboard page PNGs as ZIP' })
  @Header('Content-Type', 'application/zip')
  async exportZip(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const file = await this.whiteboardsService.exportBoard(userId, id, 'zip');
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition: `attachment; filename="${file.filename}"`,
    });
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
