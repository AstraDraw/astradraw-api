import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CollectionsService } from '../collections/collections.service';

export interface GlobalSearchCollectionResult {
  id: string;
  name: string;
  icon: string | null;
  isPrivate: boolean;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  updatedAt: string;
}

export interface GlobalSearchSceneResult {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  collectionId: string | null;
  collectionName: string | null;
  isPrivate: boolean;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  updatedAt: string;
}

export interface GlobalSearchResponse {
  collections: GlobalSearchCollectionResult[];
  scenes: GlobalSearchSceneResult[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly collectionsService: CollectionsService,
  ) {}

  /**
   * Perform a global search across all workspaces the user has access to.
   * Returns collections and scenes that match the optional query.
   */
  async globalSearch(
    userId: string,
    query?: string,
    limit: number = 50,
  ): Promise<GlobalSearchResponse> {
    // 1. Get all workspaces the user is a member of
    const workspaces =
      await this.workspacesService.listWorkspacesForUser(userId);

    if (workspaces.length === 0) {
      return { collections: [], scenes: [] };
    }

    // Build workspace lookup map
    const workspaceMap = new Map(
      workspaces.map((ws) => [ws.id, { name: ws.name, slug: ws.slug }]),
    );

    // 2. For each workspace, get accessible collections
    const allCollections: GlobalSearchCollectionResult[] = [];
    const accessibleCollectionIds: string[] = [];
    const collectionNameMap = new Map<
      string,
      { name: string; isPrivate: boolean }
    >();

    for (const workspace of workspaces) {
      const collections = await this.collectionsService.listCollections(
        workspace.id,
        userId,
      );

      for (const collection of collections) {
        accessibleCollectionIds.push(collection.id);
        collectionNameMap.set(collection.id, {
          name: collection.name,
          isPrivate: collection.isPrivate,
        });

        // Apply query filter if provided
        const collectionDisplayName = collection.isPrivate
          ? 'Private'
          : collection.name;
        if (
          !query ||
          collectionDisplayName.toLowerCase().includes(query.toLowerCase())
        ) {
          allCollections.push({
            id: collection.id,
            name: collectionDisplayName,
            icon: collection.icon,
            isPrivate: collection.isPrivate,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            workspaceSlug: workspace.slug,
            updatedAt: collection.updatedAt.toISOString(),
          });
        }
      }
    }

    // 3. Fetch scenes from accessible collections
    const whereClause: any = {
      collectionId: { in: accessibleCollectionIds },
    };

    // Apply query filter for scenes
    if (query) {
      whereClause.title = {
        contains: query,
        mode: 'insensitive',
      };
    }

    const scenes = await this.prisma.scene.findMany({
      where: whereClause,
      include: {
        collection: {
          select: {
            id: true,
            name: true,
            isPrivate: true,
            workspaceId: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    // 4. Map scenes to response format
    const sceneResults: GlobalSearchSceneResult[] = scenes.map((scene) => {
      const wsInfo = workspaceMap.get(scene.collection?.workspaceId || '');
      const collectionInfo = collectionNameMap.get(scene.collectionId || '');

      return {
        id: scene.id,
        title: scene.title,
        thumbnailUrl: scene.thumbnailUrl,
        collectionId: scene.collectionId,
        collectionName: collectionInfo?.isPrivate
          ? 'Private'
          : (collectionInfo?.name ?? null),
        isPrivate: collectionInfo?.isPrivate ?? false,
        workspaceId: scene.collection?.workspaceId || '',
        workspaceName: wsInfo?.name || '',
        workspaceSlug: wsInfo?.slug || '',
        updatedAt: scene.updatedAt.toISOString(),
      };
    });

    // 5. Sort collections by updatedAt and limit
    const sortedCollections = allCollections
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit);

    return {
      collections: sortedCollections,
      scenes: sceneResults,
    };
  }
}
