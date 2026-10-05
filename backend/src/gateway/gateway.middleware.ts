import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createGatewayMiddleware,
  type GatewayMiddleware as SdkGatewayMiddleware,
} from "@circle-fin/x402-batching/server";

/**
 * Wraps the Circle Gateway x402 middleware so the watch endpoint gets the
 * standard 402 + PAYMENT-REQUIRED / PAYMENT-SIGNATURE flow, backed by the
 * real BatchFacilitatorClient (verify + settle at the Gateway API).
 *
 * After the middleware runs, `req.payment` carries
 * { verified, payer, amount, network, transaction } for the route handler.
 *
 * The per-second price depends on the stream rate, so the controller calls
 * `gateway.require(price)` per request via buildPaymentGate().
 */
@Injectable()
export class GatewayMiddleware {
  private readonly config: {
    sellerAddress: string;
    networks: string;
    facilitatorUrl: string;
    description: string;
    headers?: Record<string, string>;
  };

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("GATEWAY_API_KEY");
    this.config = {
      sellerAddress: config.get<string>("GATEWAY_SELLER_ADDRESS", ""),
      networks: config.get<string>("GATEWAY_CHAIN", "eip155:5042002"),
      facilitatorUrl: config.get<string>(
        "GATEWAY_FACILITATOR_URL",
        "https://gateway-api-testnet.circle.com"
      ),
      description: "Prawr stream access",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    };
  }

  /**
   * Returns the Express-compatible middleware for a given price string
   * (dollars, e.g. "0.000333" for one second of a $0.02/min stream).
   */
  require(price: string, expectedPayer?: string, payTo?: string) {
    let middleware: SdkGatewayMiddleware = createGatewayMiddleware({
      ...this.config,
      sellerAddress: payTo ?? this.config.sellerAddress,
    });
    if (expectedPayer) {
      middleware = middleware.onBeforeVerify(async ({ paymentPayload }) => {
        const authorization = (
          paymentPayload.payload as { authorization?: { from?: string } }
        ).authorization;
        if (
          authorization?.from?.toLowerCase() !== expectedPayer.toLowerCase()
        ) {
          return {
            abort: true,
            reason: "Gateway payer does not own this watch session",
          };
        }
      });
    }
    return middleware.require(price);
  }
}
