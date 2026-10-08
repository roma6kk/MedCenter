import { IsDateString } from 'class-validator';

/** API §5.2.5 `GenerateSlotsDto` — `to - from` must stay within 90 days. */
export class GenerateSlotsDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
