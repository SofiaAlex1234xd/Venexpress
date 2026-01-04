import { IsNumber, Min, IsString, IsOptional } from 'class-validator';

export class AddBalanceDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}

