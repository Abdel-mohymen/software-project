import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (GEN-08)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

@Injectable()
export class UploadsService {
  validateAndSaveImage(file: Express.Multer.File, prefix = 'img'): { imageId: string; url: string } {
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    if (
      !ALLOWED_MIME_TYPES.includes(file.mimetype?.toLowerCase()) ||
      !ALLOWED_EXTENSIONS.includes(ext)
    ) {
      throw new BadRequestException('Only JPG and PNG image formats are allowed (GEN-08).');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Image file size must not exceed 5 MB (GEN-08).');
    }

    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const imageId = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const fileName = `${imageId}${ext}`;
    const fullPath = path.join(uploadsDir, fileName);

    if (file.buffer) {
      fs.writeFileSync(fullPath, file.buffer);
    }

    return {
      imageId,
      url: `/uploads/${fileName}`,
    };
  }
}
