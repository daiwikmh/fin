#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, contractclient, symbol_short,
    address_payload::AddressPayload, Address, BytesN, Env, Map, Vec, token,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEDGER_BUMP: u32 = 518400; // ~30 days
const INSTANCE_BUMP: u32 = 518400;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    UnsupportedToken = 3,
    InsufficientBalance = 4,
    AgentSessionInvalid = 5,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ZKAuthContract,
    Admin,
    Balance(Address, Address), // (user, token_sac)
    SupportedToken(Address),
}

// ---------------------------------------------------------------------------
// ZKAuth cross-contract client
// ---------------------------------------------------------------------------

#[contractclient(name = "ZKAuthClient")]
pub trait ZKAuthInterface {
    fn is_session_valid(env: Env, user: Address) -> bool;
    fn get_agent_pubkey(env: Env, user: Address) -> Option<BytesN<32>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);
}

fn extend_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LEDGER_BUMP, LEDGER_BUMP);
}

fn get_balance(env: &Env, user: &Address, token_sac: &Address) -> i128 {
    let key = DataKey::Balance(user.clone(), token_sac.clone());
    let bal = env.storage().persistent().get(&key).unwrap_or(0i128);
    if env.storage().persistent().has(&key) {
        extend_persistent(env, &key);
    }
    bal
}

fn set_balance(env: &Env, user: &Address, token_sac: &Address, amount: i128) {
    let key = DataKey::Balance(user.clone(), token_sac.clone());
    env.storage().persistent().set(&key, &amount);
    extend_persistent(env, &key);
}

fn load_zkauth_address(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::ZKAuthContract)
        .unwrap_or_else(|| panic!("NotInitialized"))
}

fn assert_token_supported(env: &Env, token_sac: &Address) {
    let key = DataKey::SupportedToken(token_sac.clone());
    let supported: bool = env.storage().persistent().get(&key).unwrap_or(false);
    if !supported {
        panic!("UnsupportedToken");
    }
    extend_persistent(env, &key);
}

