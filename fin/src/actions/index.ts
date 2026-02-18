/**
 * Stellar SDEX Trading Actions
 *
 * Centralized, framework-agnostic trading functions.
 * All functions are pure async — no React dependencies.
 *
 * Usage from UI hook:
 *   import { placeLimitOrder } from '@/actions/trade';
 *
 * Usage from OpenClaw agent:
 *   import { placeLimitOrderBySymbol, getOrderBookBySymbol } from '@stellar-fin/actions';
 */

export * from './orderbook';
export * from './account';
export * from './trade';
export type { SignFn } from './account';
