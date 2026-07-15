import { Module, DynamicModule } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DnseService, DNSE_OPTIONS, DnseClientOptions } from './dnse.service';
import { DnseController } from './dnse.controller';

@Module({})
export class DnseModule {
  static register(options: DnseClientOptions): DynamicModule {
    return {
      module: DnseModule,
      imports: [HttpModule],
      controllers: [DnseController],
      providers: [
        {
          provide: DNSE_OPTIONS,
          useValue: options,
        },
        DnseService,
      ],
      exports: [DnseService],
    };
  }
}
