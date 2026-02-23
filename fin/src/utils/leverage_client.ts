/**
 * LeveragePool contract client — stellar-sdk v13 wrapper.
 *
 * Mirrors the pattern in vault_client.ts: interface + class declaration merging.
 * Types are copied from contracts/packages/leverage_sdk/src/index.ts (generated
 * from the deployed contract at CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL).
 *
 * We cannot import leverage_sdk directly because it depends on
 * @stellar/stellar-sdk@14 while fin/ uses stellar-sdk@13.
 */
import { Buffer } from 'buffer';
import {
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
  AssembledTransaction,
} from 'stellar-sdk/contract';
import type { i128, Option } from 'stellar-sdk/contract';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}

// ── Contract address ──────────────────────────────────────────────────────────

export const LEVERAGE_CONTRACT_ID =
  'CCKZICAZIICUMVVSX2YHITOCV2E5LO4YQKCO5VYAS7G3PZYLN5N32UXL';

// ── Error table ───────────────────────────────────────────────────────────────

export const Errors = {
  1: { message: 'NotInitialized' },
  2: { message: 'AlreadyInitialized' },
  3: { message: 'Unauthorized' },
  4: { message: 'InsufficientCollateral' },
  5: { message: 'PositionAlreadyOpen' },
  6: { message: 'NoOpenPosition' },
  7: { message: 'UnsupportedCollateral' },
  8: { message: 'InsufficientPool' },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Position {
  asset_symbol:      string;
  collateral_locked: i128;
  debt_amount:       i128;
  entry_price:       i128;
  is_long:           boolean;
  user:              string;
  xlm_amount:        i128;
}

// ── Interface (declaration-merged with class below) ───────────────────────────

export interface LeverageClient {
  initialize(
    args: { admin: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  lp_deposit(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  lp_withdraw(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  get_lp_share(
    args: { user: string; token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  get_position(
    args: { user: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Option<Position>>>;

  close_position(
    args: { user: string; collateral_token: string; close_price: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<Position>>>;

  get_pool_balance(
    args: { token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  deposit_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  withdraw_collateral(
    args: { user: string; token: string; amount: i128 },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  add_collateral_token(
    args: { token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;

  get_collateral_balance(
    args: { user: string; token: string },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<i128>>;

  open_synthetic_position(
    args: {
      user: string;
      asset_symbol: string;
      xlm_amount: i128;
      entry_price: i128;
      is_long: boolean;
      collateral_token: string;
      collateral_locked: i128;
    },
    options?: MethodOptions,
  ): Promise<AssembledTransaction<Result<void>>>;
}

// ── Class (ContractSpec generates method implementations at runtime) ───────────

export class LeverageClient extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAwAAAAAAAAAWSW5zdWZmaWNpZW50Q29sbGF0ZXJhbAAAAAAABAAAAAAAAAATUG9zaXRpb25BbHJlYWR5T3BlbgAAAAAFAAAAAAAAAA5Ob09wZW5Qb3NpdGlvbgAAAAAABgAAAAAAAAAVVW5zdXBwb3J0ZWRDb2xsYXRlcmFsAAAAAAAABwAAAAAAAAAQSW5zdWZmaWNpZW50UG9vbAAAAAg=',
        'AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAQAAAAAAAAATU3VwcG9ydGVkQ29sbGF0ZXJhbAAAAAABAAAAEwAAAAEAAAAAAAAAClVzZXJNYXJnaW4AAAAAAAIAAAATAAAAEwAAAAEAAAAAAAAAC1Bvb2xCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAITFBTaGFyZXMAAAACAAAAEwAAABMAAAABAAAAAAAAAAhQb3NpdGlvbgAAAAEAAAAT',
        'AAAAAQAAAAAAAAAAAAAACFBvc2l0aW9uAAAABwAAAEpIdW1hbi1yZWFkYWJsZSBzeW1ib2wgb2YgdGhlIHN5bnRoZXRpYyBhc3NldCwgZS5nLiBgc3ltYm9sX3Nob3J0ISgiWExNIilgLgAAAAAADGFzc2V0X3N5bWJvbAAAABEAAAA4QW1vdW50IG9mIGNvbGxhdGVyYWwgbG9ja2VkIHdoaWxlIHRoaXMgcG9zaXRpb24gaXMgb3Blbi4AAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAck5vdGlvbmFsIGRlYnQgdGhlIHVzZXIgaGFzIHRha2VuIG9uIChzY2FsZWQgdG8gNyBkZWNpbWFscykuCkNvbXB1dGVkIG9uLWNoYWluIGFzIHhsbV9hbW91bnQgKiBlbnRyeV9wcmljZSAvIFNDQUxFLgAAAAAAC2RlYnRfYW1vdW50AAAAAAsAAABGRW50cnkgcHJpY2Ugb2YgdGhlIHN5bnRoZXRpYyBhc3NldCAoVVNEQyBwZXIgdG9rZW4sIDctZGVjaW1hbCBzY2FsZWQpLgAAAAAAC2VudHJ5X3ByaWNlAAAAAAsAAAAbdHJ1ZSA9IGxvbmcsIGZhbHNlID0gc2hvcnQuAAAAAAdpc19sb25nAAAAAAEAAAAgVGhlIHVzZXIgd2hvIG93bnMgdGhpcyBwb3NpdGlvbi4AAAAEdXNlcgAAABMAAABBU2l6ZSBvZiB0aGUgcG9zaXRpb24gaW4gc3ludGhldGljIGFzc2V0IHVuaXRzICg3LWRlY2ltYWwgc2NhbGVkKS4AAAAAAAAKeGxtX2Ftb3VudAAAAAAACw==',
        'AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAEFMUCBkZXBvc2l0cyB0byB0aGUgc2hhcmVkIHBvb2wuIEluY3JlbWVudHMgTFBTaGFyZXModXNlciwgdG9rZW4pLgAAAAAAAApscF9kZXBvc2l0AAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD',
        'AAAAAAAAAFVMUCB3aXRoZHJhd3MgZnJvbSB0aGUgc2hhcmVkIHBvb2wuIEJsb2NrZWQgaWYgTFAgc2hhcmVzIG9yIHBvb2wgYmFsYW5jZSBpbnN1ZmZpY2llbnQuAAAAAAAAC2xwX3dpdGhkcmF3AAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAC5MUCBzaGFyZSBhbW91bnQgZm9yIGEgc3BlY2lmaWMgdXNlciBhbmQgdG9rZW4uAAAAAAAMZ2V0X2xwX3NoYXJlAAAAAgAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL',
        'AAAAAAAAAAAAAAAMZ2V0X3Bvc2l0aW9uAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAIUG9zaXRpb24=',
        'AAAAAAAAAlBDbG9zZXMgdGhlIGNhbGxlcidzIG9wZW4gcG9zaXRpb24gYW5kIHNldHRsZXMgUG5MIGFnYWluc3QgdGhlIExQIHBvb2wuCgpQbkwgaXMgY29tcHV0ZWQgb24tY2hhaW4gZnJvbSBzdG9yZWQgZW50cnkgZGF0YSBhbmQgdGhlIGNhbGxlci1wcm92aWRlZApjbG9zZSBwcmljZToKLSBsb25nOiAgcG5sID0gKGNsb3NlX3ByaWNlIC0gZW50cnlfcHJpY2UpICogeGxtX2Ftb3VudCAvIFNDQUxFCi0gc2hvcnQ6IHBubCA9IChlbnRyeV9wcmljZSAtIGNsb3NlX3ByaWNlKSAqIHhsbV9hbW91bnQgLyBTQ0FMRQoKLSBwbmwgPiAwOiBwb29sIHBheXMgdGhlIHdpbm5lciDigJQgUG9vbEJhbGFuY2UgLT0gcG5sLCBVc2VyTWFyZ2luICs9IGNvbGxhdGVyYWwgKyBwbmwKLSBwbmwgPCAwOiBwb29sIGdhaW5zIGZyb20gdGhlIGxvc2VyIOKAlCBQb29sQmFsYW5jZSArPSB8cG5sfCwgVXNlck1hcmdpbiArPSBjb2xsYXRlcmFsIC0gfHBubHwKLSBwbmwgPSAwOiBVc2VyTWFyZ2luICs9IGNvbGxhdGVyYWwgKG5vIHBvb2wgaW1wYWN0KQoKUmV0dXJucyBgSW5zdWZmaWNpZW50UG9vbGAgaWYgdGhlIHBvb2wgY2Fubm90IGNvdmVyIGEgd2lubmluZyBwYXlvdXQuAAAADmNsb3NlX3Bvc2l0aW9uAAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAQY29sbGF0ZXJhbF90b2tlbgAAABMAAAAAAAAAC2Nsb3NlX3ByaWNlAAAAAAsAAAABAAAD6QAAB9AAAAAIUG9zaXRpb24AAAAD',
        'AAAAAAAAACJUb3RhbCBMUCBwb29sIGJhbGFuY2UgZm9yIGEgdG9rZW4uAAAAAAAQZ2V0X3Bvb2xfYmFsYW5jZQAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAL',
        'AAAAAAAAAERVc2VyIGRlcG9zaXRzIG1hcmdpbiAoY29sbGF0ZXJhbCkgdG8gYmFjayB0aGVpciBsZXZlcmFnZWQgcG9zaXRpb25zLgAAABJkZXBvc2l0X2NvbGxhdGVyYWwAAAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=',
        'AAAAAAAAAD1Vc2VyIHdpdGhkcmF3cyBmcmVlIG1hcmdpbi4gQmxvY2tlZCB3aGlsZSBhIHBvc2l0aW9uIGlzIG9wZW4uAAAAAAAAE3dpdGhkcmF3X2NvbGxhdGVyYWwAAAAAAwAAAAAAAAAEdXNlcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAAD5BZG1pbi1vbmx5OiBhbGxvdyBhIHRva2VuIHRvIGJlIHVzZWQgYXMgY29sbGF0ZXJhbCAvIExQIHRva2VuLgAAAAAAFGFkZF9jb2xsYXRlcmFsX3Rva2VuAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==',
        'AAAAAAAAADZGcmVlIG1hcmdpbiBiYWxhbmNlIGZvciBhIHVzZXIgKGFsaWFzIGZvciBVc2VyTWFyZ2luKS4AAAAAABZnZXRfY29sbGF0ZXJhbF9iYWxhbmNlAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=',
        'AAAAAAAAAM5PcGVucyBhIHN5bnRoZXRpYyBsZXZlcmFnZWQgcG9zaXRpb24uCgpDb21wdXRlcyBgZGVidF9hbW91bnQgPSB4bG1fYW1vdW50ICogZW50cnlfcHJpY2UgLyBTQ0FMRWAgb24tY2hhaW4gc28gdGhlCmNhbGxlciBjYW5ub3QgbWFuaXB1bGF0ZSB0aGUgbm90aW9uYWwuIExvY2tzIGBjb2xsYXRlcmFsX2xvY2tlZGAgZnJvbSB0aGUKdXNlcidzIGZyZWUgbWFyZ2luLgAAAAAAF29wZW5fc3ludGhldGljX3Bvc2l0aW9uAAAAAAcAAAAAAAAABHVzZXIAAAATAAAAAAAAAAxhc3NldF9zeW1ib2wAAAARAAAAAAAAAAp4bG1fYW1vdW50AAAAAAALAAAAAAAAAAtlbnRyeV9wcmljZQAAAAALAAAAAAAAAAdpc19sb25nAAAAAAEAAAAAAAAAEGNvbGxhdGVyYWxfdG9rZW4AAAATAAAAAAAAABFjb2xsYXRlcmFsX2xvY2tlZAAAAAAAAAsAAAABAAAD6QAAAAIAAAAD',
      ]),
      options,
    );
  }
}
