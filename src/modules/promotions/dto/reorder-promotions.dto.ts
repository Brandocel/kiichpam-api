import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderPromotionItemDto {
  @IsString()
  id: string;

  @IsInt()
  order: number;
}

export class ReorderPromotionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderPromotionItemDto)
  items: ReorderPromotionItemDto[];
}