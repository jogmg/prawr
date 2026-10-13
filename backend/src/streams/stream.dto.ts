import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  Min,
} from "class-validator";
import {
  MAX_STREAM_RATE_PER_MINUTE,
  MIN_STREAM_RATE_PER_MINUTE,
} from "./stream.constants";

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

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  playbackUrl!: string;

  @IsNumber()
  @Min(MIN_STREAM_RATE_PER_MINUTE)
  @Max(MAX_STREAM_RATE_PER_MINUTE)
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
  authorizationHash!: string;

  @IsOptional()
  @IsString()
  issuedAt?: string;
}

export class WatchSessionControlDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
