import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { AiProjectDescriptionDto } from './dto/ai-project-description.dto';
import { AiTaskSuggestionDto } from './dto/ai-task-suggestion.dto';
import { GenerateProjectDescriptionDto } from './dto/generate-project-description.dto';
import { GenerateTaskSuggestionDto } from './dto/generate-task-suggestion.dto';

@ApiTags('AI')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('api/projects/ai-description')
  @ApiOperation({
    summary: 'Generate a project description from a title',
    description:
      'Uses Gemini 1.5 Flash to return a concise project description suitable for pre-filling project creation.',
  })
  @ApiResponse({
    status: 201,
    description: 'AI project description generated',
    type: AiProjectDescriptionDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  generateProjectDescription(@Body() dto: GenerateProjectDescriptionDto) {
    return this.aiService.generateProjectDescription(dto.title);
  }

  @Post('api/tasks/ai-suggest')
  @ApiOperation({
    summary: 'Generate structured task details from a title',
    description:
      'Uses Gemini 1.5 Flash to return a task description, subtasks, predicted priority, suggested due window, and due date.',
  })
  @ApiResponse({
    status: 201,
    description: 'AI task suggestion generated',
    type: AiTaskSuggestionDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid Bearer token' })
  generateTaskSuggestion(@Body() dto: GenerateTaskSuggestionDto) {
    return this.aiService.generateTaskSuggestion(dto.title);
  }
}
