import type { DhanCredentials, BrokerTrade } from "@shared/schema";

export async function fetchDhanTrades(credentials: DhanCredentials): Promise<BrokerTrade[]> {
  throw new Error("Dhan integration not implemented yet");
}
