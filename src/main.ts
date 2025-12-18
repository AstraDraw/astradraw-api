import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getSecret } from './utils/secrets';

function isLogLevel(value: any): value is LogLevel {
  return value in ['log', 'error', 'warn', 'debug', 'verbose'];
}

async function bootstrap() {
  // All config supports _FILE suffix for Docker secrets
  const logLevelValue = getSecret('LOG_LEVEL', 'log');
  const logLevel = isLogLevel(logLevelValue) ? logLevelValue : 'log';

  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: [logLevel],
  });

  app.setGlobalPrefix(getSecret('GLOBAL_PREFIX', '/api/v2'));

  const port = getSecret('PORT', '8080');
  await app.listen(parseInt(port, 10));
}
bootstrap();
