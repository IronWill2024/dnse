import { Controller, Get, Post, Put, Delete, Param, Query, Body, Headers, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiHeader, ApiBody } from '@nestjs/swagger';
import { DnseService } from './dnse.service';
import { MarketType, OrderCategory } from './enums/dnse.enum';
import { PostOrderDto, PutOrderDto, TradingTokenDto } from './dto/dnse.dto';

@ApiTags('DNSE Accounts & Orders')
@Controller('dnse')
export class DnseController {
  constructor(private readonly dnseApi: DnseService) {}

  /**
   * Setup credentials per-request (mapping 1:1 với PHP setupCredentials)
   */
  private setupCredentials(headers: Record<string, string>): void {
    const apiKey = headers['x-api-key'] || null;
    const apiSecret = headers['x-api-secret'] || null;
    const proxyUrl = headers['x-proxy-url'] || null;
    this.dnseApi.setCredentials(apiKey, apiSecret, proxyUrl);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Get all sub-accounts' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  @ApiHeader({ name: 'x-proxy-url', required: false })
  async getAccounts(@Headers() headers: Record<string, string>) {
    this.setupCredentials(headers);
    return this.dnseApi.getAccounts();
  }

  @Get('accounts/:accountNo/balances')
  @ApiOperation({ summary: 'Get balances for an account' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getBalances(
    @Param('accountNo') accountNo: string,
    @Headers() headers: Record<string, string>,
  ) {
    this.setupCredentials(headers);
    return this.dnseApi.getBalances(accountNo);
  }

  @Get('accounts/:accountNo/loan-packages')
  @ApiOperation({ summary: 'Get loan packages' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getLoanPackages(
    @Param('accountNo') accountNo: string,
    @Query('symbol') symbol: string,
    @Query('marketType') marketType: MarketType,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !symbol) throw new BadRequestException('Missing marketType or symbol query');
    this.setupCredentials(headers);
    return this.dnseApi.getLoanPackages(accountNo, marketType, symbol);
  }

  @Get('accounts/:accountNo/positions')
  @ApiOperation({ summary: 'Get positions' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'pageSize', required: true, type: Number })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getPositions(
    @Param('accountNo') accountNo: string,
    @Query('marketType') marketType: MarketType,
    @Query('pageSize') pageSize: number,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !pageSize) throw new BadRequestException('Invalid marketType or pageSize');
    this.setupCredentials(headers);
    return this.dnseApi.getPositions(accountNo, marketType, pageSize);
  }

  @Get('positions/:positionId')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getPositionById(
    @Param('positionId') positionId: string,
    @Query('marketType') marketType: MarketType,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType) throw new BadRequestException('Missing marketType');
    this.setupCredentials(headers);
    return this.dnseApi.getPositionById(positionId, marketType);
  }

  @Get('accounts/:accountNo/orders')
  @ApiOperation({ summary: 'Get active orders' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getOrders(
    @Param('accountNo') accountNo: string,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !orderCategory) throw new BadRequestException('Invalid marketType or orderCategory');
    this.setupCredentials(headers);
    return this.dnseApi.getOrders(accountNo, marketType, orderCategory);
  }

  @Get('accounts/:accountNo/orders/:orderId')
  @ApiOperation({ summary: 'Get order detail' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getOrderDetail(
    @Param('accountNo') accountNo: string,
    @Param('orderId') orderId: string,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !orderCategory) throw new BadRequestException('Invalid marketType or orderCategory');
    this.setupCredentials(headers);
    return this.dnseApi.getOrderDetail(accountNo, orderId, marketType, orderCategory);
  }

  @Get('accounts/:accountNo/executions/:orderId')
  @ApiOperation({ summary: 'Get order execution detail (DERIVATIVE only)' })
  @ApiQuery({ name: 'marketType', enum: [MarketType.DERIVATIVE], required: true, description: 'Chỉ hỗ trợ thị trường Phái sinh (DERIVATIVE)' })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getExecutionDetail(
    @Param('accountNo') accountNo: string,
    @Param('orderId') orderId: string,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
    @Headers() headers: Record<string, string>,
  ) {
    if (marketType !== MarketType.DERIVATIVE) {
      throw new BadRequestException('Endpoint này chỉ hỗ trợ marketType là DERIVATIVE');
    }
    this.setupCredentials(headers);
    return this.dnseApi.getExecutionDetail(accountNo, orderId, marketType, orderCategory);
  }

  @Get('accounts/:accountNo/orders-history')
  @ApiOperation({ summary: 'Get order history' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getOrderHistory(
    @Param('accountNo') accountNo: string,
    @Query('marketType') marketType: MarketType,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !fromDate || !toDate) throw new BadRequestException('Invalid params');
    this.setupCredentials(headers);
    return this.dnseApi.getOrderHistory(accountNo, marketType, fromDate, toDate);
  }

  @Get('accounts/:accountNo/corporate-action-history')
  @ApiOperation({ summary: 'Get corporate action history' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getCorporateActionHistory(
    @Param('accountNo') accountNo: string,
    @Headers() headers: Record<string, string>,
  ) {
    this.setupCredentials(headers);
    return this.dnseApi.getCorporateActionHistory(accountNo);
  }

  @Get('accounts/:accountNo/ppse')
  @ApiOperation({ summary: 'Get PPSE (Purchasing Power)' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'price', required: true, type: Number, description: 'Giá định dạng nguyên VNĐ (Ví dụ: 15500, không phải 15.5)' })
  @ApiQuery({ name: 'loanPackageId', required: true, type: Number })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getPpse(
    @Param('accountNo') accountNo: string,
    @Query('symbol') symbol: string,
    @Query('price') price: number,
    @Query('marketType') marketType: MarketType,
    @Query('loanPackageId') loanPackageId: number,
    @Headers() headers: Record<string, string>,
  ) {
    if (!marketType || !symbol || !price || !loanPackageId) throw new BadRequestException('Invalid params');
    this.setupCredentials(headers);
    return this.dnseApi.getPpse(accountNo, marketType, symbol, loanPackageId, price);
  }

  @Post('accounts/orders')
  @ApiOperation({ summary: 'Place a new order' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'trading-token', required: true, description: 'Smart OTP trading token' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  @ApiBody({ type: PostOrderDto, description: 'Order payload' })
  async postOrder(
    @Headers() headers: Record<string, string>,
    @Body() payload: PostOrderDto,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
  ) {
    const tradingToken = headers['trading-token'];
    if (!marketType || !orderCategory || !tradingToken || !payload) {
      throw new BadRequestException('Invalid params or body');
    }
    this.setupCredentials(headers);
    return this.dnseApi.postOrder(marketType, orderCategory, tradingToken, payload);
  }

  @Put('accounts/:accountNo/orders/:orderId')
  @ApiOperation({ summary: 'Modify an order' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'trading-token', required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  @ApiBody({ type: PutOrderDto, description: 'Order modification payload' })
  async putOrder(
    @Param('accountNo') accountNo: string,
    @Param('orderId') orderId: string,
    @Headers() headers: Record<string, string>,
    @Body() payload: PutOrderDto,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
  ) {
    const tradingToken = headers['trading-token'];
    if (!marketType || !orderCategory || !tradingToken || !payload) {
      throw new BadRequestException('Invalid params or body');
    }
    this.setupCredentials(headers);
    return this.dnseApi.putOrder(accountNo, orderId, marketType, orderCategory, tradingToken, payload);
  }

  @Delete('accounts/:accountNo/orders/:orderId')
  @ApiOperation({ summary: 'Cancel an order' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiQuery({ name: 'orderCategory', enum: OrderCategory, required: true })
  @ApiHeader({ name: 'trading-token', required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async cancelOrder(
    @Param('accountNo') accountNo: string,
    @Param('orderId') orderId: string,
    @Headers() headers: Record<string, string>,
    @Query('marketType') marketType: MarketType,
    @Query('orderCategory') orderCategory: OrderCategory,
  ) {
    const tradingToken = headers['trading-token'];
    if (!marketType || !orderCategory || !tradingToken) throw new BadRequestException('Invalid params');
    this.setupCredentials(headers);
    return this.dnseApi.cancelOrder(accountNo, orderId, marketType, orderCategory, tradingToken);
  }

  @Post('accounts/positions/:positionId/close')
  @ApiOperation({ summary: 'Close a position' })
  @ApiQuery({ name: 'marketType', enum: MarketType, required: true })
  @ApiHeader({ name: 'trading-token', required: true })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async closePosition(
    @Param('positionId') positionId: string,
    @Headers() headers: Record<string, string>,
    @Query('marketType') marketType: MarketType,
  ) {
    const tradingToken = headers['trading-token'];
    if (!marketType || !tradingToken) throw new BadRequestException('Invalid params');
    this.setupCredentials(headers);
    return this.dnseApi.closePosition(positionId, marketType, tradingToken);
  }

  @ApiTags('DNSE Auth & Config')
  @Get('market/working-dates')
  @ApiOperation({ summary: 'Get working dates' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async getWorkingDates(@Headers() headers: Record<string, string>) {
    this.setupCredentials(headers);
    return this.dnseApi.getWorkingDates();
  }

  @ApiTags('DNSE Auth & Config')
  @Post('registration/trading-token')
  @ApiOperation({ summary: 'Create trading token via OTP' })
  @ApiBody({ type: TradingTokenDto })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async createTradingToken(
    @Body() body: TradingTokenDto,
    @Headers() headers: Record<string, string>,
  ) {
    this.setupCredentials(headers);
    return this.dnseApi.createTradingToken(body.otpType, body.passcode);
  }

  @ApiTags('DNSE Auth & Config')
  @Post('registration/send-email-otp')
  @ApiOperation({ summary: 'Send email OTP' })
  @ApiHeader({ name: 'x-api-key', required: false })
  @ApiHeader({ name: 'x-api-secret', required: false })
  async sendEmailOtp(@Headers() headers: Record<string, string>) {
    this.setupCredentials(headers);
    return this.dnseApi.sendEmailOtp();
  }
}
