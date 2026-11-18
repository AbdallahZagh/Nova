import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesRealtime } from './notes-realtime';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService, NotesRealtime],
  exports: [NotesService],
})
export class NotesModule {}
