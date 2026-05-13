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
import { extname, join } from 'path';
import * as fs from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file, cb) => {
          const folder = req.query.folder || '';
          const uploadPath = join(process.cwd(), 'public', 'uploads', folder);
          
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
        if (!file.originalname.match(/\.(jpg|jpeg|png|pdf|doc|docx)$/i)) {
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
  uploadFile(@UploadedFile() file: Express.Multer.File, @Req() request: any) {
    this.logger.debug(
      `Incoming upload request. Content-Type: ${request.headers['content-type']}`,
    );

    if (!file) {
      this.logger.error('Upload failed: No file received');
      throw new BadRequestException('File is required');
    }
    this.logger.log(`File uploaded: ${file.filename} (${file.size} bytes) in folder: ${request.query.folder || 'root'}`);
    
    const folderPath = request.query.folder ? `/${request.query.folder}` : '';
    
    // Return the URL to the file
    return {
      url: `/uploads${folderPath}/${file.filename}`,
      filename: file.filename,
    };
  }
}
