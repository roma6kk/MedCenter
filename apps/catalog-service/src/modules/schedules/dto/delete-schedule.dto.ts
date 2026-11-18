import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class DeleteScheduleDto {
  @ApiPropertyOptional({
    description: 'Also remove the free slots; busy slots always protect the schedule',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}
