import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** API §5.2.4 delete body. `cascade=true` removes free slots; busy slots stay (BR-001). */
export class DeleteScheduleDto {
  @ApiPropertyOptional({
    description: 'Also remove the free slots; busy slots always protect the schedule',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}
