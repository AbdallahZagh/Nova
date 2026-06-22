import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { AiProjectDescriptionDto } from './dto/ai-project-description.dto';
import { AiTaskSuggestionDto } from './dto/ai-task-suggestion.dto';

const TASK_SYSTEM_INSTRUCTION = `
You are an expert project manager inside a task-management product.
Generate concise, practical task metadata from the provided task title.
- description must be exactly 2 concise, high-quality sentences.
- subTasks must contain 3 or 4 clear, sequential, actionable steps.
- suggestedDaysUntilDue must be an integer from 1 to 30.
`;

const TASK_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    description: { type: SchemaType.STRING },
    subTasks: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    priority: {
      type: SchemaType.STRING,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    suggestedDaysUntilDue: { type: SchemaType.INTEGER },
  },
  required: ['description', 'subTasks', 'priority', 'suggestedDaysUntilDue'],
};

const PROJECT_SYSTEM_INSTRUCTION = `
You are an expert product/project manager inside a task-management product.
Analyze the incoming project title and respond only with a JSON object matching this TypeScript shape:
{
  "description": string
}

Rules:
- description must be exactly 2 concise, high-quality sentences.
- The description should explain the project goal, expected outcome, and working scope.
- Do not include markdown, code fences, comments, or extra keys.
`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async generateProjectDescription(
    title: string,
  ): Promise<AiProjectDescriptionDto> {
    try {
      const parsed = await this.generateJson(
        PROJECT_SYSTEM_INSTRUCTION,
        `Generate a project description for this title: "${title.trim()}"`,
      );

      if (!parsed || typeof parsed.description !== 'string') {
        throw new Error('Gemini returned an invalid project description shape');
      }

      return { description: parsed.description };
    } catch (error) {
      this.logger.error(
        `Gemini project description failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new InternalServerErrorException(
        'Unable to generate project description',
      );
    }
  }

  async generateTaskSuggestion(title: string): Promise<AiTaskSuggestionDto> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('Title is required');
    }

    try {
      const parsed = await this.generateJson(
        TASK_SYSTEM_INSTRUCTION,
        `You are an expert project manager. Generate metadata suggestions for a task titled: "${trimmedTitle}".`,
        TASK_RESPONSE_SCHEMA,
      );

      return this.validateSuggestion(parsed);
    } catch (error) {
      this.logger.error(
        `Gemini task suggestion failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new InternalServerErrorException(
        'Unable to generate task suggestion',
      );
    }
  }

  private async generateJson(
    systemInstruction: string,
    prompt: string,
    responseSchema?: any,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('Gemini API key is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
        temperature: 0.4,
      },
    });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    return JSON.parse(result.response.text());
  }

  private validateSuggestion(value: any): AiTaskSuggestionDto {
    if (
      !value ||
      typeof value.description !== 'string' ||
      !Array.isArray(value.subTasks) ||
      !['LOW', 'MEDIUM', 'HIGH'].includes(value.priority) ||
      !Number.isInteger(value.suggestedDaysUntilDue)
    ) {
      throw new Error('Gemini returned an invalid task suggestion shape');
    }

    const suggestedDaysUntilDue = Math.min(
      30,
      Math.max(1, value.suggestedDaysUntilDue),
    );

    return {
      description: value.description,
      subTasks: value.subTasks.map(String).slice(0, 4),
      priority: value.priority,
      suggestedDaysUntilDue,
      dueDate: this.dateFromToday(suggestedDaysUntilDue),
    };
  }

  private dateFromToday(daysUntilDue: number) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysUntilDue);
    return dueDate.toISOString().split('T')[0];
  }
}
