import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { DEMO_BLOCK_MESSAGE } from './demo.constants';
import { DenyDemoGuard } from './deny-demo.guard';

export const DEMO_BLOCK_KEY = 'demoBlockMessage';

export function DenyDemo(message = DEMO_BLOCK_MESSAGE) {
  return applyDecorators(
    SetMetadata(DEMO_BLOCK_KEY, message),
    UseGuards(DenyDemoGuard),
  );
}
