import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'auditor@agency.mil' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password (minimum 8 characters)', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ description: 'User email address', example: 'auditor@agency.mil' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password with minimum 8 chars, at least one uppercase, one lowercase, and one number', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ description: 'Full name of the user' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}
