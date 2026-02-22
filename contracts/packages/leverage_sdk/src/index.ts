import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCNF3JMO7MO5PSR7AS4GT3DKZU7MLDN5WS2ML7RWOGMGPLXTT7HXRY7L",
  }
} as const

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"InsufficientCollateral"},
  5: {message:"PositionAlreadyOpen"},
  6: {message:"NoOpenPosition"},
  7: {message:"UnsupportedCollateral"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "SupportedCollateral", values: readonly [string]} | {tag: "CollateralBalance", values: readonly [string, string]} | {tag: "Position", values: readonly [string]};


export interface Position {
  /**
 * Human-readable symbol of the synthetic asset, e.g. `symbol_short!("XLM")`.
 */
asset_symbol: string;
  /**
 * Amount of collateral token locked while this position is open.
 */
collateral_locked: i128;
  /**
 * Notional debt the user has taken on (scaled to 7 decimals).
 * For a 10× leveraged position with 100 USDC collateral this would be 1000.
 */
debt_amount: i128;
  /**
 * The user who owns this position.
 */
user: string;
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_position: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Position>>>

  /**
   * Construct and simulate a close_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only. Releases locked collateral back to free pool and removes the
   * position record. Call this AFTER AgentVault.settle_pnl has handled money.
   */
  close_position: ({user, collateral_token}: {user: string, collateral_token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>

  /**
   * Construct and simulate a deposit_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit_collateral: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_collateral: ({user, token, amount}: {user: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_collateral_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only: allow a token to be used as collateral.
   */
  add_collateral_token: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_collateral_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_collateral_balance: ({user, token}: {user: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a open_synthetic_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Called by the Go matching engine after off-chain order matching.
   * Locks `collateral_locked` from the user's free collateral balance and
   * records the Position on-chain for transparency and liquidation tracking.
   */
  open_synthetic_position: ({user, asset_symbol, debt_amount, collateral_token, collateral_locked}: {user: string, asset_symbol: string, debt_amount: i128, collateral_token: string, collateral_locked: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAWSW5zdWZmaWNpZW50Q29sbGF0ZXJhbAAAAAAABAAAAAAAAAATUG9zaXRpb25BbHJlYWR5T3BlbgAAAAAFAAAAAAAAAA5Ob09wZW5Qb3NpdGlvbgAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRDb2xsYXRlcmFsAAAAAAAABw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAQAAAAAAAAATU3VwcG9ydGVkQ29sbGF0ZXJhbAAAAAABAAAAEwAAAAEAAAAAAAAAEUNvbGxhdGVyYWxCYWxhbmNlAAAAAAAAAgAAABMAAAATAAAAAQAAAAAAAAAIUG9zaXRpb24AAAABAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAABAAAAEpIdW1hbi1yZWFkYWJsZSBzeW1ib2wgb2YgdGhlIHN5bnRoZXRpYyBhc3NldCwgZS5nLiBgc3ltYm9sX3Nob3J0ISgiWExNIilgLgAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAA+QW1vdW50IG9mIGNvbGxhdGVyYWwgdG9rZW4gbG9ja2VkIHdoaWxlIHRoaXMgcG9zaXRpb24gaXMgb3Blbi4AAAAAABFjb2xsYXRlcmFsX2xvY2tlZAAAAAAAAAsAAACGTm90aW9uYWwgZGVidCB0aGUgdXNlciBoYXMgdGFrZW4gb24gKHNjYWxlZCB0byA3IGRlY2ltYWxzKS4KRm9yIGEgMTDDlyBsZXZlcmFnZWQgcG9zaXRpb24gd2l0aCAxMDAgVVNEQyBjb2xsYXRlcmFsIHRoaXMgd291bGQgYmUgMTAwMC4AAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAIFRoZSB1c2VyIHdobyBvd25zIHRoaXMgcG9zaXRpb24uAAAABHVzZXIAAAAT",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAMZ2V0X3Bvc2l0aW9uAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAIUG9zaXRpb24=",
        "AAAAAAAAAJJBZG1pbi1vbmx5LiBSZWxlYXNlcyBsb2NrZWQgY29sbGF0ZXJhbCBiYWNrIHRvIGZyZWUgcG9vbCBhbmQgcmVtb3ZlcyB0aGUKcG9zaXRpb24gcmVjb3JkLiBDYWxsIHRoaXMgQUZURVIgQWdlbnRWYXVsdC5zZXR0bGVfcG5sIGhhcyBoYW5kbGVkIG1vbmV5LgAAAAAADmNsb3NlX3Bvc2l0aW9uAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAQY29sbGF0ZXJhbF90b2tlbgAAABMAAAABAAAD6QAAB9AAAAAIUG9zaXRpb24AAAAD",
        "AAAAAAAAAAAAAAASZGVwb3NpdF9jb2xsYXRlcmFsAAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAATd2l0aGRyYXdfY29sbGF0ZXJhbAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADNBZG1pbi1vbmx5OiBhbGxvdyBhIHRva2VuIHRvIGJlIHVzZWQgYXMgY29sbGF0ZXJhbC4AAAAAFGFkZF9jb2xsYXRlcmFsX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAWZ2V0X2NvbGxhdGVyYWxfYmFsYW5jZQAAAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAM9DYWxsZWQgYnkgdGhlIEdvIG1hdGNoaW5nIGVuZ2luZSBhZnRlciBvZmYtY2hhaW4gb3JkZXIgbWF0Y2hpbmcuCkxvY2tzIGBjb2xsYXRlcmFsX2xvY2tlZGAgZnJvbSB0aGUgdXNlcidzIGZyZWUgY29sbGF0ZXJhbCBiYWxhbmNlIGFuZApyZWNvcmRzIHRoZSBQb3NpdGlvbiBvbi1jaGFpbiBmb3IgdHJhbnNwYXJlbmN5IGFuZCBsaXF1aWRhdGlvbiB0cmFja2luZy4AAAAAF29wZW5fc3ludGhldGljX3Bvc2l0aW9uAAAAAAUAAAAAAAAABHVzZXIAAAATAAAAAAAAAAxhc3NldF9zeW1ib2wAAAARAAAAAAAAAAtkZWJ0X2Ftb3VudAAAAAALAAAAAAAAABBjb2xsYXRlcmFsX3Rva2VuAAAAEwAAAAAAAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAAQAAA+kAAAACAAAAAw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<Result<void>>,
        get_position: this.txFromJSON<Option<Position>>,
        close_position: this.txFromJSON<Result<Position>>,
        deposit_collateral: this.txFromJSON<Result<void>>,
        withdraw_collateral: this.txFromJSON<Result<void>>,
        add_collateral_token: this.txFromJSON<Result<void>>,
        get_collateral_balance: this.txFromJSON<i128>,
        open_synthetic_position: this.txFromJSON<Result<void>>
  }
}