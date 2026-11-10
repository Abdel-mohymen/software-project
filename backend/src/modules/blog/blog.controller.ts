import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { BlogService } from './blog.service';
import {
  AttachItineraryToPostDto,
  BrowsePostsQueryDto,
  CreateCommentDto,
  CreatePostDto,
  UpdatePostDto,
} from './dto/blog.dto';

@ApiTags('Blog & Community (BLG-01..13)')
@Controller('api')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Post('posts')
  @ApiOperation({ summary: 'Create a blog post in Draft or Published status (BLG-01)' })
  async createPost(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.blogService.createPost(userId, dto);
  }

  @Public()
  @Get('posts')
  @ApiOperation({
    summary:
      'Browse or search published posts filterable by tag or keyword ordered by interaction score (BLG-02, BLG-09)',
  })
  async listPosts(@Query() query: BrowsePostsQueryDto) {
    return this.blogService.browseOrSearchPosts(query);
  }

  @Get('posts/mine')
  @ApiOperation({
    summary: 'List current user posts including Drafts with like and comment counts (BLG-03)',
  })
  async getMyPosts(@CurrentUser('id') userId: string) {
    return this.blogService.getMyPosts(userId);
  }

  @Public()
  @Get('posts/:id')
  @ApiOperation({ summary: 'Get blog post details and chronological comments (BLG-02, BLG-05)' })
  async getPost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.blogService.getPostById(user, id);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Edit own blog post and tags (BLG-04, BLG-08)' })
  async updatePost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.blogService.updatePost(userId, id, dto);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete own blog post (BLG-04)' })
  async deletePost(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.blogService.deletePost(userId, id);
  }

  @Post('posts/:id/comments')
  @ApiOperation({
    summary: 'Comment on a published post (max 500 chars, chronological) (BLG-05)',
  })
  async addComment(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.blogService.addComment(userId, postId, dto);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edit own comment (BLG-07)' })
  async updateComment(
    @CurrentUser('id') userId: string,
    @Param('id') commentId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.blogService.updateComment(userId, commentId, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete own comment (BLG-07)' })
  async deleteComment(@CurrentUser('id') userId: string, @Param('id') commentId: string) {
    return this.blogService.deleteComment(userId, commentId);
  }

  @Post('posts/:id/like')
  @ApiOperation({ summary: 'Like a published post at most once (BLG-06)' })
  async likePost(@CurrentUser('id') userId: string, @Param('id') postId: string) {
    return this.blogService.likePost(userId, postId);
  }

  @Delete('posts/:id/like')
  @ApiOperation({ summary: 'Remove like from a post (BLG-06)' })
  async unlikePost(@CurrentUser('id') userId: string, @Param('id') postId: string) {
    return this.blogService.unlikePost(userId, postId);
  }

  @Post('posts/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Attach an image (JPG/PNG <=5MB, max 5) to a post (BLG-10, GEN-08)' })
  async addPostImage(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body('url') imageUrl?: string,
  ) {
    return this.blogService.addPostImage(userId, postId, file, imageUrl);
  }

  @Delete('posts/:id/images/:imageId')
  @ApiOperation({ summary: 'Remove an image from a blog post (BLG-10)' })
  async removePostImage(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.blogService.removePostImage(userId, postId, imageId);
  }

  @Public()
  @Get('tags/:tag/posts')
  @ApiOperation({ summary: 'List published posts matching a tag (BLG-08)' })
  async getPostsByTag(
    @Param('tag') tag: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.blogService.getPostsByTag(tag, query.page, query.limit);
  }

  @Public()
  @Get('authors/:id')
  @ApiOperation({
    summary: 'Public author page showing name, join date, published posts, and public itineraries (BLG-12)',
  })
  async getAuthorPage(@Param('id') authorId: string) {
    return this.blogService.getAuthorPublicProfile(authorId);
  }

  @Patch('posts/:id/itinerary')
  @ApiOperation({ summary: 'Attach an itinerary to a blog post (BLG-13 Optional)' })
  async attachItinerary(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() dto: AttachItineraryToPostDto,
  ) {
    return this.blogService.attachItineraryToPost(userId, postId, dto.itineraryId);
  }
}
