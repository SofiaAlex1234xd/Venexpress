import { IsNumber, Min } from 'class-validator';

export class UpdateBalanceDto {
  @IsNumber()
  @Min(0)
  balance: number; // Nuevo saldo total
}

