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
import { User, WorkspaceRole, CollectionAccessLevel } from '@prisma/client';
import { CollectionsService } from './collections.service';
import {
  WorkspaceRoleGuard,
  RequireRole,
} from '../workspaces/workspace-role.guard';

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

interface SetTeamAccessDto {
  teamId: string;
  accessLevel: CollectionAccessLevel;
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

  /**
   * Set team access level for a collection (admin only)
   * POST /workspaces/:workspaceId/collections/:collectionId/teams
   */
  @Post('workspaces/:workspaceId/collections/:collectionId/teams')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async setTeamAccess(
    @Param('workspaceId') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @Body() dto: SetTeamAccessDto,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.setTeamAccess(
      workspaceId,
      collectionId,
      dto.teamId,
      dto.accessLevel,
      user.id,
    );
  }

  /**
   * Remove team access from a collection (admin only)
   * DELETE /workspaces/:workspaceId/collections/:collectionId/teams/:teamId
   */
  @Delete('workspaces/:workspaceId/collections/:collectionId/teams/:teamId')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async removeTeamAccess(
    @Param('workspaceId') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: User,
  ) {
    await this.collectionsService.removeTeamAccess(
      workspaceId,
      collectionId,
      teamId,
      user.id,
    );
    return { success: true };
  }

  /**
   * List teams with access to a collection
   * GET /workspaces/:workspaceId/collections/:collectionId/teams
   */
  @Get('workspaces/:workspaceId/collections/:collectionId/teams')
  @UseGuards(WorkspaceRoleGuard)
  async listCollectionTeams(
    @Param('workspaceId') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @CurrentUser() user: User,
  ) {
    return this.collectionsService.listCollectionTeams(
      workspaceId,
      collectionId,
      user.id,
    );
  }
}
