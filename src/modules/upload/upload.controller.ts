import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Logger,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import * as fs from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private prisma: PrismaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file, cb) => {
          // Sanitize folder name to prevent path traversal attacks
          const rawFolder = (req.query.folder || '').toString();
          const folder = rawFolder.replace(/\.\.+/g, '').replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/^\/+/, '');
          
          const tenantFolder = req.user?.tenant_uuid || 'system';
          const uploadsRoot = resolve(join(process.cwd(), 'public', 'uploads'));
          const tenantPath = join(uploadsRoot, tenantFolder);
          const uploadPath = resolve(join(tenantPath, folder));
          
          // Verify resolved path stays within tenant directory
          if (!uploadPath.startsWith(tenantPath)) {
            cb(new BadRequestException('Invalid upload path'), null as any);
            return;
          }
          
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|webp|pdf|doc|docx)$/i)) {
          return cb(
            new BadRequestException(
              'Only images, PDFs and documents are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() request: any) {
    this.logger.debug(
      `Incoming upload request. Content-Type: ${request.headers['content-type']}`,
    );

    if (!file) {
      this.logger.error('Upload failed: No file received');
      throw new BadRequestException('File is required');
    }

    if (file.mimetype && file.mimetype.startsWith('image/')) {
      try {
        const originalPath = file.path;
        const newFilename = file.filename.replace(/\.[^/.]+$/, '.webp');
        const newPath = resolve(join(file.destination, newFilename));
        
        await sharp(originalPath)
          .webp({ quality: 80 })
          .toFile(newPath);
          
        fs.unlinkSync(originalPath); // hapus file gambar asli
        
        // update metadata file agar response sesuai
        file.filename = newFilename;
        file.path = newPath;
        file.mimetype = 'image/webp';
        file.size = fs.statSync(newPath).size;
        
        this.logger.log(`Image compressed to webp: ${newFilename} (${file.size} bytes)`);
      } catch (err) {
        this.logger.error(`Error compressing image ${file.filename}: ${err.message}`);
      }
    }

    this.logger.log(`File uploaded: ${file.filename} (${file.size} bytes) in folder: ${request.query.folder || 'root'}`);
    
    const tenantFolder = request.user?.tenant_uuid || 'system';
    
    if (tenantFolder !== 'system') {
      const tenant = await this.prisma.pesantren.findUnique({
        where: { id: tenantFolder }
      });
      
      if (tenant) {
        // Enforce storage limit
        if (Number(tenant.storage_used) + file.size > Number(tenant.storage_limit)) {
          fs.unlinkSync(file.path);
          this.logger.error(`Upload failed: Storage limit exceeded for tenant ${tenantFolder}`);
          throw new BadRequestException('Batas penyimpanan (storage) Anda telah habis. Silakan hubungi Superadmin untuk melakukan upgrade kapasitas.');
        }

        // Update storage used
        await this.prisma.pesantren.update({
          where: { id: tenantFolder },
          data: { storage_used: { increment: file.size } }
        });
      }
    }

    const folderPath = request.query.folder ? `/${request.query.folder}` : '';
    
    // Return the URL to the file
    return {
      url: `/uploads/${tenantFolder}${folderPath}/${file.filename}`,
      filename: file.filename,
    };
  }
}
