import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

export interface UpsertUserDto {
  oidcId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      }
    }

    return user;
  }

  async getAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
