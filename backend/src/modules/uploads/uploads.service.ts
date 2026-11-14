import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (GEN-08)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

@Injectable()
export class UploadsService {
  private hasValidImageMagicBytes(buffer: Buffer, ext: string): boolean {
    if (!buffer || buffer.length < 8) return false;

    // PNG Magic Bytes: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    // JPEG Magic Bytes: FF D8 FF
    const isJpeg =
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    if (ext === '.png') return isPng;
    if (ext === '.jpg' || ext === '.jpeg') return isJpeg;
    return false;
  }

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

    if (!file.buffer || !this.hasValidImageMagicBytes(file.buffer, ext)) {
      throw new BadRequestException(
        'Invalid image file content: binary file signature (magic bytes) does not match a valid JPG or PNG image (GEN-08).',
      );
    }

    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const imageId = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const fileName = `${imageId}${ext}`;
    const fullPath = path.join(uploadsDir, fileName);

    fs.writeFileSync(fullPath, file.buffer);

    return {
      imageId,
      url: `/uploads/${fileName}`,
    };
  }
}
