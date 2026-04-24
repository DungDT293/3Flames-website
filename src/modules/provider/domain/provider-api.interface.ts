// ─────────────────────────────────────────────────────────────
// Provider API Interface (Port in Clean Architecture)
//
// This is the ABSTRACT CONTRACT that any provider must implement.
// The system is decoupled from TheYTlab — swapping providers
// means writing a new adapter, not rewriting business logic.
// ─────────────────────────────────────────────────────────────

export interface ProviderService {
  serviceId: string;
  name: string;
  category: string;
  type: string;
  rate: string;         // price per 1000 as string (provider format)
  min: string;
  max: string;
  description?: string;
}

export interface PlaceOrderRequest {
  serviceId: string;
  link: string;
  quantity: number;
  runs?: number;         // for subscription-type services
  interval?: number;     // minutes between runs
}

export interface PlaceOrderResponse {
  orderId: string;       // provider's order ID
}

export interface OrderStatusResponse {
  orderId: string;
  status: string;
  charge: string;        // actual charge from provider
  startCount?: string;
  remains?: string;
}

export interface MultiStatusResponse {
  [orderId: string]: OrderStatusResponse;
}

export interface ProviderBalanceResponse {
  balance: string;
  currency: string;
}

export interface IProviderApiClient {
  /**
   * Fetch all available services from the provider.
   */
  getServices(): Promise<ProviderService[]>;

  /**
   * Place a new order with the provider.
   * Returns the provider's order ID.
   */
  placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse>;

  /**
   * Check the status of a single order by provider order ID.
   */
  checkOrderStatus(orderId: string): Promise<OrderStatusResponse>;

  /**
   * Batch-check status for multiple orders in a single API call.
   * Accepts an array of provider order IDs.
   */
  checkMultiOrderStatus(orderIds: string[]): Promise<MultiStatusResponse>;

  /**
   * Get our account balance at the provider (for monitoring/alerting).
   */
  getBalance(): Promise<ProviderBalanceResponse>;
}
