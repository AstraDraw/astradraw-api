import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Logger,
  InternalServerErrorException,
  Headers,
} from '@nestjs/common';
import axios from 'axios';
import { getSecret } from '../utils/secrets';

@Controller('talktrack')
export class TalktrackController {
  private readonly logger = new Logger(TalktrackController.name);
  private readonly kinescopeApiKey: string;
  private readonly kinescopeProjectId: string;
  private readonly kinescopeUploadUrl =
    'https://uploader.kinescope.io/v2/video';
  private readonly kinescopeApiUrl = 'https://api.kinescope.io/v1';

  constructor() {
    this.kinescopeApiKey = getSecret('KINESCOPE_API_KEY') || '';
    this.kinescopeProjectId = getSecret('KINESCOPE_PROJECT_ID') || '';

    if (!this.kinescopeApiKey || !this.kinescopeProjectId) {
      this.logger.warn(
        'Kinescope API credentials not configured. Talktrack endpoints will not work.',
      );
    }
  }

  @Post('upload')
  async upload(
    @Body() payload: Buffer,
    @Headers('x-video-title') title?: string,
  ) {
    if (!this.kinescopeApiKey || !this.kinescopeProjectId) {
      throw new InternalServerErrorException('Kinescope not configured');
    }

    const videoTitle = title || `Recording ${new Date().toISOString()}`;
    const fileName = `${videoTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.webm`;

    try {
      this.logger.log(`Uploading video: ${videoTitle}`);

      const response = await axios.post(this.kinescopeUploadUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.kinescopeApiKey}`,
          'X-Parent-ID': this.kinescopeProjectId,
          'X-Video-Title': videoTitle,
          'X-File-Name': fileName,
          'Content-Type': 'application/octet-stream',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const videoId = response.data?.data?.id || response.data?.id;

      if (!videoId) {
        throw new Error('No video ID in Kinescope response');
      }

      this.logger.log(`Video uploaded successfully: ${videoId}`);

      return { videoId };
    } catch (error) {
      this.logger.error(`Failed to upload video: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to upload video to Kinescope',
      );
    }
  }

  @Delete(':videoId')
  async delete(@Param('videoId') videoId: string) {
    if (!this.kinescopeApiKey) {
      throw new InternalServerErrorException('Kinescope not configured');
    }

    try {
      this.logger.log(`Deleting video: ${videoId}`);

      await axios.delete(`${this.kinescopeApiUrl}/videos/${videoId}`, {
        headers: {
          Authorization: `Bearer ${this.kinescopeApiKey}`,
        },
      });

      this.logger.log(`Video deleted successfully: ${videoId}`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete video: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to delete video from Kinescope',
      );
    }
  }

  @Get(':videoId/status')
  async getStatus(@Param('videoId') videoId: string) {
    if (!this.kinescopeApiKey) {
      throw new InternalServerErrorException('Kinescope not configured');
    }

    try {
      this.logger.log(`Checking video status: ${videoId}`);

      const response = await axios.get(
        `${this.kinescopeApiUrl}/videos/${videoId}`,
        {
          headers: {
            Authorization: `Bearer ${this.kinescopeApiKey}`,
          },
        },
      );

      // Kinescope status values: pending, uploading, pre-processing, processing, aborted, done, error
      const kinescopeStatus = response.data?.data?.status || 'processing';
      this.logger.log(`Video ${videoId} Kinescope status: ${kinescopeStatus}`);

      // Map Kinescope status to our status
      const status = kinescopeStatus === 'done' ? 'ready' : 'processing';

      return {
        videoId,
        status,
        kinescopeStatus, // Include original status for debugging
      };
    } catch (error) {
      this.logger.error(`Failed to check video status: ${error.message}`);
      return {
        videoId,
        status: 'error',
      };
    }
  }
}
