import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, WorkspaceRole } from '@prisma/client';

export interface UpsertUserDto {
  oidcId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface CreateLocalUserDto {
  email: string;
  passwordHash: string;
  name?: string;
}

export interface UpdateProfileDto {
  name?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a default personal workspace for a new user
   */
  private async createDefaultWorkspace(userId: string, userEmail: string): Promise<void> {
    // Generate a unique slug based on email
    const baseSlug = userEmail
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'workspace';

    let slug = baseSlug;
    let counter = 0;

    while (await this.prisma.workspace.findUnique({ where: { slug } })) {
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // Create workspace with user as admin
    await this.prisma.workspace.create({
      data: {
        name: 'My Workspace',
        slug,
        members: {
          create: {
            userId,
            role: WorkspaceRole.ADMIN,
          },
        },
        // Also create a default private collection
        collections: {
          create: {
            name: 'Private',
            icon: '🔒',
            isPrivate: true,
            userId: userId,
          },
        },
      },
    });

    this.logger.log(`Created default workspace "${slug}" for user ${userEmail}`);
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByOidcId(oidcId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { oidcId },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async upsertFromOidc(data: UpsertUserDto): Promise<User> {
    const { oidcId, email, name, avatarUrl } = data;

    // Try to find existing user by OIDC ID first
    let user = await this.findByOidcId(oidcId);

    if (user) {
      // Update existing user
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          name,
          avatarUrl,
        },
      });
      this.logger.log(`Updated user: ${email}`);
    } else {
      // Check if user exists by email (migration case)
      const existingByEmail = await this.findByEmail(email);

      if (existingByEmail) {
        // Link existing user to OIDC
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            oidcId,
            name,
            avatarUrl,
          },
        });
        this.logger.log(`Linked existing user to OIDC: ${email}`);
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            oidcId,
            email,
            name,
            avatarUrl,
          },
        });
        this.logger.log(`Created new user: ${email}`);

        // Create default workspace for new user
        await this.createDefaultWorkspace(user.id, email);
      }
    }

    // Ensure user has at least one workspace (for existing users without workspace)
    await this.ensureUserHasWorkspace(user.id, user.email);

    return user;
  }

  async getAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new local user with password authentication
   */
  async createLocalUser(data: CreateLocalUserDto): Promise<User> {
    const { email, passwordHash, name } = data;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
      },
    });

    this.logger.log(`Created new local user: ${email}`);

    // Create default workspace for new user
    await this.createDefaultWorkspace(user.id, email);

    return user;
  }

  /**
   * Update user's password hash
   */
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Update user profile (name, avatar)
   */
  async updateProfile(userId: string, data: UpdateProfileDto): Promise<User> {
    const updateData: Partial<User> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Updated profile for user: ${user.email}`);
    return user;
  }

  /**
   * Ensure user has at least one workspace (creates default if none exist)
   */
  async ensureUserHasWorkspace(userId: string, email: string): Promise<void> {
    const workspaceCount = await this.prisma.workspaceMember.count({
      where: { userId },
    });

    if (workspaceCount === 0) {
      await this.createDefaultWorkspace(userId, email);
    }
  }

  /**
   * Get user profile (safe version without password hash)
   */
  async getProfile(userId: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    // Remove sensitive data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...profile } = user;
    return profile;
  }
}
