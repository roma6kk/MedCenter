import { ApiProperty } from '@nestjs/swagger';

export class ClinicResponseDto {
  @ApiProperty({ example: 'ООО «Лайфлайн»' })
  name!: string;

  @ApiProperty({ example: '+375 17 000-00-00' })
  phone!: string;

  @ApiProperty({ example: 'info@lifeline.example' })
  email!: string;

  @ApiProperty({ example: 'г. Минск, ул. Здоровья, 12' })
  address!: string;

  @ApiProperty({ example: 'Пн–Пт 08:00–20:00, сб 09:00–15:00' })
  hours!: string;
}
