#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, token, Address, Env, Symbol};

const SCALE: i128 = 10_000_000;

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized          = 1,
    AlreadyInitialized      = 2,
    Unauthorized            = 3,
    InsufficientCollateral  = 4,
    PositionAlreadyOpen     = 5,
    NoOpenPosition          = 6,
    UnsupportedCollateral   = 7,
    InsufficientPool        = 8,
}

// ── Position ─────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct Position {
    /// The user who owns this position.
    pub user: Address,
    /// Human-readable symbol of the synthetic asset, e.g. `symbol_short!("XLM")`.
    pub asset_symbol: Symbol,
    /// Notional debt the user has taken on (scaled to 7 decimals).
    /// Computed on-chain as xlm_amount * entry_price / SCALE.
    pub debt_amount: i128,
    /// Amount of collateral locked while this position is open.
    pub collateral_locked: i128,
    /// Entry price of the synthetic asset (USDC per token, 7-decimal scaled).
    pub entry_price: i128,
    /// Size of the position in synthetic asset units (7-decimal scaled).
    pub xlm_amount: i128,
    /// true = long, false = short.
    pub is_long: bool,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SupportedCollateral(Address),    // token -> bool
    UserMargin(Address, Address),    // (user, token) -> i128  (free margin per user)
    PoolBalance(Address),            // token -> i128           (shared LP pool)
    LPShares(Address, Address),      // (user, token) -> i128  (LP's share of the pool)
    Position(Address),               // user -> Position
}

const TTL_BUMP: u32 = 518_400; // ~30 days

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LeveragePool;

#[contractimpl]
impl LeveragePool {
    // ── Initialisation ───────────────────────────────────────────────────────

