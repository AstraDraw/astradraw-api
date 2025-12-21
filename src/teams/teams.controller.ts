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
import { User, WorkspaceRole } from '@prisma/client';
import { TeamsService } from './teams.service';
import {
  WorkspaceRoleGuard,
  RequireRole,
} from '../workspaces/workspace-role.guard';

// DTOs
interface CreateTeamDto {
  name: string;
  color: string;
  memberIds?: string[];
  collectionIds?: string[];
}

interface UpdateTeamDto {
  name?: string;
  color?: string;
  memberIds?: string[];
  collectionIds?: string[];
}

@Controller()
@UseGuards(JwtAuthGuard)
export class TeamsController {
  private readonly logger = new Logger(TeamsController.name);

  constructor(private readonly teamsService: TeamsService) {}

  /**
   * List all teams in a workspace
   */
  @Get('workspaces/:workspaceId/teams')
  @UseGuards(WorkspaceRoleGuard)
  async listTeams(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.teamsService.listTeams(workspaceId, user.id);
  }

  /**
   * Create a new team (admin only)
   */
  @Post('workspaces/:workspaceId/teams')
  @UseGuards(WorkspaceRoleGuard)
  @RequireRole(WorkspaceRole.ADMIN)
  async createTeam(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTeamDto,
    @CurrentUser() user: User,
  ) {
    return this.teamsService.createTeam(workspaceId, user.id, dto);
  }

  /**
   * Get a single team
   */
  @Get('teams/:id')
  async getTeam(@Param('id') id: string, @CurrentUser() user: User) {
    return this.teamsService.getTeam(id, user.id);
  }

  /**
   * Update a team (admin only)
   */
  @Put('teams/:id')
  async updateTeam(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: User,
  ) {
    return this.teamsService.updateTeam(id, user.id, dto);
  }

  /**
   * Delete a team (admin only)
   */
  @Delete('teams/:id')
  async deleteTeam(@Param('id') id: string, @CurrentUser() user: User) {
    await this.teamsService.deleteTeam(id, user.id);
    return { success: true };
  }
}
