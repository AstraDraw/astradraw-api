import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService, UpdateProfileDto } from './users.service';

@Controller('api/v2/users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
  ) {}

  /**
   * Get current user's profile
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any) {
    const profile = await this.usersService.getProfile(req.user.sub);
    if (!profile) {
      throw new BadRequestException('User not found');
    }
    return profile;
  }

  /**
   * Update current user's profile
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: any,
    @Body() updateDto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(req.user.sub, updateDto);
    
    // Return profile without password hash
    const { passwordHash, ...profile } = user;
    return profile;
  }

  /**
   * Upload avatar image as base64 data URL
   * This stores the avatar directly in the database as a data URL
   * for simplicity. For larger deployments, consider using S3.
   */
  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', {
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB max for data URL storage
    },
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
        callback(new BadRequestException('Only image files are allowed'), false);
      } else {
        callback(null, true);
      }
    },
  }))
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = req.user.sub;
    this.logger.log(`Uploading avatar for user ${userId}`);

    try {
      // Convert to base64 data URL for simple storage
      const base64 = file.buffer.toString('base64');
      const avatarUrl = `data:${file.mimetype};base64,${base64}`;

      // Update user profile with new avatar URL
      const user = await this.usersService.updateProfile(userId, { avatarUrl });

      const { passwordHash, ...profile } = user;
      return {
        ...profile,
        message: 'Avatar uploaded successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to upload avatar: ${error.message}`);
      throw new BadRequestException('Failed to upload avatar');
    }
  }

  /**
   * Delete avatar (reset to default)
   */
  @Put('me/avatar/delete')
  @UseGuards(JwtAuthGuard)
  async deleteAvatar(@Request() req: any) {
    const userId = req.user.sub;

    // Update user profile to remove avatar URL
    const user = await this.usersService.updateProfile(userId, { avatarUrl: null });

    const { passwordHash, ...profile } = user;
    return {
      ...profile,
      message: 'Avatar deleted successfully',
    };
  }
}

