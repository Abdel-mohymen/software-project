import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogPost, BlogPostDocument } from './schemas/blog-post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Itinerary, ItineraryDocument } from '../itineraries/schemas/itinerary.schema';
import { UploadsService } from '../uploads/uploads.service';
import {
  BrowsePostsQueryDto,
  CreateCommentDto,
  CreatePostDto,
  UpdatePostDto,
} from './dto/blog.dto';
import { AccountStatus, UserRole } from '../../common/enums/role.enum';
import { paginateResult } from '../../common/dto/pagination.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPostDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
    private readonly uploadsService: UploadsService,
  ) {}

  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    if (tags.length > 5) {
      throw new BadRequestException('A post can have at most 5 tags (BLG-08).');
    }
    const clean = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    for (const tag of clean) {
      if (tag.length > 30) {
        throw new BadRequestException('Each tag must be at most 30 characters (BLG-08).');
      }
    }
    return Array.from(new Set(clean));
  }

  async createPost(authorId: string, dto: CreatePostDto) {
    return this.postModel.create({
      authorId: new Types.ObjectId(authorId),
      title: dto.title.trim(),
      body: dto.body,
      status: dto.status || 'Draft',
      tags: this.normalizeTags(dto.tags),
      images: [],
    });
  }

  async browseOrSearchPosts(query: BrowsePostsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const baseFilter: any = {
      status: 'Published',
      isHidden: { $ne: true },
      isHiddenByDeactivation: { $ne: true },
    };

    if (query.tag) {
      baseFilter.tags = query.tag.trim().toLowerCase();
    }

    if (query.search) {
      // BLG-09: search published posts by keyword in title, tags or author name; ordered by interaction score (likes + comments) desc, newest first tie-breaker
      const regex = new RegExp(query.search.trim(), 'i');
      const matchingAuthors = await this.userModel.find({ name: regex }).select('_id').lean();
      const authorIds = matchingAuthors.map((u) => u._id);

      baseFilter.$or = [
        { title: regex },
        { tags: regex },
        { authorId: { $in: authorIds } },
      ];

      const allMatches = await this.postModel
        .find(baseFilter)
        .populate('authorId', 'name createdAt')
        .lean();

      allMatches.sort((a: any, b: any) => {
        const scoreA = (a.likesCount || 0) + (a.commentsCount || 0);
        const scoreB = (b.likesCount || 0) + (b.commentsCount || 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const formatted = allMatches.map((p: any) => ({
        ...p,
        excerpt: (p.body || '').slice(0, 180),
        interactionScore: (p.likesCount || 0) + (p.commentsCount || 0),
      }));

      const paged = formatted.slice((page - 1) * limit, page * limit);
      return {
        ...paginateResult(paged, formatted.length, page, limit),
        message: formatted.length === 0 ? 'no results' : undefined,
      };
    }

    const [items, total] = await Promise.all([
      this.postModel
        .find(baseFilter)
        .populate('authorId', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(baseFilter),
    ]);

    return paginateResult(items, total, page, limit);
  }

  async getMyPosts(userId: string) {
    return this.postModel
      .find({ authorId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getPostById(user: any, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post ID.');
    }

    const post = await this.postModel
      .findById(postId)
      .populate('authorId', 'name createdAt status')
      .lean();

    if (!post) {
      throw new NotFoundException('Blog post not found.');
    }

    const authorIdStr = (post.authorId as any)?._id?.toString() || post.authorId.toString();
    const isAuthor = user && user.id === authorIdStr;
    const isAdmin = user && user.role === UserRole.ADMIN;

    if ((post.status === 'Draft' || post.isHidden || post.isHiddenByDeactivation) && !isAuthor && !isAdmin) {
      throw new NotFoundException('Blog post is not publicly available.');
    }

    const comments = await this.commentModel
      .find({ postId: post._id, isHidden: { $ne: true } })
      .populate('authorId', 'name status')
      .sort({ createdAt: 1 }) // BLG-05: chronological order
      .lean();

    const formattedComments = comments.map((c: any) => {
      const cAuthor = c.authorId;
      const isDeactivated = !cAuthor || cAuthor.status === AccountStatus.DEACTIVATED;
      return {
        ...c,
        authorName: isDeactivated ? 'Deleted user' : cAuthor.name,
        authorId: isDeactivated ? null : cAuthor._id,
      };
    });

    return {
      ...post,
      comments: formattedComments,
    };
  }

  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own posts (BLG-04).');
    }

    if (dto.title !== undefined) post.title = dto.title.trim();
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.status !== undefined) post.status = dto.status;
    if (dto.tags !== undefined) post.tags = this.normalizeTags(dto.tags);

    await post.save();
    return post;
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own posts (BLG-04).');
    }

    await Promise.all([
      this.commentModel.deleteMany({ postId: post._id }),
      this.likeModel.deleteMany({ postId: post._id }),
      this.postModel.deleteOne({ _id: post._id }),
    ]);

    return { message: 'Blog post deleted successfully (BLG-04).' };
  }

  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.postModel.findById(postId);
    if (!post || post.status !== 'Published' || post.isHidden) {
      throw new NotFoundException('Published blog post not found (BLG-05).');
    }

    const comment = await this.commentModel.create({
      postId: post._id,
      authorId: new Types.ObjectId(userId),
      content: dto.content.trim(),
    });

    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    return comment;
  }

  async updateComment(userId: string, commentId: string, dto: CreateCommentDto) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own comments (BLG-07).');
    }

    comment.content = dto.content.trim();
    await comment.save();
    return comment;
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own comments (BLG-07).');
    }

    await this.commentModel.deleteOne({ _id: comment._id });
    await this.postModel.updateOne(
      { _id: comment.postId, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
    );

    return { message: 'Comment deleted (BLG-07).' };
  }

  async likePost(userId: string, postId: string) {
    const post = await this.postModel.findById(postId);
    if (!post || post.status !== 'Published') {
      throw new NotFoundException('Published post not found.');
    }

    const existing = await this.likeModel.findOne({
      postId: post._id,
      userId: new Types.ObjectId(userId),
    });

    if (existing) {
      throw new ConflictException('You have already liked this post (BLG-06).');
    }

    await this.likeModel.create({
      postId: post._id,
      userId: new Types.ObjectId(userId),
    });

    post.likesCount = (post.likesCount || 0) + 1;
    await post.save();

    return { postId: post._id, likesCount: post.likesCount, liked: true };
  }

  async unlikePost(userId: string, postId: string) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');

    const deleted = await this.likeModel.findOneAndDelete({
      postId: post._id,
      userId: new Types.ObjectId(userId),
    });

    if (deleted && post.likesCount > 0) {
      post.likesCount -= 1;
      await post.save();
    }

    return { postId: post._id, likesCount: post.likesCount, liked: false };
  }

  async addPostImage(
    userId: string,
    postId: string,
    file?: Express.Multer.File,
    imageUrl?: string,
  ) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only upload images to your own posts (BLG-10).');
    }

    if (post.images.length >= 5) {
      throw new BadRequestException('A blog post can have at most 5 images (GEN-08, BLG-10).');
    }

    const media = file
      ? this.uploadsService.validateAndSaveImage(file, 'post')
      : { imageId: `post-${Date.now()}`, url: imageUrl || '/uploads/sample-post.jpg' };

    post.images.push(media);
    await post.save();
    return post;
  }

  async removePostImage(userId: string, postId: string, imageId: string) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own posts.');
    }

    post.images = post.images.filter((img) => img.imageId !== imageId);
    await post.save();
    return post;
  }

  async getPostsByTag(tag: string, page = 1, limit = 10) {
    return this.browseOrSearchPosts({ tag, page, limit });
  }

  async getAuthorPublicProfile(authorId: string) {
    if (!Types.ObjectId.isValid(authorId)) {
      throw new BadRequestException('Invalid author ID.');
    }

    const user: any = await this.userModel
      .findById(authorId)
      .select('name createdAt status')
      .lean();

    if (!user || user.status === AccountStatus.DEACTIVATED) {
      throw new NotFoundException('Author profile not found.');
    }

    const [publishedPosts, publicItineraries] = await Promise.all([
      this.postModel
        .find({
          authorId: user._id,
          status: 'Published',
          isHidden: { $ne: true },
          isHiddenByDeactivation: { $ne: true },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.itineraryModel
        .find({
          ownerId: user._id,
          visibility: 'public',
          isHidden: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    return {
      author: {
        id: user._id,
        name: user.name,
        joinDate: user.createdAt,
      },
      publishedPosts,
      publicItineraries,
    };
  }

  async attachItineraryToPost(userId: string, postId: string, itineraryId: string) {
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorId.toString() !== userId) {
      throw new ForbiddenException('Only the post author can attach an itinerary (BLG-13).');
    }

    post.attachedItineraryId = new Types.ObjectId(itineraryId);
    await post.save();
    return post;
  }
}
