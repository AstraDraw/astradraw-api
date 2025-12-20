import { MiddlewareConsumer, Module } from '@nestjs/common';
import { RawParserMiddleware } from './raw-parser.middleware';
import { ScenesController } from './scenes/scenes.controller';
import { RoomsController } from './rooms/rooms.controller';
import { FilesController } from './files/files.controller';
import { TalktrackController } from './talktrack/talktrack.controller';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [
    ScenesController,
    RoomsController,
    FilesController,
    TalktrackController,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RawParserMiddleware).forRoutes('**');
  }
}