    pub fn initialize(e: Env, admin: Address) -> Result<(), Error> {
        if e.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().extend_ttl(TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    /// Admin-only: allow a token to be used as collateral / LP token.
    pub fn add_collateral_token(e: Env, token: Address) -> Result<(), Error> {
        Self::require_admin(&e)?;
        e.storage()
            .persistent()
            .set(&DataKey::SupportedCollateral(token), &true);
        Ok(())
    }

    // ── User margin management ────────────────────────────────────────────────

    /// User deposits margin (collateral) to back their leveraged positions.
    pub fn deposit_collateral(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        if !e.storage().persistent().has(&DataKey::SupportedCollateral(token.clone())) {
            return Err(Error::UnsupportedCollateral);
        }
        token::Client::new(&e, &token).transfer(&user, &e.current_contract_address(), &amount);
        let key = DataKey::UserMargin(user, token);
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        e.storage().persistent().set(&key, &(prev + amount));
        e.storage().persistent().extend_ttl(&key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    /// User withdraws free margin. Blocked while a position is open.
    pub fn withdraw_collateral(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        if e.storage().persistent().has(&DataKey::Position(user.clone())) {
            return Err(Error::PositionAlreadyOpen);
        }
        let key = DataKey::UserMargin(user.clone(), token.clone());
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        if prev < amount {
            return Err(Error::InsufficientCollateral);
        }
        e.storage().persistent().set(&key, &(prev - amount));
        token::Client::new(&e, &token).transfer(&e.current_contract_address(), &user, &amount);
        Ok(())
    }

    // ── LP pool management ───────────────────────────────────────────────────

    /// LP deposits to the shared pool. Increments LPShares(user, token).
    pub fn lp_deposit(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        if !e.storage().persistent().has(&DataKey::SupportedCollateral(token.clone())) {
            return Err(Error::UnsupportedCollateral);
        }
        token::Client::new(&e, &token).transfer(&user, &e.current_contract_address(), &amount);

        let pool_key = DataKey::PoolBalance(token.clone());
        let pool_prev: i128 = e.storage().persistent().get(&pool_key).unwrap_or(0);
        e.storage().persistent().set(&pool_key, &(pool_prev + amount));
        e.storage().persistent().extend_ttl(&pool_key, TTL_BUMP, TTL_BUMP);

        let share_key = DataKey::LPShares(user, token);
        let share_prev: i128 = e.storage().persistent().get(&share_key).unwrap_or(0);
        e.storage().persistent().set(&share_key, &(share_prev + amount));
        e.storage().persistent().extend_ttl(&share_key, TTL_BUMP, TTL_BUMP);

        Ok(())
    }

    /// LP withdraws from the shared pool. Blocked if LP shares or pool balance insufficient.
    pub fn lp_withdraw(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();

        let share_key = DataKey::LPShares(user.clone(), token.clone());
        let shares: i128 = e.storage().persistent().get(&share_key).unwrap_or(0);
        if shares < amount {
            return Err(Error::InsufficientCollateral);
        }

        let pool_key = DataKey::PoolBalance(token.clone());
        let pool_bal: i128 = e.storage().persistent().get(&pool_key).unwrap_or(0);
        if pool_bal < amount {
            return Err(Error::InsufficientPool);
        }

        e.storage().persistent().set(&share_key, &(shares - amount));
        e.storage().persistent().set(&pool_key, &(pool_bal - amount));
        token::Client::new(&e, &token).transfer(&e.current_contract_address(), &user, &amount);

        Ok(())
    }

    // ── Synthetic position lifecycle ──────────────────────────────────────────

    /// Opens a synthetic leveraged position.
    ///
    /// Computes `debt_amount = xlm_amount * entry_price / SCALE` on-chain so the
    /// caller cannot manipulate the notional. Locks `collateral_locked` from the
    /// user's free margin.
    pub fn open_synthetic_position(
        e: Env,
        user: Address,
        asset_symbol: Symbol,
        xlm_amount: i128,
        entry_price: i128,
        is_long: bool,
        collateral_token: Address,
        collateral_locked: i128,
    ) -> Result<(), Error> {
        user.require_auth();

        if e.storage().persistent().has(&DataKey::Position(user.clone())) {
            return Err(Error::PositionAlreadyOpen);
        }

        let col_key = DataKey::UserMargin(user.clone(), collateral_token);
        let free: i128 = e.storage().persistent().get(&col_key).unwrap_or(0);
        if free < collateral_locked {
            return Err(Error::InsufficientCollateral);
        }
        e.storage().persistent().set(&col_key, &(free - collateral_locked));

        let debt_amount = xlm_amount * entry_price / SCALE;

        let pos = Position {
            user: user.clone(),
            asset_symbol,
            debt_amount,
            collateral_locked,
            entry_price,
            xlm_amount,
            is_long,
        };
        let pos_key = DataKey::Position(user);
        e.storage().persistent().set(&pos_key, &pos);
        e.storage().persistent().extend_ttl(&pos_key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    /// Closes the caller's open position and settles PnL against the LP pool.
    ///
    /// PnL is computed on-chain from stored entry data and the caller-provided
    /// close price:
    ///   - long:  pnl = (close_price - entry_price) * xlm_amount / SCALE
    ///   - short: pnl = (entry_price - close_price) * xlm_amount / SCALE
    ///
    /// - pnl > 0: pool pays the winner — PoolBalance -= pnl, UserMargin += collateral + pnl
    /// - pnl < 0: pool gains from the loser — PoolBalance += |pnl|, UserMargin += collateral - |pnl|
    /// - pnl = 0: UserMargin += collateral (no pool impact)
    ///
    /// Returns `InsufficientPool` if the pool cannot cover a winning payout.
    pub fn close_position(
        e: Env,
        user: Address,
        collateral_token: Address,
        close_price: i128,
    ) -> Result<Position, Error> {
        user.require_auth();

        let pos_key = DataKey::Position(user.clone());
        let pos: Position = e
            .storage()
            .persistent()
            .get(&pos_key)
            .ok_or(Error::NoOpenPosition)?;

        let price_diff = if pos.is_long {
            close_price - pos.entry_price
        } else {
            pos.entry_price - close_price
        };
        let pnl = price_diff * pos.xlm_amount / SCALE;

        let pool_key = DataKey::PoolBalance(collateral_token.clone());
        let pool_bal: i128 = e.storage().persistent().get(&pool_key).unwrap_or(0);

        let col_key = DataKey::UserMargin(user, collateral_token);
        let free: i128 = e.storage().persistent().get(&col_key).unwrap_or(0);

        if pnl > 0 {
            // Pool pays the winner
            if pool_bal < pnl {
                return Err(Error::InsufficientPool);
            }
            e.storage().persistent().set(&pool_key, &(pool_bal - pnl));
            e.storage().persistent().set(&col_key, &(free + pos.collateral_locked + pnl));
        } else if pnl < 0 {
            // Pool gains from the loser
            let loss = -pnl; // positive amount
            let user_gets = if loss >= pos.collateral_locked {
                // Fully liquidated — pool takes all collateral
                e.storage().persistent().set(&pool_key, &(pool_bal + pos.collateral_locked));
                0i128
            } else {
                e.storage().persistent().set(&pool_key, &(pool_bal + loss));
                pos.collateral_locked - loss
            };
            e.storage().persistent().set(&col_key, &(free + user_gets));
        } else {
            // pnl == 0 — return collateral unchanged
            e.storage().persistent().set(&col_key, &(free + pos.collateral_locked));
        }

        e.storage().persistent().remove(&pos_key);
        Ok(pos)
    }

    // ── Read-only ─────────────────────────────────────────────────────────────

    pub fn get_position(e: Env, user: Address) -> Option<Position> {
        e.storage().persistent().get(&DataKey::Position(user))
    }

    /// Free margin balance for a user (alias for UserMargin).
    pub fn get_collateral_balance(e: Env, user: Address, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::UserMargin(user, token))
            .unwrap_or(0)
    }

    /// Total LP pool balance for a token.
    pub fn get_pool_balance(e: Env, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::PoolBalance(token))
            .unwrap_or(0)
    }

    /// LP share amount for a specific user and token.
    pub fn get_lp_share(e: Env, user: Address, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::LPShares(user, token))
            .unwrap_or(0)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn require_admin(e: &Env) -> Result<Address, Error> {
        let admin: Address = e
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        Ok(admin)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::Address as _,
        token::StellarAssetClient,
        Env,
    };

    // Shared constants for position tests:
    //   500 XLM @ entry_price 0.1 USDC → debt = 50 USDC, collateral = 10 USDC (5×)
    const XLM_AMT:    i128 = 500_0000000;   // 500 XLM (scaled)
    const ENTRY:      i128 = 1_000_000;     // 0.1 USDC/XLM (scaled)
    const COLLATERAL: i128 = 10_0000000;    // 10 USDC (scaled)

    fn setup(env: &Env) -> (LeveragePoolClient, Address, Address, Address) {
        let admin = Address::generate(env);
        let user  = Address::generate(env);

        let sac      = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        StellarAssetClient::new(env, &token_id).mint(&user, &100_000_0000000i128);

        let pool_id = env.register(LeveragePool, ());
        let pool    = LeveragePoolClient::new(env, &pool_id);
        pool.initialize(&admin);
        pool.add_collateral_token(&token_id);

        (pool, admin, user, token_id)
    }

    #[test]
    fn test_deposit_and_withdraw_collateral() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &500_0000000i128);
        assert_eq!(pool.get_collateral_balance(&user, &token), 500_0000000i128);

        pool.withdraw_collateral(&user, &token, &200_0000000i128);
        assert_eq!(pool.get_collateral_balance(&user, &token), 300_0000000i128);
    }

    #[test]
    fn test_lp_deposit_and_withdraw() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.lp_deposit(&user, &token, &30_0000000i128);
        assert_eq!(pool.get_pool_balance(&token), 30_0000000i128);
        assert_eq!(pool.get_lp_share(&user, &token), 30_0000000i128);

        pool.lp_withdraw(&user, &token, &10_0000000i128);
        assert_eq!(pool.get_pool_balance(&token), 20_0000000i128);
        assert_eq!(pool.get_lp_share(&user, &token), 20_0000000i128);
    }

    fn open_std_position(pool: &LeveragePoolClient, user: &Address, token: &Address) {
        pool.open_synthetic_position(
            user,
            &symbol_short!("XLM"),
            &XLM_AMT,
            &ENTRY,
            &true,   // long
            token,
            &COLLATERAL,
        );
    }

    #[test]
    fn test_close_winning_position_pool_pays() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        // LP seeds the pool
        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &100_0000000i128);
        pool.lp_deposit(&lp, &token, &50_0000000i128);

