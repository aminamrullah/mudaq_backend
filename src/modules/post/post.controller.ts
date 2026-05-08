import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto } from './dto/post.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Posts')
@Controller('posts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post()
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Create a new post/announcement' })
  create(@Request() req: any, @Body() dto: CreatePostDto) {
    return this.postService.create(req.user.tenant_uuid, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all posts for current tenant' })
  findAll(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('is_published') is_published?: string,
  ) {
    const published = is_published === 'true' ? true : is_published === 'false' ? false : undefined;
    return this.postService.findAll(req.user.tenant_uuid, type, published);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post details' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.postService.findOne(id, req.user.tenant_uuid);
  }

  @Put(':id')
  @Roles(Role.ADMIN_PESANTREN, Role.STAFF_PESANTREN)
  @ApiOperation({ summary: 'Update a post' })
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postService.update(id, req.user.tenant_uuid, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_PESANTREN)
  @ApiOperation({ summary: 'Delete a post' })
  remove(@Request() req: any, @Param('id') id: string) {
    return this.postService.remove(id, req.user.tenant_uuid);
  }
}
