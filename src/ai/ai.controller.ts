import {
  Body,
  Controller,
  Post,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { DEMO_BLOCK_KEY } from '../demo/deny-demo.decorator';
import { DenyDemoGuard } from '../demo/deny-demo.guard';
import { AiService } from './ai.service';
import { AiSuggestDto } from './dto/ai-suggest.dto';
import { AiProjectDescriptionDto } from './dto/ai-project-description.dto';
import { AiTaskSuggestionDto } from './dto/ai-task-suggestion.dto';
import { GenerateProjectDescriptionDto } from './dto/generate-project-description.dto';

@ApiTags('AI')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, DenyDemoGuard)
@SetMetadata(
  DEMO_BLOCK_KEY,
  'AI is turned off on the demo account to protect the free quota.',
)
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
  generateProjectDescription(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateProjectDescriptionDto,
  ) {
    return this.aiService.generateProjectDescription(
      dto.title,
      user.id,
      user.isDemo,
    );
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
  @UsePipes(new ValidationPipe({ transform: true }))
  generateTaskSuggestion(
    @CurrentUser() user: AuthUser,
    @Body() dto: AiSuggestDto,
  ) {
    return this.aiService.generateTaskSuggestion(dto.title, user.id, user.isDemo);
  }
}