        // User deposits 10 USDC margin
        pool.deposit_collateral(&user, &token, &10_0000000i128);
        open_std_position(&pool, &user, &token);
        assert_eq!(pool.get_collateral_balance(&user, &token), 0);

        // close_price = 0.11 USDC → pnl = (1_100_000 - 1_000_000) * 500_0000000 / 10_000_000
        //            = 100_000 * 50 = 5_000_000 = +5 USDC
        let close_price = 1_100_000i128;
        pool.close_position(&user, &token, &close_price);

        assert_eq!(pool.get_pool_balance(&token), 45_0000000i128);             // 50 - 5
        assert_eq!(pool.get_collateral_balance(&user, &token), 15_0000000i128); // 10 + 5
        assert!(pool.get_position(&user).is_none());
    }

    #[test]
    fn test_close_losing_position_pool_gains() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &100_0000000i128);
        pool.lp_deposit(&lp, &token, &50_0000000i128);

        pool.deposit_collateral(&user, &token, &10_0000000i128);
        open_std_position(&pool, &user, &token);

        // close_price = 0.094 USDC → pnl = (940_000 - 1_000_000) * 500_0000000 / 10_000_000
        //            = -60_000 * 50 = -3_000_000 = -3 USDC
        let close_price = 940_000i128;
        pool.close_position(&user, &token, &close_price);

        assert_eq!(pool.get_pool_balance(&token), 53_0000000i128);   // 50 + 3
        assert_eq!(pool.get_collateral_balance(&user, &token), 7_0000000i128); // 10 - 3
        assert!(pool.get_position(&user).is_none());
    }

    #[test]
    fn test_close_liquidated_position_pool_takes_all() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &100_0000000i128);
        pool.lp_deposit(&lp, &token, &50_0000000i128);

        pool.deposit_collateral(&user, &token, &10_0000000i128);
        open_std_position(&pool, &user, &token);

        // close_price = 0.07 USDC → pnl = (700_000 - 1_000_000) * 500_0000000 / 10_000_000
        //            = -300_000 * 50 = -15_000_000 = -15 USDC (> collateral, fully liquidated)
        let close_price = 700_000i128;
        pool.close_position(&user, &token, &close_price);

        assert_eq!(pool.get_pool_balance(&token), 60_0000000i128);   // 50 + 10 (capped)
        assert_eq!(pool.get_collateral_balance(&user, &token), 0);
        assert!(pool.get_position(&user).is_none());
    }

    #[test]
    fn test_close_zero_pnl() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &50_0000000i128);
        pool.lp_deposit(&lp, &token, &50_0000000i128);

        pool.deposit_collateral(&user, &token, &10_0000000i128);
        open_std_position(&pool, &user, &token);

        // close at entry price → pnl = 0
        pool.close_position(&user, &token, &ENTRY);

        assert_eq!(pool.get_pool_balance(&token), 50_0000000i128); // unchanged
        assert_eq!(pool.get_collateral_balance(&user, &token), 10_0000000i128); // returned
    }

    #[test]
    fn test_insufficient_pool_for_winner() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        // Pool only has 1 USDC but user wins 5 USDC
        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &1_0000000i128);
        pool.lp_deposit(&lp, &token, &1_0000000i128);

        pool.deposit_collateral(&user, &token, &10_0000000i128);
        open_std_position(&pool, &user, &token);

        // close_price = 1_100_000 → win +5 USDC, but pool only has 1 USDC
        let result = pool.try_close_position(&user, &token, &1_100_000i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_open_two_positions() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &200_0000000i128);
        // 1000 XLM @ 1.0 USDC → debt = 1000 USDC, collateral = 100 USDC (10×)
        pool.open_synthetic_position(
            &user, &symbol_short!("XLM"),
            &1_000_0000000i128, &10_000_000i128, &true,
            &token, &100_0000000i128,
        );

        let result = pool.try_open_synthetic_position(
            &user, &symbol_short!("XLM"),
            &500_0000000i128, &10_000_000i128, &true,
            &token, &50_0000000i128,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_withdraw_with_open_position() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &100_0000000i128);
        pool.open_synthetic_position(
            &user, &symbol_short!("XLM"),
            &1_000_0000000i128, &10_000_000i128, &true,
            &token, &100_0000000i128,
        );

        let result = pool.try_withdraw_collateral(&user, &token, &10_0000000i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_short_position_pnl() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        let lp = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&lp, &100_0000000i128);
        pool.lp_deposit(&lp, &token, &50_0000000i128);

        pool.deposit_collateral(&user, &token, &10_0000000i128);
        // Short 500 XLM @ 0.1 USDC
        pool.open_synthetic_position(
            &user,
            &symbol_short!("XLM"),
            &XLM_AMT,
            &ENTRY,
            &false,  // short
            &token,
            &COLLATERAL,
        );

        // Price drops to 0.094 → short profit = (entry - close) * xlm / SCALE
        //   = (1_000_000 - 940_000) * 500_0000000 / 10_000_000 = 60_000 * 50 = +3 USDC
        pool.close_position(&user, &token, &940_000i128);

        assert_eq!(pool.get_pool_balance(&token), 47_0000000i128);             // 50 - 3
        assert_eq!(pool.get_collateral_balance(&user, &token), 13_0000000i128); // 10 + 3
    }
}
