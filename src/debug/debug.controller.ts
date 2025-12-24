import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import * as fs from 'fs';
import * as path from 'path';

interface NavigationLogEntry {
  ts: string;
  event: string;
  sceneId?: string | null;
  workspaceSlug?: string | null;
  data: Record<string, unknown>;
}

interface NavigationLogRequest {
  entries: NavigationLogEntry[];
}

@Controller('api/v2/debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);
  private readonly logFilePath: string;
  private readonly debugEnabled: boolean;

  constructor() {
    // Check if debug mode is enabled
    this.debugEnabled = process.env.DEBUG_NAVIGATION === 'true';

    // Log file path - mounted from Docker volume
    this.logFilePath =
      process.env.DEBUG_NAVIGATION_LOG_PATH || '/logs/navigation.log';

    if (this.debugEnabled) {
      this.logger.log(
        `Navigation debugging enabled, logging to: ${this.logFilePath}`,
      );
      // Ensure log directory exists
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        try {
          fs.mkdirSync(logDir, { recursive: true });
        } catch (error) {
          this.logger.error(`Failed to create log directory: ${logDir}`, error);
        }
      }
    }
  }

  @Post('navigation')
  @Public() // Allow unauthenticated access for debugging
  @HttpCode(HttpStatus.OK)
  async logNavigation(@Body() body: NavigationLogRequest): Promise<void> {
    if (!this.debugEnabled) {
      // Silently ignore when debug is disabled
      return;
    }

    if (!body.entries || !Array.isArray(body.entries)) {
      return;
    }

    try {
      // Format each entry as NDJSON (one JSON object per line)
      const lines = body.entries
        .map((entry) => JSON.stringify(entry))
        .join('\n');

      // Append to log file
      fs.appendFileSync(this.logFilePath, lines + '\n', 'utf8');
    } catch (error) {
      this.logger.error('Failed to write navigation log:', error);
    }
  }
}






