import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL";
    };
};
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
};
export type DataKey = {
    tag: "Admin";
    values: void;
} | {
    tag: "SupportedCollateral";
    values: readonly [string];
} | {
    tag: "UserMargin";
    values: readonly [string, string];
} | {
    tag: "PoolBalance";
    values: readonly [string];
} | {
    tag: "LPShares";
    values: readonly [string, string];
} | {
    tag: "Position";
    values: readonly [string];
};
export interface Position {
    /**
   * Human-readable symbol of the synthetic asset, e.g. `symbol_short!("XLM")`.
   */
    asset_symbol: string;
    /**
   * Amount of collateral locked while this position is open.
   */
    collateral_locked: i128;
    /**
   * Notional debt the user has taken on (scaled to 7 decimals).
   * Computed on-chain as xlm_amount * entry_price / SCALE.
   */
    debt_amount: i128;
    /**
   * Entry price of the synthetic asset (USDC per token, 7-decimal scaled).
   */
    entry_price: i128;
    /**
   * true = long, false = short.
   */
    is_long: boolean;
    /**
   * The user who owns this position.
   */
    user: string;
    /**
   * Size of the position in synthetic asset units (7-decimal scaled).
   */
    xlm_amount: i128;
}
export interface Client {
    /**
     * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    initialize: ({ admin }: {
        admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a lp_deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * LP deposits to the shared pool. Increments LPShares(user, token).
     */
    lp_deposit: ({ user, token, amount }: {
        user: string;
        token: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a lp_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * LP withdraws from the shared pool. Blocked if LP shares or pool balance insufficient.
     */
    lp_withdraw: ({ user, token, amount }: {
        user: string;
        token: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_lp_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * LP share amount for a specific user and token.
     */
    get_lp_share: ({ user, token }: {
        user: string;
        token: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a get_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_position: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Position>>>;
    /**
     * Construct and simulate a close_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Closes the caller's open position and settles PnL against the LP pool.
     *
     * PnL is computed on-chain from stored entry data and the caller-provided
     * close price:
     * - long:  pnl = (close_price - entry_price) * xlm_amount / SCALE
     * - short: pnl = (entry_price - close_price) * xlm_amount / SCALE
     *
     * - pnl > 0: pool pays the winner — PoolBalance -= pnl, UserMargin += collateral + pnl
     * - pnl < 0: pool gains from the loser — PoolBalance += |pnl|, UserMargin += collateral - |pnl|
     * - pnl = 0: UserMargin += collateral (no pool impact)
     *
     * Returns `InsufficientPool` if the pool cannot cover a winning payout.
     */
    close_position: ({ user, collateral_token, close_price }: {
        user: string;
        collateral_token: string;
        close_price: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Position>>>;
    /**
     * Construct and simulate a get_pool_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Total LP pool balance for a token.
     */
    get_pool_balance: ({ token }: {
        token: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a deposit_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * User deposits margin (collateral) to back their leveraged positions.
     */
    deposit_collateral: ({ user, token, amount }: {
        user: string;
        token: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a withdraw_collateral transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * User withdraws free margin. Blocked while a position is open.
     */
    withdraw_collateral: ({ user, token, amount }: {
        user: string;
        token: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a add_collateral_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admin-only: allow a token to be used as collateral / LP token.
     */
    add_collateral_token: ({ token }: {
        token: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a get_collateral_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Free margin balance for a user (alias for UserMargin).
     */
    get_collateral_balance: ({ user, token }: {
        user: string;
        token: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a open_synthetic_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Opens a synthetic leveraged position.
     *
     * Computes `debt_amount = xlm_amount * entry_price / SCALE` on-chain so the
     * caller cannot manipulate the notional. Locks `collateral_locked` from the
     * user's free margin.
     */
    open_synthetic_position: ({ user, asset_symbol, xlm_amount, entry_price, is_long, collateral_token, collateral_locked }: {
        user: string;
        asset_symbol: string;
        xlm_amount: i128;
        entry_price: i128;
        is_long: boolean;
        collateral_token: string;
        collateral_locked: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        initialize: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        lp_deposit: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        lp_withdraw: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_lp_share: (json: string) => AssembledTransaction<bigint>;
        get_position: (json: string) => AssembledTransaction<Option<Position>>;
        close_position: (json: string) => AssembledTransaction<Result<Position, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_pool_balance: (json: string) => AssembledTransaction<bigint>;
        deposit_collateral: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        withdraw_collateral: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        add_collateral_token: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_collateral_balance: (json: string) => AssembledTransaction<bigint>;
        open_synthetic_position: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
