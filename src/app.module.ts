import { Module } from '@nestjs/common';
import { DnseModule } from './dnse/dnse.module';

@Module({
  imports: [
    DnseModule.register({}),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

