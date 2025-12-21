import { MiddlewareConsumer, Module } from '@nestjs/common';
import { RawParserMiddleware } from './raw-parser.middleware';
import { ScenesController } from './scenes/scenes.controller';
import { RoomsController } from './rooms/rooms.controller';
import { FilesController } from './files/files.controller';
import { TalktrackController } from './talktrack/talktrack.controller';
import { SceneTalktrackController } from './talktrack/scene-talktrack.controller';
import { StorageModule } from './storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { TeamsModule } from './teams/teams.module';
import { CollectionsModule } from './collections/collections.module';
import { WorkspaceScenesController } from './workspace/workspace-scenes.controller';
import { SceneAccessService } from './workspace/scene-access.service';
import { DebugModule } from './debug/debug.module';

@Module({
  imports: [
    StorageModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    TeamsModule,
    CollectionsModule,
    DebugModule,
  ],
  controllers: [
    ScenesController,
    RoomsController,
    FilesController,
    TalktrackController,
    SceneTalktrackController,
    WorkspaceScenesController,
  ],
  providers: [SceneAccessService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawParserMiddleware)
      .exclude('users/me/avatar') // Exclude multipart upload route
      .forRoutes('**');
  }
}
