import { IsIn, IsOptional } from 'class-validator';

import { PageQueryDto } from './page-query.dto';

/**
 * API §6.2 `GET /appointments?upcoming=&page=&pageSize=&sortOrder=`.
 *
 * There is deliberately no `patient` field: the compartment comes from the
 * token (ADR-013), and the global `whitelist` pipe drops an undeclared
 * `patient` query parameter before it reaches the handler.
 */
export class ListAppointmentsQueryDto extends PageQueryDto {
  /** `true` keeps appointments starting now or later; all appointments otherwise. */
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: 'true' | 'false';
}
