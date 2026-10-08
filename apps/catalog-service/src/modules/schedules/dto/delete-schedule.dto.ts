import { IsBoolean, IsOptional } from 'class-validator';

/** API §5.2.4 delete body. `cascade=true` removes free slots; busy slots stay (BR-001). */
export class DeleteScheduleDto {
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}
