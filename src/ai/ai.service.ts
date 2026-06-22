import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiProjectDescriptionDto } from './dto/ai-project-description.dto';
import { AiTaskSuggestionDto } from './dto/ai-task-suggestion.dto';

const TASK_SYSTEM_INSTRUCTION = `
You are an expert project manager inside a task-management product.
Analyze the incoming task title and respond only with a JSON object matching this TypeScript shape:
{
  "description": string,
  "subTasks": string[],
  "priority": "LOW" | "MEDIUM" | "HIGH",
  "suggestedDaysUntilDue": number,
  "dueDate": string
}

Rules:
- description must be exactly 2 concise, high-quality sentences.
- subTasks must contain 3 or 4 clear, sequential, actionable steps.
- priority must be one of LOW, MEDIUM, or HIGH.
- suggestedDaysUntilDue must be an integer from 1 to 30.
- dueDate must be a YYYY-MM-DD date string calculated from today's date plus suggestedDaysUntilDue.
- Do not include markdown, code fences, comments, or extra keys.
`;

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
    try {
      const parsed = await this.generateJson(
        TASK_SYSTEM_INSTRUCTION,
        `Today is ${this.todayDateString()}. Generate a task suggestion for this title: "${title.trim()}"`,
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

  private async generateJson(systemInstruction: string, prompt: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('Gemini API key is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
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
      !Number.isInteger(value.suggestedDaysUntilDue) ||
      typeof value.dueDate !== 'string'
    ) {
      throw new Error('Gemini returned an invalid task suggestion shape');
    }

    return {
      description: value.description,
      subTasks: value.subTasks.map(String).slice(0, 4),
      priority: value.priority,
      suggestedDaysUntilDue: value.suggestedDaysUntilDue,
      dueDate: value.dueDate,
    };
  }

  private todayDateString() {
    return new Date().toISOString().split('T')[0];
  }
}