/// Verifies the calling agent has a valid ZKAuth session and signed this tx.
fn assert_agent_authorized(env: &Env, zkauth_address: &Address, user: &Address) {
    let zkauth = ZKAuthClient::new(env, zkauth_address);

    if !zkauth.is_session_valid(user) {
        panic!("AgentSessionInvalid");
    }

    let agent_pubkey: BytesN<32> = zkauth
        .get_agent_pubkey(user)
        .unwrap_or_else(|| panic!("AgentSessionInvalid"));

    // Convert agent Ed25519 pubkey to a Soroban Address and require its auth.
    // The agent must have signed this transaction with their keypair.
    let payload = AddressPayload::AccountIdPublicKeyEd25519(agent_pubkey);
    let agent_addr = Address::from_payload(env, payload);
    agent_addr.require_auth();
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct AgentVault;

#[contractimpl]
impl AgentVault {
    /// One-time init.
    pub fn initialize(env: Env, admin: Address, zkauth_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("AlreadyInitialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ZKAuthContract, &zkauth_contract);
        extend_instance(&env);
    }

    /// Admin: whitelist a SAC token.
    pub fn add_supported_token(env: Env, caller: Address, token_sac: Address) {
        extend_instance(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("NotInitialized"));
        admin.require_auth();
        assert_eq!(caller, admin);

        let key = DataKey::SupportedToken(token_sac.clone());
        env.storage().persistent().set(&key, &true);
        extend_persistent(&env, &key);

        env.events()
            .publish((symbol_short!("token"), symbol_short!("added")), token_sac);
    }

    /// Admin: remove a token from the whitelist. Existing balances can still withdraw.
    pub fn remove_supported_token(env: Env, caller: Address, token_sac: Address) {
        extend_instance(&env);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("NotInitialized"));
        admin.require_auth();
        assert_eq!(caller, admin);

        let key = DataKey::SupportedToken(token_sac.clone());
        env.storage().persistent().set(&key, &false);
        extend_persistent(&env, &key);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("removed")),
            token_sac,
        );
    }

    /// User deposits a supported token.
    pub fn deposit(env: Env, user: Address, token_sac: Address, amount: i128) {
        user.require_auth();
        extend_instance(&env);
        assert_token_supported(&env, &token_sac);

        let token_client = token::Client::new(&env, &token_sac);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        let new_balance = get_balance(&env, &user, &token_sac) + amount;
        set_balance(&env, &user, &token_sac, new_balance);

        env.events().publish(
            (symbol_short!("deposit"),),
            (user, token_sac, amount, new_balance),
        );
    }

    /// User withdraws their own funds.
    pub fn withdraw(env: Env, user: Address, token_sac: Address, amount: i128) {
        user.require_auth();
        extend_instance(&env);

        let balance = get_balance(&env, &user, &token_sac);
        if balance < amount {
            panic!("InsufficientBalance");
        }

        let token_client = token::Client::new(&env, &token_sac);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        let new_balance = balance - amount;
        set_balance(&env, &user, &token_sac, new_balance);

        env.events().publish(
            (symbol_short!("withdraw"),),
            (user, token_sac, amount, new_balance),
        );
    }

    /// Agent moves user funds to a destination (DEX, bridge, etc).
    pub fn agent_withdraw(
        env: Env,
        user: Address,
        token_sac: Address,
        amount: i128,
        destination: Address,
    ) {
        extend_instance(&env);
        let zkauth_address = load_zkauth_address(&env);
        assert_agent_authorized(&env, &zkauth_address, &user);

        let balance = get_balance(&env, &user, &token_sac);
        if balance < amount {
            panic!("InsufficientBalance");
        }

        let token_client = token::Client::new(&env, &token_sac);
        token_client.transfer(&env.current_contract_address(), &destination, &amount);

        let new_balance = balance - amount;
        set_balance(&env, &user, &token_sac, new_balance);

        env.events().publish(
            (symbol_short!("agent_wd"),),
            (user, token_sac, amount, destination),
        );
    }

    /// Agent returns funds after a trade settles.
    /// The agent must have already transferred tokens to this contract via SAC.
    pub fn agent_return_funds(env: Env, user: Address, token_sac: Address, amount: i128) {
        extend_instance(&env);
        let zkauth_address = load_zkauth_address(&env);
        assert_agent_authorized(&env, &zkauth_address, &user);

        let new_balance = get_balance(&env, &user, &token_sac) + amount;
        set_balance(&env, &user, &token_sac, new_balance);

        env.events().publish(
            (symbol_short!("returned"),),
            (user, token_sac, amount),
        );
    }

    /// Read-only: single balance.
    pub fn get_balance(env: Env, user: Address, token_sac: Address) -> i128 {
        extend_instance(&env);
        get_balance(&env, &user, &token_sac)
    }

    /// Read-only: batch fetch balances.
    pub fn get_all_balances(env: Env, user: Address, tokens: Vec<Address>) -> Map<Address, i128> {
        extend_instance(&env);
        let mut balances = Map::new(&env);
        for token_addr in tokens.iter() {
            let bal = get_balance(&env, &user, &token_addr);
            balances.set(token_addr, bal);
        }
        balances
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    // Mock ZKAuth contract that always returns valid session
    #[contract]
    pub struct MockZKAuth;

    #[contractimpl]
    impl MockZKAuth {
        pub fn is_session_valid(_env: Env, _user: Address) -> bool {
            true
        }
        pub fn get_agent_pubkey(env: Env, _user: Address) -> Option<BytesN<32>> {
            Some(BytesN::from_array(&env, &[42u8; 32]))
        }
    }

    // Mock ZKAuth that returns invalid session
    #[contract]
    pub struct MockZKAuthInvalid;

    #[contractimpl]
    impl MockZKAuthInvalid {
        pub fn is_session_valid(_env: Env, _user: Address) -> bool {
            false
        }
        pub fn get_agent_pubkey(_env: Env, _user: Address) -> Option<BytesN<32>> {
            None
        }
    }

    fn setup_with_token() -> (Env, AgentVaultClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let zkauth_id = env.register(MockZKAuth, ());
        let contract_id = env.register(AgentVault, ());
        let client = AgentVaultClient::new(&env, &contract_id);

        client.initialize(&admin, &zkauth_id);

        // Register a test token
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_sac = token_contract.address();

        client.add_supported_token(&admin, &token_sac);

        (env, client, admin, token_sac, token_admin)
    }

    #[test]
    fn test_deposit_and_withdraw_round_trip() {
        let (env, client, _admin, token_sac, token_admin) = setup_with_token();
        let user = Address::generate(&env);

        // Mint tokens to user
        let sac_client = token::StellarAssetClient::new(&env, &token_sac);
        sac_client.mint(&user, &1_000_0000000i128);

        // Deposit
        client.deposit(&user, &token_sac, &500_0000000i128);
        assert_eq!(client.get_balance(&user, &token_sac), 500_0000000i128);

        // Withdraw
        client.withdraw(&user, &token_sac, &200_0000000i128);
        assert_eq!(client.get_balance(&user, &token_sac), 300_0000000i128);
    }

    #[test]
    #[should_panic(expected = "InsufficientBalance")]
    fn test_withdraw_more_than_balance() {
        let (env, client, _admin, token_sac, _token_admin) = setup_with_token();
        let user = Address::generate(&env);

        let sac_client = token::StellarAssetClient::new(&env, &token_sac);
        sac_client.mint(&user, &100_0000000i128);

        client.deposit(&user, &token_sac, &100_0000000i128);
        client.withdraw(&user, &token_sac, &200_0000000i128);
    }

    #[test]
    fn test_agent_withdraw_valid_session() {
        let (env, client, _admin, token_sac, _token_admin) = setup_with_token();
        let user = Address::generate(&env);
        let destination = Address::generate(&env);

        let sac_client = token::StellarAssetClient::new(&env, &token_sac);
        sac_client.mint(&user, &1_000_0000000i128);

        client.deposit(&user, &token_sac, &500_0000000i128);
        client.agent_withdraw(&user, &token_sac, &200_0000000i128, &destination);

        assert_eq!(client.get_balance(&user, &token_sac), 300_0000000i128);
    }

    #[test]
    #[should_panic(expected = "AgentSessionInvalid")]
    fn test_agent_withdraw_invalid_session() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let zkauth_id = env.register(MockZKAuthInvalid, ());
        let contract_id = env.register(AgentVault, ());
        let client = AgentVaultClient::new(&env, &contract_id);
        client.initialize(&admin, &zkauth_id);

        let user = Address::generate(&env);
        let token_sac = Address::generate(&env);
        let destination = Address::generate(&env);

        client.agent_withdraw(&user, &token_sac, &100i128, &destination);
    }

    #[test]
    fn test_agent_return_funds_cycle() {
        let (env, client, _admin, token_sac, _token_admin) = setup_with_token();
        let user = Address::generate(&env);

        let sac_client = token::StellarAssetClient::new(&env, &token_sac);
        sac_client.mint(&user, &1_000_0000000i128);

        client.deposit(&user, &token_sac, &500_0000000i128);
        client.agent_withdraw(&user, &token_sac, &300_0000000i128, &Address::generate(&env));
        assert_eq!(client.get_balance(&user, &token_sac), 200_0000000i128);

        // Agent returns funds after trade
        client.agent_return_funds(&user, &token_sac, &350_0000000i128);
        assert_eq!(client.get_balance(&user, &token_sac), 550_0000000i128);
    }

    #[test]
    #[should_panic(expected = "UnsupportedToken")]
    fn test_unsupported_token_rejection() {
        let (env, client, _admin, _token_sac, _token_admin) = setup_with_token();
        let user = Address::generate(&env);
        let bad_token = Address::generate(&env);

        client.deposit(&user, &bad_token, &100i128);
    }

    #[test]
    fn test_get_all_balances() {
        let (env, client, admin, token_sac, _token_admin) = setup_with_token();
        let user = Address::generate(&env);

        let sac_client = token::StellarAssetClient::new(&env, &token_sac);
        sac_client.mint(&user, &1_000_0000000i128);
        client.deposit(&user, &token_sac, &500_0000000i128);

        let tokens = soroban_sdk::vec![&env, token_sac.clone()];
        let balances = client.get_all_balances(&user, &tokens);
        assert_eq!(balances.get(token_sac).unwrap(), 500_0000000i128);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_double_initialize() {
        let (env, client, admin, _token_sac, _token_admin) = setup_with_token();
        let zkauth = Address::generate(&env);
        client.initialize(&admin, &zkauth);
    }
}
