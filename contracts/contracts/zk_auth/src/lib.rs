#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, 
    Env, Vec, Val, Bytes, BytesN,
    crypto::CryptoHazmat // <--- REQUIRED: Imports the trait so methods are visible
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Commitment,
}

#[contract]
pub struct ZKAuth;

#[contractimpl]
impl ZKAuth {
    pub fn commit_agent(env: Env, secret_elements: Vec<Val>) -> BytesN<32> {
        // According to docs.rs/soroban-sdk/latest/soroban_sdk/crypto/struct.CryptoHazmat.html
        // The method is named `poseidon`
        let hash_val: Val = env.crypto().poseidon(&secret_elements);
        
        // Convert the resulting Val to BytesN<32>
        let hash_bytes: BytesN<32> = hash_val.try_into().expect("Hash conversion failed");
        
        env.storage().persistent().set(&DataKey::Commitment, &hash_bytes);
        hash_bytes
    }

    pub fn verify_bn254(env: Env, g1_points: Vec<Bytes>, g2_points: Vec<Bytes>) -> bool {
        // According to docs.rs/soroban-sdk/latest/soroban_sdk/crypto/struct.CryptoHazmat.html
        // The finalized method for BN254 verification is `bn254_multi_pairing_check`
        env.crypto().bn254_multi_pairing_check(&g1_points, &g2_points)
    }
}