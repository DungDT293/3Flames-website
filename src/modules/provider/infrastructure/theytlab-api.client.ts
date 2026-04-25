import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config';
import { logger } from '../../../shared/infrastructure/logger';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';
import {
  IProviderApiClient,
  ProviderService,
  PlaceOrderRequest,
  PlaceOrderResponse,
  OrderStatusResponse,
  MultiStatusResponse,
  ProviderBalanceResponse,
} from '../domain/provider-api.interface';

const circuitBreaker = new CircuitBreaker();

export class TheYTlabApiClient implements IProviderApiClient {
  private readonly http: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = config.provider.apiKey;
    this.http = axios.create({
      baseURL: config.provider.apiUrl,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async getServices(): Promise<ProviderService[]> {
    const response = await this.post<
      Array<{
        service: number;
        name: string;
        type: string;
        rate: string;
        min: string;
        max: string;
        category: string;
        description?: string;
        dripfeed?: boolean;
        refill?: boolean;
        cancel?: boolean;
      }>
    >({
      action: 'services',
    });

    return response.map((s) => ({
      serviceId: String(s.service),
      name: s.name,
      category: s.category,
      type: s.type,
      rate: s.rate,
      min: s.min,
      max: s.max,
      description: s.description,
    }));
  }

  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const response = await this.post<{ order: string }>({
      action: 'add',
      service: request.serviceId,
      link: request.link,
      quantity: request.quantity,
      ...(request.runs && { runs: request.runs }),
      ...(request.interval && { interval: request.interval }),
    });
    return { orderId: response.order };
  }

  async checkOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    const response = await this.post<{
      status: string;
      charge: string;
      start_count?: string;
      remains?: string;
    }>({
      action: 'status',
      order: orderId,
    });

    return {
      orderId,
      status: response.status,
      charge: response.charge,
      startCount: response.start_count,
      remains: response.remains,
    };
  }

  async checkMultiOrderStatus(orderIds: string[]): Promise<MultiStatusResponse> {
    const response = await this.post<
      Record<string, { status: string; charge: string; start_count?: string; remains?: string }>
    >({
      action: 'status',
      orders: orderIds.join(','),
    });

    const result: MultiStatusResponse = {};
    for (const [id, data] of Object.entries(response)) {
      result[id] = {
        orderId: id,
        status: data.status,
        charge: data.charge,
        startCount: data.start_count,
        remains: data.remains,
      };
    }
    return result;
  }

  async getBalance(): Promise<ProviderBalanceResponse> {
    const response = await this.post<{ balance: string; currency: string }>({
      action: 'balance',
    });
    return { balance: response.balance, currency: response.currency };
  }

  private async post<T>(params: Record<string, unknown>): Promise<T> {
    try {
      const { data } = await this.http.post<T>('', {
        key: this.apiKey,
        ...params,
      });

      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(`Provider API error: ${(data as Record<string, unknown>).error}`);
      }

      // Successful call — reset failure counter
      await circuitBreaker.recordSuccess();

      return data;
    } catch (error) {
      const isServerError =
        axios.isAxiosError(error) &&
        (error.response?.status === undefined ||   // timeout / network error
         error.response.status >= 500);

      if (isServerError) {
        await circuitBreaker.recordFailure();
      }

      logger.error('Provider API request failed', {
        params: { ...params, key: '[REDACTED]' },
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}
