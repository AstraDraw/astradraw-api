import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { WorkspaceRoleGuard } from '../workspaces/workspace-role.guard';

// DTOs
interface CreateCollectionDto {
  name: string;
  icon?: string;
  color?: string;
  isPrivate?: boolean;
}

interface UpdateCollectionDto {
  name?: string;
  icon?: string;
  color?: string;
  isPrivate?: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  private readonly logger = new Logger(CollectionsController.name);

  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * List all accessible collections in a workspace
   */
  @Get('workspaces/:workspaceId/collections')
  @UseGuards(WorkspaceRoleGuard)
  async listCollections(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.listCollections(workspaceId, user.id);
  }

  /**
   * Create a new collection
   */
  @Post('workspaces/:workspaceId/collections')
  @UseGuards(WorkspaceRoleGuard)
  async createCollection(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.createCollection(workspaceId, user.id, dto);
  }

  /**
   * Get a single collection
   */
  @Get('collections/:id')
  async getCollection(@Param('id') id: string, @CurrentUser() user: User) {
    return this.collectionsService.getCollection(id, user.id);
  }

  /**
   * Update a collection
   */
  @Put('collections/:id')
  async updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.updateCollection(id, user.id, dto);
  }

  /**
   * Delete a collection
   */
  @Delete('collections/:id')
  async deleteCollection(@Param('id') id: string, @CurrentUser() user: User) {
    await this.collectionsService.deleteCollection(id, user.id);
    return { success: true };
  }
}
