import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreatePostDto {
  @ApiProperty({ example: '7 Days in Cairo and Luxor: Complete Guide' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Here is our full experience exploring Cairo...' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ enum: ['Draft', 'Published'], default: 'Draft' })
  @IsOptional()
  @IsEnum(['Draft', 'Published'])
  status?: 'Draft' | 'Published' = 'Draft';

  @ApiPropertyOptional({
    type: [String],
    example: ['egypt', 'cairo', 'budget-travel'],
    description: 'Up to 5 tags, max 30 characters each (BLG-08)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}

export class UpdatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ enum: ['Draft', 'Published'] })
  @IsOptional()
  @IsEnum(['Draft', 'Published'])
  status?: 'Draft' | 'Published';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}

export class CreateCommentDto {
  @ApiProperty({ example: 'Great tips on transport around Giza!', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}

export class AttachItineraryToPostDto {
  @ApiProperty({ description: 'Itinerary ObjectId (BLG-13 Optional)' })
  @IsString()
  @IsNotEmpty()
  itineraryId: string;
}

export class BrowsePostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tag (BLG-02, BLG-08)' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description:
      'Search keyword in title, tags, or author name ordered by (likes + comments) desc (BLG-09)',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
