import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { IsUsername } from '../common/validators/is-username.decorator';
import { SuperAdminSetupGuard } from './super-admin-setup.guard';
import { SuperAdminSetupService } from './super-admin-setup.service';

class CreateSuperAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsUsername()
  username!: string;
}

@ApiExcludeController()
@UseGuards(SuperAdminSetupGuard)
@Controller()
export class SuperAdminSetupController {
  constructor(private readonly setup: SuperAdminSetupService) {}

  @Post('api/_/provision')
  create(@Body() dto: CreateSuperAdminDto) {
    return this.setup.create(dto);
  }
}
