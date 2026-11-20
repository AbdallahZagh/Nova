import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WriteNoteDto } from './dto/write-note.dto';
import { NotesService } from './notes.service';

@ApiTags('Notes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({ summary: 'List your notes' })
  list(
    @CurrentUser('id') userId: string,
    @Query('projectId') projectId?: string,
    @Query('scope') scope?: string,
    @Query('pinned') pinned?: string,
    @Query('floating') floating?: string,
    @Query('color') color?: string,
    @Query('q') q?: string,
  ) {
    return this.notes.list(userId, { projectId, scope, pinned, floating, color, q });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one note' })
  get(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.get(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  create(@CurrentUser('id') userId: string, @Body() dto: WriteNoteDto) {
    return this.notes.create(userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Create a note once with a client-supplied ID' })
  createOnce(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WriteNoteDto,
  ) {
    return this.notes.create(userId, dto, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WriteNoteDto,
  ) {
    return this.notes.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a note' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notes.remove(userId, id);
  }
}
