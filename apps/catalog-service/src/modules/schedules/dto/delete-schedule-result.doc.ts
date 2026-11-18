import { ApiProperty } from '@nestjs/swagger';

export class DeleteScheduleResultDoc {
  @ApiProperty({
    description: 'true: the schedule was deactivated (active=false) because appointments still reference its slots; false: it was deleted',
    example: false,
  })
  deactivated!: boolean;
}
