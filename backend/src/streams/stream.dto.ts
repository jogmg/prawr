import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";

export class CreateStreamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  creatorId!: string;

  @IsString()
  @IsNotEmpty()
  creatorWallet!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsNumber()
  @IsPositive()
  ratePerMinute!: number;

  @IsOptional()
  @IsString()
  status?: "live" | "scheduled" | "offline";
}

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  viewerWallet!: string;

  @IsString()
  @IsNotEmpty()
  maxCharge!: string;

  @IsString()
  @IsNotEmpty()
  authorizationHash!: string;

  @IsOptional()
  @IsString()
  issuedAt?: string;
}
