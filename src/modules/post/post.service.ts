import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePostDto, UpdatePostDto } from './dto/post.dto';

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  async create(tenant_uuid: string, dto: CreatePostDto) {
    return this.prisma.post.create({
      data: {
        ...dto,
        tenant_uuid,
      },
    });
  }

  async findAll(tenant_uuid: string, type?: string, is_published?: boolean) {
    return this.prisma.post.findMany({
      where: {
        tenant_uuid,
        ...(type && { type }),
        ...(is_published !== undefined && { is_published }),
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findOne(id: string, tenant_uuid: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, tenant_uuid },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async update(id: string, tenant_uuid: string, dto: UpdatePostDto) {
    await this.findOne(id, tenant_uuid);

    return this.prisma.post.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenant_uuid: string) {
    await this.findOne(id, tenant_uuid);

    return this.prisma.post.delete({
      where: { id },
    });
  }
}
