stellar contract build
⚠️  A new release of stellar-cli is available: 23.0.0 -> 25.1.0
ℹ️  CARGO_BUILD_RUSTFLAGS=--remap-path-prefix=/home/daiwi/.cargo/registry/src= cargo rustc --manifest-path=contracts/zk_auth/Cargo.toml --crate-type=cdylib --target=wasm32v1-none --release
warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/zk_auth/src/lib.rs:210:22
    |
210 |         env.events().publish(
    |                      ^^^^^^^
    |
    = note: `#[warn(deprecated)]` on by default

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/zk_auth/src/lib.rs:233:22
    |
233 |         env.events().publish(
    |                      ^^^^^^^

warning: `zk-auth` (lib) generated 2 warnings
    Finished `release` profile [optimized] target(s) in 0.25s
ℹ️  Build Summary:
   Wasm File: target/wasm32v1-none/release/zk_auth.wasm
   Wasm Hash: e435d11a620a6f43dd627540ebfb4b97ea158fb205702f6ef37089ef62aaeddb
   Exported Functions: 5 found
     • get_agent_pubkey
     • initialize
     • invalidate_session
     • is_session_valid
     • start_session
✅ Build Complete
ℹ️  CARGO_BUILD_RUSTFLAGS=--remap-path-prefix=/home/daiwi/.cargo/registry/src= cargo rustc --manifest-path=contracts/agent_vault/Cargo.toml --crate-type=cdylib --target=wasm32v1-none --release
warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/agent_vault/src/lib.rs:156:14
    |
156 |             .publish((symbol_short!("token"), symbol_short!("added")), token_sac);
    |              ^^^^^^^
    |
    = note: `#[warn(deprecated)]` on by default

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/agent_vault/src/lib.rs:171:22
    |
171 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/agent_vault/src/lib.rs:193:22
    |
193 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/agent_vault/src/lib.rs:222:22
    |
222 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/agent_vault/src/lib.rs:238:22
    |
238 |         env.events().publish(
    |                      ^^^^^^^

warning: `agent-vault` (lib) generated 5 warnings
    Finished `release` profile [optimized] target(s) in 0.08s
ℹ️  Build Summary:
   Wasm File: target/wasm32v1-none/release/agent_vault.wasm
   Wasm Hash: b8b2ad65e147fa412d674044ca251809c98504b13c2cba2f8d30ddfe121bb5d3
   Exported Functions: 7 found
     • add_supported_token
     • agent_return_funds
     • agent_withdraw
     • deposit
     • get_balance
     • initialize
     • withdraw
✅ Build Complete
ℹ️  CARGO_BUILD_RUSTFLAGS=--remap-path-prefix=/home/daiwi/.cargo/registry/src= cargo rustc --manifest-path=contracts/leverage_pool/Cargo.toml --crate-type=cdylib --target=wasm32v1-none --release
warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:306:14
    |
306 |             .publish((symbol_short!("coll"), symbol_short!("set")), token);
    |              ^^^^^^^
    |
    = note: `#[warn(deprecated)]` on by default

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:345:22
    |
345 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:388:22
    |
388 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:411:22
    |
411 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:465:22
    |
465 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:557:22
    |
557 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:654:22
    |
654 |         env.events().publish(
    |                      ^^^^^^^

warning: use of deprecated method `soroban_sdk::events::Events::publish`: use the #[contractevent] macro on a contract event type
   --> contracts/leverage_pool/src/lib.rs:765:22
    |
765 |         env.events().publish(
    |                      ^^^^^^^

warning: `leverage-pool` (lib) generated 8 warnings
    Finished `release` profile [optimized] target(s) in 0.07s
ℹ️  Build Summary:
   Wasm File: target/wasm32v1-none/release/leverage_pool.wasm
   Wasm Hash: 17afd52950fe15e58490126017f11cf8cd70113c59c64091d3898c01c3960d8c
   Exported Functions: 13 found
     • accrue_interest
     • close_position
     • deposit_collateral
     • get_health_ratio
     • get_pool_stats
     • get_position
     • initialize
     • liquidate
     • lp_deposit
     • lp_withdraw
     • open_position
     • set_collateral_type
     • withdraw_collateral
✅ Build Complete
daiwi@domain:~/stellar/contracts$ stellar contract deploy \
  --source-account admin \
  --network testnet \
  --wasm target/wasm32v1-none/release/leverage_pool.wasm
⚠️  A new release of stellar-cli is available: 23.0.0 -> 25.1.0
ℹ️  Simulating install transaction…
ℹ️  Signing transaction: fe0dbd606795809151dedc3dcabc8306b4b72a8ee3267450131196599dc6aa56
🌎 Submitting install transaction…
ℹ️  Using wasm hash 17afd52950fe15e58490126017f11cf8cd70113c59c64091d3898c01c3960d8c
ℹ️  Simulating deploy transaction…
ℹ️  Transaction hash is 8cc235606ae7d76b7fa6a42abcb5073106534c6435a6eec5f5fb1fcc64f456ff
🔗 https://stellar.expert/explorer/testnet/tx/8cc235606ae7d76b7fa6a42abcb5073106534c6435a6eec5f5fb1fcc64f456ff
ℹ️  Signing transaction: 8cc235606ae7d76b7fa6a42abcb5073106534c6435a6eec5f5fb1fcc64f456ff
🌎 Submitting deploy transaction…
🔗 https://stellar.expert/explorer/testnet/contract/CCLNL54G5EYJXE5PIAKLNCQCLT4MSCTLVSLRK3IXMJ2KFYKLR7Y4MCFD
✅ Deployed!
CCLNL54G5EYJXE5PIAKLNCQCLT4MSCTLVSLRK3IXMJ2KFYKLR7Y4MCFD
daiwi@domain:~/stellar/contracts$ stellar contract deploy   --source-account admin   --network testnet   --wasm target/wasm32v1-none/release/agent_vault.wasm
⚠️  A new release of stellar-cli is available: 23.0.0 -> 25.1.0
ℹ️  Simulating install transaction…
ℹ️  Signing transaction: 8ec82c04607ecf0e6bb975de40ad90126411043245c5bbf260fb16991da42049
🌎 Submitting install transaction…
ℹ️  Using wasm hash b8b2ad65e147fa412d674044ca251809c98504b13c2cba2f8d30ddfe121bb5d3
ℹ️  Simulating deploy transaction…
ℹ️  Transaction hash is e3df1796b4c836eb225577060d24062e30e21f35e8e415daf106644605c44911
🔗 https://stellar.expert/explorer/testnet/tx/e3df1796b4c836eb225577060d24062e30e21f35e8e415daf106644605c44911
ℹ️  Signing transaction: e3df1796b4c836eb225577060d24062e30e21f35e8e415daf106644605c44911
🌎 Submitting deploy transaction…
🔗 https://stellar.expert/explorer/testnet/contract/CDEB36RKQWCB4LIYH4IDDZ2UUAASA7PNTRFRYCMOK7AJD7AENVMD5JUH
✅ Deployed!
CDEB36RKQWCB4LIYH4IDDZ2UUAASA7PNTRFRYCMOK7AJD7AENVMD5JUH
daiwi@domain:~/stellar/contracts$ 
ntracts$ stellar contract deploy   --source-account admin   --network testnet   --wasm target/wasm32v1-none/release/zk_auth.wasm
⚠️  A new release of stellar-cli is available: 23.0.0 -> 25.1.0
ℹ️  Simulating install transaction…
ℹ️  Signing transaction: 62c6d571fd33e810694e54152fa457ac6f58ac0b6e1247de7c56447617cc2dd3
🌎 Submitting install transaction…
ℹ️  Using wasm hash e435d11a620a6f43dd627540ebfb4b97ea158fb205702f6ef37089ef62aaeddb
ℹ️  Simulating deploy transaction…
ℹ️  Transaction hash is 2b320831deda09591d5853aac32b6931b58c427d13aa5b6ccecd31696c27d729
🔗 https://stellar.expert/explorer/testnet/tx/2b320831deda09591d5853aac32b6931b58c427d13aa5b6ccecd31696c27d729
ℹ️  Signing transaction: 2b320831deda09591d5853aac32b6931b58c427d13aa5b6ccecd31696c27d729
🌎 Submitting deploy transaction…
🔗 https://stellar.expert/explorer/testnet/contract/CD4AEUBRWT5OUQNFYKQM7FMG63NTSEHWCHBHH656JDJGXIDKVLKZE3YS
✅ Deployed!
CD4AEUBRWT5OUQNFYKQM7FMG63NTSEHWCHBHH656JDJGXIDKVLKZE3YS