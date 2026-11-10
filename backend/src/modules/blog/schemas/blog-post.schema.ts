import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BlogPostDocument = BlogPost & Document;

@Schema({ _id: false })
export class PostImage {
  @Prop({ required: true })
  imageId: string;

  @Prop({ required: true })
  url: string;
}

@Schema({ timestamps: true })
export class BlogPost {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({
    required: true,
    enum: ['Draft', 'Published'],
    default: 'Draft',
  })
  status: 'Draft' | 'Published';

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [PostImage], default: [] })
  images: PostImage[];

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ type: Types.ObjectId, ref: 'Itinerary', default: null })
  attachedItineraryId: Types.ObjectId | null;

  @Prop({ default: false })
  isHidden: boolean;

  @Prop({ default: false })
  isHiddenByDeactivation: boolean;
}

export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);
