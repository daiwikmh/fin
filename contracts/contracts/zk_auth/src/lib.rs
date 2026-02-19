#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short, vec, Address, Bytes,
    BytesN, Env, Vec, U256,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SESSION_LEDGERS: u32 = 17280; // ~24 hours at 5s/ledger
const MIN_SESSION_LEDGERS: u32 = 720; // ~1 hour minimum
const LEDGER_BUMP: u32 = 18280; // session max + 1000 buffer
const INSTANCE_BUMP: u32 = 518400; // ~30 days for config

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidSessionDuration = 3,
    ProofVerificationFailed = 4,
    NoActiveSession = 5,
    SessionExpired = 6,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub session_id: u64,
    pub agent_pubkey: BytesN<32>,
    pub poseidon_hash: BytesN<32>,
    pub expires_at_ledger: u32,
    pub created_at_ledger: u32,
    pub nonce: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredVK {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZKProof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ActiveSession(Address),
    VerifyingKey,
    Admin,
    SessionCounter(Address),
}

// ---------------------------------------------------------------------------
// Groth16 verification (mocked in tests)
// ---------------------------------------------------------------------------

#[cfg(not(test))]
fn verify_groth16(env: &Env, vk: &StoredVK, poseidon_hash: &BytesN<32>, proof: &ZKProof) {
    use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr};

    let hash_bytes: Bytes = poseidon_hash.clone().into();
    let public_input_u256 = U256::from_be_bytes(env, &hash_bytes);
    let public_input_fr = Fr::from_u256(public_input_u256);

    let bn = env.crypto().bn254();

    // vk_x = IC[0] + IC[1] * public_input
    let ic0 = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
    let ic1 = Bn254G1Affine::from_bytes(vk.ic.get(1).unwrap());
    let ic1_scaled = bn.g1_mul(&ic1, &public_input_fr);
    let vk_x = bn.g1_add(&ic0, &ic1_scaled);

    let proof_a = Bn254G1Affine::from_bytes(proof.a.clone());
    let proof_b = Bn254G2Affine::from_bytes(proof.b.clone());
    let proof_c = Bn254G1Affine::from_bytes(proof.c.clone());
    let alpha_g1 = Bn254G1Affine::from_bytes(vk.alpha_g1.clone());
    let beta_g2 = Bn254G2Affine::from_bytes(vk.beta_g2.clone());
    let gamma_g2 = Bn254G2Affine::from_bytes(vk.gamma_g2.clone());
    let delta_g2 = Bn254G2Affine::from_bytes(vk.delta_g2.clone());

    // Negate points for the pairing equation
    let neg_alpha = -alpha_g1;
    let neg_vk_x = -vk_x;
    let neg_proof_c = -proof_c;

    // Pairing check: e(A,B) * e(-alpha,beta) * e(-vk_x,gamma) * e(-C,delta) == 1
    let g1_vec = vec![env, proof_a, neg_alpha, neg_vk_x, neg_proof_c];
    let g2_vec = vec![env, proof_b, beta_g2, gamma_g2, delta_g2];

    if !bn.pairing_check(g1_vec, g2_vec) {
        panic!("ProofVerificationFailed");
    }
}

