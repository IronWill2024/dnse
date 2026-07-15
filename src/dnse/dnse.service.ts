import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { buildSignature, formatDateHeader } from './utils/common.utils';
import { MarketType, OrderCategory, OtpType } from './enums/dnse.enum';

export const DNSE_OPTIONS = 'DNSE_OPTIONS';

export interface DnseClientOptions {
  baseUrl?: string;
  algorithm?: string;
  hmacNonceEnabled?: boolean;
}

@Injectable()
export class DnseService {
  private baseUrl: string;
  private algorithm: string;
  private hmacNonceEnabled: boolean;

  // Per-request credentials (set by controller before each call)
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private proxyUrl: string | null = null;

  constructor(
    @Inject(DNSE_OPTIONS) private options: DnseClientOptions,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = (options.baseUrl || 'https://openapi.dnse.com.vn').replace(/\/$/, '');
    this.algorithm = options.algorithm || 'hmac-sha256';
    this.hmacNonceEnabled = options.hmacNonceEnabled !== false;
  }

  /**
   * Set credentials per-request (mapping 1:1 với PHP setupCredentials)
   */
  setCredentials(apiKey: string | null, apiSecret: string | null, proxyUrl: string | null = null): void {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.proxyUrl = proxyUrl;
  }

  async getAccounts() {
    return this.request('GET', '/accounts');
  }

  async getBalances(accountNo: string) {
    return this.request('GET', `/accounts/${accountNo}/balances`);
  }

  async getLoanPackages(accountNo: string, marketType: MarketType, symbol: string) {
    return this.request('GET', `/accounts/${accountNo}/loan-packages`, {
      query: { marketType, symbol },
    });
  }

  async getPositions(accountNo: string, marketType: MarketType, pageSize: number) {
    return this.request('GET', `/accounts/${accountNo}/positions`, {
      query: { marketType, pageSize },
    });
  }

  async getPositionById(positionId: string, marketType: MarketType) {
    return this.request('GET', `/accounts/positions/${positionId}`, {
      query: { marketType },
    });
  }

  async getOrders(accountNo: string, marketType: MarketType, orderCategory: OrderCategory) {
    return this.request('GET', `/accounts/${accountNo}/orders`, {
      query: { marketType, orderCategory },
    });
  }

  async getOrderDetail(accountNo: string, orderId: string, marketType: MarketType, orderCategory: OrderCategory) {
    return this.request('GET', `/accounts/${accountNo}/orders/${orderId}`, {
      query: { marketType, orderCategory },
    });
  }

  async getExecutionDetail(accountNo: string, orderId: string, marketType: MarketType, orderCategory: OrderCategory) {
    return this.request('GET', `/accounts/${accountNo}/executions/${orderId}`, {
      query: { marketType, orderCategory },
    });
  }

  async getOrderHistory(accountNo: string, marketType: MarketType, fromDate: string, toDate: string) {
    return this.request('GET', `/accounts/${accountNo}/orders/history`, {
      query: { marketType, from: fromDate, to: toDate },
    });
  }

  async getCorporateActionHistory(accountNo: string) {
    return this.request('GET', `/accounts/${accountNo}/corporate-action-history`);
  }

  async getPpse(accountNo: string, marketType: MarketType, symbol: string, loanPackageId: number, price: number) {
    return this.request('GET', `/accounts/${accountNo}/ppse`, {
      query: {
        marketType,
        symbol,
        loanPackageId: String(loanPackageId),
        price: String(price),
      },
    });
  }

  async postOrder(marketType: MarketType, orderCategory: OrderCategory, tradingToken: string, payload: any) {
    return this.request('POST', '/accounts/orders', {
      query: { marketType, orderCategory },
      body: payload,
      headers: { 'trading-token': tradingToken },
    });
  }

