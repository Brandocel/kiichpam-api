import { PartialType } from '@nestjs/swagger';
import { CreateHeroSlideDto } from './create-hero-slide.dto';

export class UpdateHeroSlideDto extends PartialType(CreateHeroSlideDto) {}
