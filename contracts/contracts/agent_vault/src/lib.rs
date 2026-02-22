#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, token, Address, Env};

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized      = 1,
    AlreadyInitialized  = 2,
    UnsupportedToken    = 3,
    InsufficientBalance = 4,
    Unauthorized        = 5,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    SupportedToken(Address),    // token -> bool
    Balance(Address, Address),  // (user, token) -> i128
    TerminalPool(Address),      // token -> i128  (terminal's own liquidity pool)
}

const TTL_BUMP: u32 = 518_400; // ~30 days at 5s/ledger

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct AgentVault;

#[contractimpl]
impl AgentVault {
    // ── Initialisation ───────────────────────────────────────────────────────

    pub fn initialize(e: Env, admin: Address) -> Result<(), Error> {
        if e.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().extend_ttl(TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    /// Admin-only: whitelist a token so users can deposit it.
    pub fn add_supported_token(e: Env, token: Address) -> Result<(), Error> {
        Self::require_admin(&e)?;
        e.storage()
            .persistent()
            .set(&DataKey::SupportedToken(token), &true);
        Ok(())
    }

    // ── User deposit / withdraw ───────────────────────────────────────────────

    pub fn deposit(e: Env, user: Address, token: Address, amount: i128) -> Result<(), Error> {
        user.require_auth();
        if !e
            .storage()
            .persistent()
            .has(&DataKey::SupportedToken(token.clone()))
        {
            return Err(Error::UnsupportedToken);
        }
        token::Client::new(&e, &token).transfer(
            &user,
            &e.current_contract_address(),
            &amount,
        );
        let key = DataKey::Balance(user, token);
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        e.storage().persistent().set(&key, &(prev + amount));
        e.storage().persistent().extend_ttl(&key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    pub fn withdraw(e: Env, user: Address, token: Address, amount: i128) -> Result<(), Error> {
        user.require_auth();
        let key = DataKey::Balance(user.clone(), token.clone());
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        if prev < amount {
            return Err(Error::InsufficientBalance);
        }
        e.storage().persistent().set(&key, &(prev - amount));
        token::Client::new(&e, &token).transfer(
            &e.current_contract_address(),
            &user,
            &amount,
        );
        Ok(())
    }

    // ── PnL settlement ── Admin (Go backend) only ─────────────────────────────
    //
    // pnl > 0 → winning trade: TerminalPool ─► user Balance.
    // pnl < 0 → losing trade : user Balance  ─► TerminalPool.
    // pnl = 0 → no-op.
    //
    // All amounts are in the token's native unit (7-decimal scaled for USDC/XLM).

    pub fn settle_pnl(
        e: Env,
        user: Address,
        token: Address,
        pnl: i128,
    ) -> Result<(), Error> {
        Self::require_admin(&e)?;

        if pnl == 0 {
            return Ok(());
        }

        let user_key = DataKey::Balance(user.clone(), token.clone());
        let pool_key = DataKey::TerminalPool(token.clone());

        let user_bal: i128 = e.storage().persistent().get(&user_key).unwrap_or(0);
        let pool_bal: i128 = e.storage().persistent().get(&pool_key).unwrap_or(0);

        if pnl > 0 {
            // User won → pay from TerminalPool
            if pool_bal < pnl {
                return Err(Error::InsufficientBalance);
            }
            e.storage().persistent().set(&pool_key, &(pool_bal - pnl));
            e.storage().persistent().set(&user_key, &(user_bal + pnl));
        } else {
            // User lost → seize into TerminalPool (pnl is negative, so -pnl is positive)
            let loss = -pnl;
            if user_bal < loss {
                return Err(Error::InsufficientBalance);
            }
            e.storage().persistent().set(&user_key, &(user_bal - loss));
            e.storage().persistent().set(&pool_key, &(pool_bal + loss));
        }

        e.storage().persistent().extend_ttl(&user_key, TTL_BUMP, TTL_BUMP);
        e.storage().persistent().extend_ttl(&pool_key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    // ── Terminal pool ─────────────────────────────────────────────────────────

    /// Admin seeds the pool that backs winning-trade payouts.
    pub fn fund_terminal_pool(e: Env, token: Address, amount: i128) -> Result<(), Error> {
        let admin = Self::require_admin(&e)?;
        token::Client::new(&e, &token).transfer(
            &admin,
            &e.current_contract_address(),
            &amount,
        );
        let key = DataKey::TerminalPool(token);
        let prev: i128 = e.storage().persistent().get(&key).unwrap_or(0);
        e.storage().persistent().set(&key, &(prev + amount));
        e.storage().persistent().extend_ttl(&key, TTL_BUMP, TTL_BUMP);
        Ok(())
    }

    // ── Read-only ─────────────────────────────────────────────────────────────

    pub fn get_balance(e: Env, user: Address, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::Balance(user, token))
            .unwrap_or(0)
    }

    pub fn get_terminal_pool(e: Env, token: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&DataKey::TerminalPool(token))
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
    use soroban_sdk::{testutils::Address as _, token::StellarAssetClient, Env};

    fn setup(env: &Env) -> (AgentVaultClient, Address, Address, Address) {
        let admin = Address::generate(env);
        let user = Address::generate(env);

        // Register a Stellar Asset Contract (SAC) as the test token
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        let sac_admin = StellarAssetClient::new(env, &token_id);
        sac_admin.mint(&user, &1_000_000_0000000i128);   // 1,000,000 USDC
        sac_admin.mint(&admin, &10_000_000_0000000i128); // 10,000,000 USDC (pool seed)

        let vault_id = env.register(AgentVault, ());
        let vault = AgentVaultClient::new(env, &vault_id);
        vault.initialize(&admin);
        vault.add_supported_token(&token_id);
        // Seed terminal pool with 100,000 USDC
        vault.fund_terminal_pool(&token_id, &100_000_0000000i128);

        (vault, admin, user, token_id)
    }

    #[test]
    fn test_deposit_and_withdraw() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _admin, user, token) = setup(&env);

        vault.deposit(&user, &token, &500_0000000i128);
        assert_eq!(vault.get_balance(&user, &token), 500_0000000i128);

        vault.withdraw(&user, &token, &200_0000000i128);
        assert_eq!(vault.get_balance(&user, &token), 300_0000000i128);
    }

    /// Winning Long:
    /// User opens XLM/USDC long at entry 0.10. Mark rises to 0.12.
    /// PnL = (0.12 - 0.10) × 1000 XLM = +20 USDC.
    /// settle_pnl(+20 USDC) credits user, debits TerminalPool.
    #[test]
    fn test_settle_pnl_winning_long() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _admin, user, token) = setup(&env);

        vault.deposit(&user, &token, &100_0000000i128); // 100 USDC collateral

        let pool_before = vault.get_terminal_pool(&token);
        let user_before = vault.get_balance(&user, &token);

        let profit = 20_0000000i128; // +20 USDC
        vault.settle_pnl(&user, &token, &profit);

        assert_eq!(vault.get_balance(&user, &token), user_before + profit);
        assert_eq!(vault.get_terminal_pool(&token), pool_before - profit);
    }

    /// Liquidated Short:
    /// User opens XLM/USDC short at entry 0.10. Mark rises to 0.19.
    /// Unrealised loss = 90% of collateral → liquidation threshold crossed.
    /// settle_pnl(-90 USDC) seizes funds into TerminalPool.
    #[test]
    fn test_settle_pnl_liquidated_short() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _admin, user, token) = setup(&env);

        vault.deposit(&user, &token, &100_0000000i128); // 100 USDC collateral

        let pool_before = vault.get_terminal_pool(&token);
        let user_before = vault.get_balance(&user, &token);

        let loss = -90_0000000i128; // -90 USDC (90% collateral wiped → liquidated)
        vault.settle_pnl(&user, &token, &loss);

        assert_eq!(vault.get_balance(&user, &token), user_before - 90_0000000i128);
        assert_eq!(vault.get_terminal_pool(&token), pool_before + 90_0000000i128);
    }

    #[test]
    fn test_settle_pnl_pool_underfunded_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _admin, user, token) = setup(&env);

        vault.deposit(&user, &token, &100_0000000i128);

        // Try to pay out more than pool holds (pool = 100,000 USDC)
        let over_profit = 200_000_0000000i128;
        let result = vault.try_settle_pnl(&user, &token, &over_profit);
        assert!(result.is_err());
    }
}
