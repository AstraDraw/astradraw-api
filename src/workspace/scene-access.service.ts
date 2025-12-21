import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CollectionAccessLevel,
  WorkspaceRole,
  WorkspaceType,
} from '@prisma/client';

export type SceneAccessResult = {
  canView: boolean;
  canEdit: boolean;
  canCollaborate: boolean;
};

@Injectable()
export class SceneAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determine a user's access to a scene based on workspace → collection → team rules.
   */
  async checkAccess(
    sceneId: string,
    userId: string,
  ): Promise<SceneAccessResult> {
    const scene = await this.prisma.scene.findUnique({
      where: { id: sceneId },
      include: {
        collection: {
          include: {
            workspace: true,
            teamCollections: {
              include: {
                team: {
                  include: {
                    members: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!scene) {
      return { canView: false, canEdit: false, canCollaborate: false };
    }

    if (!scene.collection) {
      const isOwner = scene.userId === userId;
      return {
        canView: isOwner,
        canEdit: isOwner,
        canCollaborate: false,
      };
    }

    const workspace = scene.collection.workspace;

    // Workspace membership check
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId },
      },
      include: {
        teamMemberships: true,
      },
    });

    if (!membership) {
      return { canView: false, canEdit: false, canCollaborate: false };
    }

    // Personal workspace: owner only, no collaboration
    if (workspace.type === WorkspaceType.PERSONAL) {
      const isOwner = scene.userId === userId;
      return {
        canView: isOwner,
        canEdit: isOwner,
        canCollaborate: false,
      };
    }

    // Shared workspace
    if (membership.role === WorkspaceRole.ADMIN) {
      return {
        canView: true,
        canEdit: true,
        canCollaborate: !!scene.collaborationEnabled,
      };
    }

    // Private collection: only owner
    if (scene.collection.isPrivate) {
      const isOwner = scene.collection.userId === userId;
      return {
        canView: isOwner,
        canEdit: isOwner && membership.role !== WorkspaceRole.VIEWER,
        canCollaborate: isOwner && !!scene.collaborationEnabled,
      };
    }

    // Check team access
    const userTeamIds =
      membership.teamMemberships?.map((tm) => tm.teamId) ?? [];
    const teamAccess = scene.collection.teamCollections.find((tc) =>
      userTeamIds.includes(tc.teamId),
    );

    if (!teamAccess) {
      return { canView: false, canEdit: false, canCollaborate: false };
    }

    const canEdit =
      teamAccess.accessLevel === CollectionAccessLevel.EDIT &&
      membership.role !== WorkspaceRole.VIEWER;

    return {
      canView: true,
      canEdit,
      canCollaborate: !!scene.collaborationEnabled && canEdit,
    };
  }
}
