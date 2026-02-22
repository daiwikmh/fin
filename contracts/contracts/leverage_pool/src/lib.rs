#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, token, Address, Env, Symbol};

// ── Errors ───────────────────────────────────────────────────────────────────

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
}

// ── Position — the core debt-tracking struct ──────────────────────────────────
//
// Stored on-chain for every user with an open synthetic trade.
// Actual PnL settlement is done by AgentVault.settle_pnl; this contract
// purely tracks what is locked and what is owed.

#[contracttype]
#[derive(Clone)]
pub struct Position {
    /// The user who owns this position.
    pub user: Address,
    /// Human-readable symbol of the synthetic asset, e.g. `symbol_short!("XLM")`.
    pub asset_symbol: Symbol,
    /// Notional debt the user has taken on (scaled to 7 decimals).
    /// For a 10× leveraged position with 100 USDC collateral this would be 1000.
    pub debt_amount: i128,
    /// Amount of collateral token locked while this position is open.
    pub collateral_locked: i128,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SupportedCollateral(Address),        // token -> bool
    CollateralBalance(Address, Address), // (user, token) -> i128 free balance
    Position(Address),                   // user -> Position
}

const TTL_BUMP: u32 = 518_400; // ~30 days

// ── Contract ─────────────────────────────────────────────────────────────────

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

    /// Admin-only: allow a token to be used as collateral.
    pub fn add_collateral_token(e: Env, token: Address) -> Result<(), Error> {
        Self::require_admin(&e)?;
        e.storage()
            .persistent()
            .set(&DataKey::SupportedCollateral(token), &true);
        Ok(())
    }

    // ── Collateral management (user-callable) ─────────────────────────────────

    pub fn deposit_collateral(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        if !e
            .storage()
            .persistent()
            .has(&DataKey::SupportedCollateral(token.clone()))
        {
            return Err(Error::UnsupportedCollateral);
        }
        token::Client::new(&e, &token).transfer(
            &user,
            &e.current_contract_address(),
            &amount,
        );
        let key = DataKey::CollateralBalance(user, token);
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        e.storage().persistent().set(&key, &(prev + amount));
        e.storage().persistent().extend_ttl(&key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    pub fn withdraw_collateral(
        e: Env,
        user: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        user.require_auth();
        // Block withdrawal while a position is open
        if e.storage()
            .persistent()
            .has(&DataKey::Position(user.clone()))
        {
            return Err(Error::PositionAlreadyOpen);
        }
        let key = DataKey::CollateralBalance(user.clone(), token.clone());
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        if prev < amount {
            return Err(Error::InsufficientCollateral);
        }
        e.storage().persistent().set(&key, &(prev - amount));
        token::Client::new(&e, &token).transfer(
            &e.current_contract_address(),
            &user,
            &amount,
        );
        Ok(())
    }

    // ── Synthetic position lifecycle — Admin (Go matching engine) only ─────────

    /// Called by the Go matching engine after off-chain order matching.
    /// Locks `collateral_locked` from the user's free collateral balance and
    /// records the Position on-chain for transparency and liquidation tracking.
    pub fn open_synthetic_position(
        e: Env,
        user: Address,
        asset_symbol: Symbol,
        debt_amount: i128,
        collateral_token: Address,
        collateral_locked: i128,
    ) -> Result<(), Error> {
        Self::require_admin(&e)?;

        // One position per user at a time
        if e.storage()
            .persistent()
            .has(&DataKey::Position(user.clone()))
        {
            return Err(Error::PositionAlreadyOpen);
        }

        // Deduct from free collateral balance
        let col_key = DataKey::CollateralBalance(user.clone(), collateral_token.clone());
        let free: i128 = e.storage().persistent().get(&col_key).unwrap_or(0);
        if free < collateral_locked {
            return Err(Error::InsufficientCollateral);
        }
        e.storage().persistent().set(&col_key, &(free - collateral_locked));

        // Write position record
        let pos = Position {
            user: user.clone(),
            asset_symbol,
            debt_amount,
            collateral_locked,
        };
        let pos_key = DataKey::Position(user);
        e.storage().persistent().set(&pos_key, &pos);
        e.storage().persistent().extend_ttl(&pos_key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    /// Admin-only. Releases locked collateral back to free pool and removes the
    /// position record. Call this AFTER AgentVault.settle_pnl has handled money.
    pub fn close_position(
        e: Env,
        user: Address,
        collateral_token: Address,
    ) -> Result<Position, Error> {
        Self::require_admin(&e)?;

        let pos_key = DataKey::Position(user.clone());
        let pos: Position = e
            .storage()
            .persistent()
            .get(&pos_key)
            .ok_or(Error::NoOpenPosition)?;

        e.storage().persistent().remove(&pos_key);

        // Return locked collateral to free pool
        let col_key = DataKey::CollateralBalance(user, collateral_token);
        let free: i128 = e.storage().persistent().get(&col_key).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&col_key, &(free + pos.collateral_locked));

        Ok(pos)
    }

    // ── Read-only ─────────────────────────────────────────────────────────────

    pub fn get_position(e: Env, user: Address) -> Option<Position> {
        e.storage().persistent().get(&DataKey::Position(user))
    }

    pub fn get_collateral_balance(e: Env, user: Address, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::CollateralBalance(user, token))
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

    fn setup(env: &Env) -> (LeveragePoolClient, Address, Address, Address) {
        let admin = Address::generate(env);
        let user = Address::generate(env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        StellarAssetClient::new(env, &token_id).mint(&user, &10_000_0000000i128);

        let pool_id = env.register(LeveragePool, ());
        let pool = LeveragePoolClient::new(env, &pool_id);
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

    /// Winning Long scenario (position lifecycle side):
    /// Go engine opens a position, position appears on-chain, then closes it.
    #[test]
    fn test_open_synthetic_position_winning_long() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &100_0000000i128); // 100 USDC

        // Go engine opens: 10× long on XLM, locks 100 USDC, debt = 1,000 USDC notional
        pool.open_synthetic_position(
            &user,
            &symbol_short!("XLM"),
            &1_000_0000000i128, // debt
            &token,
            &100_0000000i128,   // collateral locked
        );

        let pos = pool.get_position(&user).expect("position must exist");
        assert_eq!(pos.debt_amount, 1_000_0000000i128);
        assert_eq!(pos.collateral_locked, 100_0000000i128);
        // Free balance is now 0
        assert_eq!(pool.get_collateral_balance(&user, &token), 0);

        // Go engine closes after profitable trade
        let closed = pool.close_position(&user, &token);
        assert_eq!(closed.collateral_locked, 100_0000000i128);
        // Locked collateral returned to free pool
        assert_eq!(pool.get_collateral_balance(&user, &token), 100_0000000i128);
        assert!(pool.get_position(&user).is_none());
    }

    /// Liquidated Short scenario:
    /// Go liquidation engine detects mark price > 90% collateral loss threshold,
    /// calls close_position to remove the record (PnL already settled via vault).
    #[test]
    fn test_liquidated_short_position_close() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &100_0000000i128);

        // Open short
        pool.open_synthetic_position(
            &user,
            &symbol_short!("XLM"),
            &1_000_0000000i128,
            &token,
            &100_0000000i128,
        );

        // Liquidation: Go engine already called AgentVault.settle_pnl(-90 USDC).
        // Now close the on-chain position record.
        pool.close_position(&user, &token);

        // Position cleared
        assert!(pool.get_position(&user).is_none());
    }

    #[test]
    fn test_cannot_open_two_positions() {
        let env = Env::default();
        env.mock_all_auths();
        let (pool, _admin, user, token) = setup(&env);

        pool.deposit_collateral(&user, &token, &200_0000000i128);
        pool.open_synthetic_position(
            &user,
            &symbol_short!("XLM"),
            &1_000_0000000i128,
            &token,
            &100_0000000i128,
        );

        let result = pool.try_open_synthetic_position(
            &user,
            &symbol_short!("XLM"),
            &500_0000000i128,
            &token,
            &50_0000000i128,
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
            &user,
            &symbol_short!("XLM"),
            &1_000_0000000i128,
            &token,
            &100_0000000i128,
        );

        let result = pool.try_withdraw_collateral(&user, &token, &10_0000000i128);
        assert!(result.is_err());
    }
}
