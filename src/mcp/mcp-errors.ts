import { HttpException } from '@nestjs/common';

/** Agent-facing message. Unexpected failures stay generic so stacks never leak. */
export function publicError(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const message = response.message;
      if (Array.isArray(message)) {
        return message.filter((item) => typeof item === 'string').join('; ');
      }
      if (typeof message === 'string') return message;
    }
    return error.message;
  }
  return 'Unexpected error';
}
