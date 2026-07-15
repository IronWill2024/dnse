import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { OrderSide, OrderType, OtpType } from '../enums/dnse.enum';

export class TradingTokenDto {
  @ApiProperty({ enum: OtpType, default: OtpType.SMART_OTP })
  @IsEnum(OtpType)
  otpType: OtpType;

  @ApiProperty()
  @IsString()
  passcode: string;
}

export class SendEmailOtpDto {
  // Empty body
}

export class PostOrderDto {
  @ApiProperty()
  @IsString()
  accountNo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  loanPackageId?: number;

  @ApiProperty({ enum: OrderType, description: 'Chỉ chấp nhận MTL và ATC, lệnh LO cho upcom nếu không dùng được MTL' })
  @IsEnum(OrderType)
  orderType: OrderType;

  @ApiProperty({ description: 'Giá định dạng nguyên VNĐ (Ví dụ: 15500, không phải 15.5)' })
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ enum: OrderSide, description: 'NB: Mua, NS: Bán' })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiProperty()
  @IsString()
  symbol: string;
}

export class PutOrderDto {
  @ApiProperty({ description: 'Giá định dạng nguyên VNĐ (Ví dụ: 15500, không phải 15.5)' })
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsNumber()
  quantity: number;
}
