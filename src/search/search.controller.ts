import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';
import { SearchService, GlobalSearchResponse } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  /**
   * Global search across all workspaces the user has access to.
   *
   * @param q - Optional search query to filter results
   * @param limit - Maximum number of results per category (default: 50)
   * @returns Collections and scenes matching the query from all accessible workspaces
   */
  @Get('global')
  async globalSearch(
    @CurrentUser() user: User,
    @Query('q') query?: string,
    @Query('limit') limitParam?: string,
  ): Promise<GlobalSearchResponse> {
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const sanitizedLimit = Math.min(Math.max(1, limit), 100); // Clamp between 1 and 100

    return this.searchService.globalSearch(user.id, query, sanitizedLimit);
  }
}