#[cfg(test)]
fn verify_groth16(_env: &Env, _vk: &StoredVK, _poseidon_hash: &BytesN<32>, _proof: &ZKProof) {
    // Mock: always succeeds in tests
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct ZKAuth;

#[contractimpl]
impl ZKAuth {
    /// One-time init. Stores admin and the fixed protocol-wide verifying key.
    pub fn initialize(env: Env, admin: Address, verifying_key: StoredVK) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("AlreadyInitialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::VerifyingKey, &verifying_key);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);
    }

    /// Create a session — the ONLY function that does ZK verification.
    pub fn start_session(
        env: Env,
        user: Address,
        agent_pubkey: BytesN<32>,
        poseidon_hash: BytesN<32>,
        session_duration_ledgers: u32,
        proof: ZKProof,
    ) {
        user.require_auth();
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);

        if session_duration_ledgers < MIN_SESSION_LEDGERS
            || session_duration_ledgers > MAX_SESSION_LEDGERS
        {
            panic!("InvalidSessionDuration");
        }

        let vk: StoredVK = env
            .storage()
            .instance()
            .get(&DataKey::VerifyingKey)
            .unwrap_or_else(|| panic!("NotInitialized"));

        // --- ZK proof verification (mocked in tests) ---
        verify_groth16(&env, &vk, &poseidon_hash, &proof);

        // Increment monotonic session counter
        let counter_key = DataKey::SessionCounter(user.clone());
        let session_id: u64 = env
            .storage()
            .persistent()
            .get(&counter_key)
            .unwrap_or(0)
            + 1;
        env.storage().persistent().set(&counter_key, &session_id);

        let current_ledger = env.ledger().sequence();
        let expires_at = current_ledger + session_duration_ledgers;

        let session = Session {
            session_id,
            agent_pubkey: agent_pubkey.clone(),
            poseidon_hash,
            expires_at_ledger: expires_at,
            created_at_ledger: current_ledger,
            nonce: 0,
        };

        // Overwrite any existing session — old one is dead immediately
        let session_key = DataKey::ActiveSession(user.clone());
        env.storage().persistent().set(&session_key, &session);
        env.storage()
            .persistent()
            .extend_ttl(&session_key, LEDGER_BUMP, LEDGER_BUMP);
        env.storage()
            .persistent()
            .extend_ttl(&counter_key, LEDGER_BUMP, LEDGER_BUMP);

        env.events().publish(
            (symbol_short!("session"), symbol_short!("started")),
            (user, session_id, agent_pubkey, expires_at),
        );
    }

    /// Immediately kill a session. No error if none exists.
    pub fn invalidate_session(env: Env, user: Address) {
        user.require_auth();
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);

        let session_key = DataKey::ActiveSession(user.clone());
        let session_id = env
            .storage()
            .persistent()
            .get::<_, Session>(&session_key)
            .map(|s| s.session_id)
            .unwrap_or(0);

        env.storage().persistent().remove(&session_key);

        env.events().publish(
            (symbol_short!("session"), symbol_short!("invalid")),
            (user, session_id),
        );
    }

    /// Fast read — the primary function called by AgentVault / LeveragePool.
    pub fn is_session_valid(env: Env, user: Address) -> bool {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);

        let session_key = DataKey::ActiveSession(user);
        match env.storage().persistent().get::<_, Session>(&session_key) {
            Some(session) => {
                env.storage()
                    .persistent()
                    .extend_ttl(&session_key, LEDGER_BUMP, LEDGER_BUMP);
                env.ledger().sequence() < session.expires_at_ledger
            }
            None => false,
        }
    }

    /// Returns the registered agent pubkey if session is valid, None otherwise.
    pub fn get_agent_pubkey(env: Env, user: Address) -> Option<BytesN<32>> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_BUMP, INSTANCE_BUMP);

        let session_key = DataKey::ActiveSession(user);
        match env.storage().persistent().get::<_, Session>(&session_key) {
            Some(session) if env.ledger().sequence() < session.expires_at_ledger => {
                env.storage()
                    .persistent()
                    .extend_ttl(&session_key, LEDGER_BUMP, LEDGER_BUMP);
                Some(session.agent_pubkey)
            }
            _ => None,
        }
    }

}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn dummy_vk(env: &Env) -> StoredVK {
        StoredVK {
            alpha_g1: BytesN::from_array(env, &[0u8; 64]),
            beta_g2: BytesN::from_array(env, &[0u8; 128]),
            gamma_g2: BytesN::from_array(env, &[0u8; 128]),
            delta_g2: BytesN::from_array(env, &[0u8; 128]),
            ic: vec![
                env,
                BytesN::from_array(env, &[0u8; 64]),
                BytesN::from_array(env, &[1u8; 64]),
            ],
        }
    }

    fn dummy_proof(env: &Env) -> ZKProof {
        ZKProof {
            a: BytesN::from_array(env, &[0u8; 64]),
            b: BytesN::from_array(env, &[0u8; 128]),
            c: BytesN::from_array(env, &[0u8; 64]),
        }
    }

    fn setup() -> (Env, ZKAuthClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ZKAuth, ());
        let client = ZKAuthClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &dummy_vk(&env));
        (env, client, admin)
    }

    #[test]
    fn test_successful_session_creation() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let agent_pubkey = BytesN::from_array(&env, &[42u8; 32]);
        let hash = BytesN::from_array(&env, &[7u8; 32]);

        client.start_session(&user, &agent_pubkey, &hash, &1000u32, &dummy_proof(&env));

        assert!(client.is_session_valid(&user));
        assert_eq!(client.get_agent_pubkey(&user), Some(agent_pubkey));
    }

    #[test]
    fn test_session_expiry() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let agent_pubkey = BytesN::from_array(&env, &[42u8; 32]);
        let hash = BytesN::from_array(&env, &[7u8; 32]);

        client.start_session(&user, &agent_pubkey, &hash, &720u32, &dummy_proof(&env));
        assert!(client.is_session_valid(&user));

        // Advance ledger past expiry
        env.ledger().set_sequence_number(env.ledger().sequence() + 721);
        assert!(!client.is_session_valid(&user));
        assert_eq!(client.get_agent_pubkey(&user), None);
    }

    #[test]
    fn test_duplicate_session_replacement() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let pubkey1 = BytesN::from_array(&env, &[1u8; 32]);
        let pubkey2 = BytesN::from_array(&env, &[2u8; 32]);
        let hash = BytesN::from_array(&env, &[7u8; 32]);

        client.start_session(&user, &pubkey1, &hash, &1000u32, &dummy_proof(&env));
        assert_eq!(client.get_agent_pubkey(&user), Some(pubkey1));

        client.start_session(&user, &pubkey2, &hash, &2000u32, &dummy_proof(&env));
        assert_eq!(client.get_agent_pubkey(&user), Some(pubkey2));
    }

    #[test]
    fn test_invalidation() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let agent_pubkey = BytesN::from_array(&env, &[42u8; 32]);
        let hash = BytesN::from_array(&env, &[7u8; 32]);

        client.start_session(&user, &agent_pubkey, &hash, &1000u32, &dummy_proof(&env));
        assert!(client.is_session_valid(&user));

        client.invalidate_session(&user);
        assert!(!client.is_session_valid(&user));
        assert_eq!(client.get_agent_pubkey(&user), None);
    }

    #[test]
    fn test_is_session_valid_false_after_expiry() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let agent_pubkey = BytesN::from_array(&env, &[42u8; 32]);
        let hash = BytesN::from_array(&env, &[7u8; 32]);

        client.start_session(&user, &agent_pubkey, &hash, &MIN_SESSION_LEDGERS, &dummy_proof(&env));

        // Still valid
        env.ledger().set_sequence_number(env.ledger().sequence() + MIN_SESSION_LEDGERS - 1);
        assert!(client.is_session_valid(&user));

        // Now expired
        env.ledger().set_sequence_number(env.ledger().sequence() + 1);
        assert!(!client.is_session_valid(&user));
    }

    #[test]
    #[should_panic(expected = "InvalidSessionDuration")]
    fn test_invalid_session_duration_too_short() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.start_session(
            &user,
            &BytesN::from_array(&env, &[1u8; 32]),
            &BytesN::from_array(&env, &[1u8; 32]),
            &100u32,
            &dummy_proof(&env),
        );
    }

    #[test]
    #[should_panic(expected = "InvalidSessionDuration")]
    fn test_invalid_session_duration_too_long() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.start_session(
            &user,
            &BytesN::from_array(&env, &[1u8; 32]),
            &BytesN::from_array(&env, &[1u8; 32]),
            &20000u32,
            &dummy_proof(&env),
        );
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_double_initialize() {
        let (env, client, admin) = setup();
        client.initialize(&admin, &dummy_vk(&env));
    }
}
