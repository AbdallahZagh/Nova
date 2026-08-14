import { Global, Module } from '@nestjs/common';
import { DemoService } from './demo.service';
import { DenyDemoGuard } from './deny-demo.guard';

@Global()
@Module({
  providers: [DemoService, DenyDemoGuard],
  exports: [DemoService, DenyDemoGuard],
})
export class DemoModule {}
