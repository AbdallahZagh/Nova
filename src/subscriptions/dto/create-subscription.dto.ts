import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'TRIAL',
  'PAUSED',
  'CANCELED',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

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

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'Figma' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  service: string;

  @ApiProperty({
    example: '20.00',
    description: 'Positive amount with up to 2 decimals',
  })
  @Transform(({ value }) => normalizeAmountInput(value))
  @IsString()
  @Matches(/^\d+\.\d{2}$/)
  @Validate(IsPositiveAmountConstraint)
  amount: string;

  @ApiProperty({ example: 'USD' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiProperty({ enum: SubscriptionIntervalUnit, example: 'MONTH' })
  @IsEnum(SubscriptionIntervalUnit)
  intervalUnit: SubscriptionIntervalUnit;

  @ApiProperty({ example: '2026-12-01T12:00:00.000Z' })
  @IsDateString()
  nextChargeAt: string;

  @ApiPropertyOptional({ example: 'Professional', nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  plan?: string | null;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalCount?: number;

  @ApiPropertyOptional({ example: '2026-11-20T12:00:00.000Z', nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  trialEndsAt?: string | null;

  @ApiPropertyOptional({ enum: SUBSCRIPTION_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  reason?: string | null;

  @ApiPropertyOptional({
    example: 'https://billing.example/cancel',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Validate(IsHttpUrlConstraint)
  cancelUrl?: string | null;

  @ApiPropertyOptional({ example: 3, default: 3, minimum: 0, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  reminderDays?: number;

  @ApiPropertyOptional({ example: 'Visa · 4242', nullable: true })
  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @IsString()
  paymentLabel?: string | null;
}
