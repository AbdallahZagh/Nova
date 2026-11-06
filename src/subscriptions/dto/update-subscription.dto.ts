import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SubscriptionIntervalUnit } from '../../generated/prisma/enums.js';
import {
  isHttpUrl,
  isPositiveMoney,
  normalizeAmountInput,
} from '../subscription.logic';
import { SUBSCRIPTION_STATUSES } from './create-subscription.dto';

@ValidatorConstraint({ name: 'isPositiveAmount', async: false })
class IsPositiveAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isPositiveMoney(value);
  }

  defaultMessage() {
    return 'amount must be greater than 0';
  }
}

@ValidatorConstraint({ name: 'isHttpUrl', async: false })
class IsHttpUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isHttpUrl(value);
  }

  defaultMessage() {
    return 'cancelUrl must start with http:// or https://';
  }
}

function optionalText(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ example: 'Figma' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  service?: string;

  @ApiPropertyOptional({ example: '25.00' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => normalizeAmountInput(value))
  @IsString()
  @Matches(/^\d+\.\d{2}$/)
  @Validate(IsPositiveAmountConstraint)
  amount?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ enum: SubscriptionIntervalUnit })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(SubscriptionIntervalUnit)
  intervalUnit?: SubscriptionIntervalUnit;

  @ApiPropertyOptional({ example: '2026-12-01T12:00:00.000Z' })
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString()
  nextChargeAt?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  plan?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalCount?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  trialEndsAt?: string | null;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: (typeof SUBSCRIPTION_STATUSES)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Validate(IsHttpUrlConstraint)
  cancelUrl?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 90 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  reminderDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  paymentLabel?: string | null;
}
