import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { IStorageService, STORAGE_SERVICE, StorageNamespace } from '../storage/storage.interface';
import { Readable } from 'stream';
import { customAlphabet } from 'nanoid';

@Controller('scenes')
export class ScenesController {
  private readonly logger = new Logger(ScenesController.name);
  private readonly namespace = StorageNamespace.SCENES;

  constructor(
    @Inject(STORAGE_SERVICE) private storageService: IStorageService,
  ) {}

  @Get(':id')
  @Header('content-type', 'application/octet-stream')
  async findOne(@Param() params, @Res() res: Response): Promise<void> {
    const data = await this.storageService.get(params.id, this.namespace);
    this.logger.debug(`Get scene ${params.id}`);

    if (!data) {
      throw new NotFoundException();
    }

    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    stream.pipe(res);
  }

  @Post()
  async create(@Body() payload: Buffer) {
    // Excalidraw front-end only support numeric id, we can't use nanoid default alphabet
    const nanoid = customAlphabet('0123456789', 16);
    const id = nanoid();

    // Check for collision
    if (await this.storageService.has(id, this.namespace)) {
      throw new InternalServerErrorException();
    }

    await this.storageService.set(id, payload, this.namespace);
    this.logger.debug(`Created scene ${id}`);

    return {
      id,
    };
  }
}
