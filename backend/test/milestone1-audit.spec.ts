import { BadRequestException } from '@nestjs/common';
import { buildSafeRegex } from '../src/common/utils/regex.util';
import { parseRfc4180Csv } from '../src/common/utils/csv.util';
import { UploadsService } from '../src/modules/uploads/uploads.service';
import { AirlinesService } from '../src/modules/airlines/airlines.service';

describe('Milestone 1 Security, Concurrency & Validation Audit Suite', () => {
  describe('1. Regex Injection Protection (GEN-02, GEN-13)', () => {
    it('escapes special regex characters like "(" or "[" without throwing 500', () => {
      expect(() => buildSafeRegex('(')).not.toThrow();
      expect(() => buildSafeRegex('[test*(a+b)')).not.toThrow();
      const rx = buildSafeRegex('Cairo (CAI)');
      expect(rx.test('Flight to Cairo (CAI) Airport')).toBe(true);
    });
  });

  describe('2. RFC-4180 CSV Reference Parser (GEN-12)', () => {
    it('correctly parses quoted fields containing commas and newlines', () => {
      const csv = 'code,name,currency\nEG,"Egypt, Arab Republic",EGP\nUS,United States,USD';
      const rows = parseRfc4180Csv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ code: 'EG', name: 'Egypt, Arab Republic', currency: 'EGP' });
    });
  });

  describe('3. Image Upload Magic Bytes & Size Validation (GEN-08)', () => {
    const uploadsService = new UploadsService();

    it('rejects a .exe binary disguised with a .png extension and image/png mimetype', () => {
      const fakePngExe: any = {
        originalname: 'malware.png',
        mimetype: 'image/png',
        size: 1024,
        // MZ header for Windows .exe instead of PNG 89 50 4E 47
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]),
      };
      expect(() => uploadsService.validateAndSaveImage(fakePngExe)).toThrow(BadRequestException);
    });

    it('rejects files larger than 5 MB (6 MB test)', () => {
      const validPngHeader = Buffer.alloc(6 * 1024 * 1024);
      validPngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      const oversizedFile: any = {
        originalname: 'large.png',
        mimetype: 'image/png',
        size: 6 * 1024 * 1024,
        buffer: validPngHeader,
      };
      expect(() => uploadsService.validateAndSaveImage(oversizedFile)).toThrow(BadRequestException);
    });
  });

  describe('4. Cancellation Tier Boundary Calculation (FLT-09)', () => {
    const airlinesService = new AirlinesService({} as any);
    const tiers = [
      { daysBeforeDeparture: 7, refundPercentage: 80 },
      { daysBeforeDeparture: 2, refundPercentage: 50 },
      { daysBeforeDeparture: 0, refundPercentage: 0 },
    ];

    it('selects the highest tier threshold not exceeding days remaining', () => {
      const eightDaysOut = new Date(Date.now() + 8.5 * 24 * 60 * 60 * 1000);
      const threeDaysOut = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000);
      const oneDayOut = new Date(Date.now() + 1.2 * 24 * 60 * 60 * 1000);

      expect(airlinesService.computeRefundPercentage(tiers, eightDaysOut)).toBe(80);
      expect(airlinesService.computeRefundPercentage(tiers, threeDaysOut)).toBe(50);
      expect(airlinesService.computeRefundPercentage(tiers, oneDayOut)).toBe(0);
    });
  });
});
