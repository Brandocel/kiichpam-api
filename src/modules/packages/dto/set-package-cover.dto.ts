import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetPackageCoverDto {
  @ApiProperty({ example: '2dd6d7bb-a250-4344-ad69-5c5f9c688bed' })
  @IsUUID()
  mediaId: string;
}
