import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SceneAccessService } from '../workspace/scene-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [CommentsController],
  providers: [CommentsService, SceneAccessService],
  exports: [CommentsService],
})
export class CommentsModule {}