  async putOrder(accountNo: string, orderId: string, marketType: MarketType, orderCategory: OrderCategory, tradingToken: string, payload: any) {
    return this.request('PUT', `/accounts/${accountNo}/orders/${orderId}`, {
      query: { marketType, orderCategory },
      body: payload,
      headers: { 'trading-token': tradingToken },
    });
  }

  async cancelOrder(accountNo: string, orderId: string, marketType: MarketType, orderCategory: OrderCategory, tradingToken: string) {
    return this.request('DELETE', `/accounts/${accountNo}/orders/${orderId}`, {
      query: { marketType, orderCategory },
      headers: { 'trading-token': tradingToken },
    });
  }

  async createTradingToken(otpType: OtpType, passcode: string) {
    return this.request('POST', '/registration/trading-token', {
      body: { otpType, passcode },
    });
  }

  async sendEmailOtp() {
    return this.request('POST', '/registration/send-email-otp');
  }

  async closePosition(positionId: string, marketType: MarketType, tradingToken: string) {
    return this.request('POST', `/accounts/positions/${positionId}/close`, {
      query: { marketType },
      headers: { 'trading-token': tradingToken },
    });
  }

  async getWorkingDates() {
    return this.request('GET', '/market/working-dates');
  }

  private async request(method: string, path: string, options: { query?: Record<string, any>; body?: any; headers?: Record<string, string> } = {}) {
    const url = this.buildUrl(path, options.query);
    const requestHeaders: Record<string, string> = {
      version: '2026-05-07',
      Accept: 'application/json',
    };

    // Build HMAC signature if credentials are set (mapping 1:1 với PHP)
    if (this.apiKey && this.apiSecret) {
      const dateValue = formatDateHeader(new Date());
      const nonce = this.hmacNonceEnabled ? randomUUID().replace(/-/g, '') : null;
      const { headers, signature } = buildSignature(
        this.apiSecret,
        method,
        path,
        dateValue,
        this.algorithm,
        nonce,
      );

      let signatureHeaderValue = `Signature keyId="${this.apiKey}",algorithm="${this.algorithm}",headers="${headers}",signature="${signature}"`;
      if (nonce) {
        signatureHeaderValue += `,nonce="${nonce}"`;
      }

      requestHeaders['Date'] = dateValue;
      requestHeaders['X-Signature'] = signatureHeaderValue;
      requestHeaders['x-api-key'] = this.apiKey;
    }

    if (options.body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    if (options.headers) {
      Object.assign(requestHeaders, options.headers);
    }

    const requestConfig: any = {
      method,
      url,
      headers: requestHeaders,
      data: options.body,
    };

    // Proxy support per-request (mapping 1:1 với PHP Guzzle proxy)
    if (this.proxyUrl) {
      requestConfig.httpsAgent = new HttpsProxyAgent(this.proxyUrl);
      requestConfig.proxy = false;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.request(requestConfig),
      );
      return { status: response.status, data: response.data };
    } catch (error: any) {
      const isProxyInUse = !!requestConfig.httpsAgent;

      if (!error.response) {
        if (isProxyInUse) {
          return {
            status: 502,
            data: {
              error: 'PROXY_NETWORK_ERROR',
              message: 'Kết nối qua Proxy bị lỗi hoặc Proxy đã chết.',
              details: error.message,
            },
          };
        }
        throw error;
      }

      const status = error.response.status;
      const data = error.response.data;

      if (isProxyInUse) {
        if (status === 407) {
          return {
            status: 407,
            data: { error: 'PROXY_AUTH_ERROR', message: 'Xác thực Proxy thất bại.' },
          };
        }
        if (status === 403 || status === 429) {
          return {
            status,
            data: {
              ...(typeof data === 'object' ? data : { raw_data: data }),
              error: 'PROXY_BANNED',
              message: `Proxy có thể đã bị chặn bởi DNSE (Mã lỗi: ${status}).`,
            },
          };
        }
      }

      return { status, data };
    }
  }

  private buildUrl(path: string, query?: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}
