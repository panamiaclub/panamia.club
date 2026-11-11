#![forbid(unsafe_code)]

use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::{crypto::OpenMlsCrypto, signatures::Signer, OpenMlsProvider};
use serde::{Deserialize, Serialize as SerdeSerialize};
use std::collections::BTreeMap;
use tls_codec::{Deserialize as TlsDeserialize, Serialize};
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

const SUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
const MAX_IDENTITY_BYTES: usize = 512;
const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_LOCAL_BYTES: usize = 64 * 1024 * 1024;
const PROVIDER_REVISION: &str = "6100df3fb1d8c3eeab53e349fcbd621f98c44fe2";

#[derive(SerdeSerialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LocalState {
    format: u8,
    engine: String,
    provider_revision: String,
    identity: String,
    public_key: Vec<u8>,
    trusted: Vec<(Vec<u8>, Vec<u8>)>,
    rooms: Vec<String>,
    storage: Vec<(Vec<u8>, Vec<u8>)>,
}

#[derive(SerdeSerialize)]
struct MemberInfo {
    identity: String,
    public_key: Vec<u8>,
    index: u32,
}

#[derive(SerdeSerialize)]
struct RoomInfo {
    room: String,
    epoch: String,
    active: bool,
    pending_commit: bool,
    members: Vec<MemberInfo>,
}

#[derive(SerdeSerialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct MembershipFrames {
    commit: Vec<u8>,
    welcome: Option<Vec<u8>>,
}

#[derive(SerdeSerialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LocalProcessResult {
    kind: String,
    sender: String,
    content: Vec<u8>,
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "Cannot encode engine result.".into())
}

fn validate_identity(identity: &str) -> Result<(), String> {
    if identity.is_empty() || identity.len() > MAX_IDENTITY_BYTES {
        return Err("Invalid MLS device identity.".into());
    }
    Ok(())
}

fn check_trusted(
    trusted: &BTreeMap<Vec<u8>, Vec<u8>>,
    credential: &Credential,
    signature_key: &[u8],
) -> Result<(), String> {
    if credential.credential_type() != CredentialType::Basic
        || trusted
            .get(credential.serialized_content())
            .map(Vec::as_slice)
            != Some(signature_key)
    {
        return Err("MLS device credential is not approved.".into());
    }
    Ok(())
}

fn decode_key_package(bytes: &[u8], provider: &OpenMlsRustCrypto) -> Result<KeyPackage, String> {
    if bytes.is_empty() || bytes.len() > MAX_FRAME_BYTES {
        return Err("Invalid MLS key package size.".into());
    }
    let input =
        KeyPackageIn::tls_deserialize_exact(bytes).map_err(|_| "Malformed MLS key package.")?;
    let key_package = input
        .validate(provider.crypto(), ProtocolVersion::Mls10)
        .map_err(|_| "Invalid MLS key package signature or lifetime.")?;
    if key_package.ciphersuite() != SUITE {
        return Err("Unsupported MLS cipher suite.".into());
    }
    Ok(key_package)
}

fn statement_message(purpose: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
    if !matches!(
        purpose,
        "enrollment"
            | "device-certificate"
            | "device-revocation"
            | "device-request"
            | "room-intent"
            | "identity-reset"
            | "identity-backup"
            | "profile-activation"
    ) || payload.is_empty()
        || payload.len() > 16 * 1024
    {
        return Err("Invalid signing purpose or statement size.".into());
    }
    let mut message = format!("PANA-CHAT/1/{purpose}\0").into_bytes();
    message.extend_from_slice(payload);
    Ok(message)
}

/// Separate profile authorization key. Never reuse an ActivityPub or live MLS
/// ratchet as recovery material.
#[wasm_bindgen]
pub struct ProfileSigningKey {
    provider: OpenMlsRustCrypto,
    private: Vec<u8>,
    public: Vec<u8>,
}

impl Drop for ProfileSigningKey {
    fn drop(&mut self) {
        self.private.zeroize();
    }
}

#[wasm_bindgen]
impl ProfileSigningKey {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<ProfileSigningKey, String> {
        let provider = OpenMlsRustCrypto::default();
        let (mut private, public) = provider
            .crypto()
            .signature_key_gen(SUITE.signature_algorithm())
            .map_err(|_| "Cannot generate a profile authorization key.")?;
        if private.len() != 32 || public.len() != 32 {
            private.zeroize();
            return Err("Unsupported profile authorization key encoding.".into());
        }
        Ok(Self {
            provider,
            private,
            public,
        })
    }

    #[wasm_bindgen(js_name = publicKey)]
    pub fn public_key(&self) -> Vec<u8> {
        self.public.clone()
    }

    #[wasm_bindgen(js_name = verifyStatement)]
    pub fn verify_statement(
        purpose: &str,
        payload: &[u8],
        public_key: &[u8],
        signature: &[u8],
    ) -> Result<bool, String> {
        if public_key.len() != 32 || signature.len() != 64 {
            return Err("Invalid statement verification key or signature.".into());
        }
        let message = statement_message(purpose, payload)?;
        Ok(OpenMlsRustCrypto::default()
            .crypto()
            .verify_signature(SUITE.signature_algorithm(), &message, public_key, signature)
            .is_ok())
    }

    #[wasm_bindgen(js_name = signStatement)]
    pub fn sign_statement(&self, purpose: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
        if !matches!(
            purpose,
            "device-certificate"
                | "device-revocation"
                | "identity-reset"
                | "identity-backup"
                | "profile-activation"
        ) {
            return Err("This statement requires an enrolled device key.".into());
        }
        self.provider
            .crypto()
            .sign(
                SUITE.signature_algorithm(),
                &statement_message(purpose, payload)?,
                &self.private,
            )
            .map_err(|_| "Cannot sign the profile statement.".into())
    }

    /// Portable Ed25519 seed || public key, only for authenticated local
    /// wrapping or a user-key-protected identity backup; never a server field.
    #[wasm_bindgen(js_name = exportSecret)]
    pub fn export_secret(&self) -> Vec<u8> {
        [self.private.as_slice(), self.public.as_slice()].concat()
    }

    #[wasm_bindgen(js_name = restoreSecret)]
    pub fn restore_secret(bytes: &[u8]) -> Result<ProfileSigningKey, String> {
        if bytes.len() != 64 {
            return Err("Invalid profile authorization key material.".into());
        }
        let key = Self {
            provider: OpenMlsRustCrypto::default(),
            private: bytes[..32].to_vec(),
            public: bytes[32..].to_vec(),
        };
        let message = statement_message("identity-reset", b"key-binding-check")?;
        let signature = key
            .provider
            .crypto()
            .sign(SUITE.signature_algorithm(), &message, &key.private)
            .map_err(|_| "Invalid profile signing key.")?;
        key.provider
            .crypto()
            .verify_signature(
                SUITE.signature_algorithm(),
                &message,
                &key.public,
                &signature,
            )
            .map_err(|_| "Profile private and public keys do not match.")?;
        Ok(key)
    }
}

/// Client-only state. It must not be instantiated by a server message handler.
#[wasm_bindgen]
pub struct MlsDevice {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    identity: String,
    groups: BTreeMap<String, MlsGroup>,
    trusted: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl Drop for MlsDevice {
    fn drop(&mut self) {
        self.groups.clear();
        if let Ok(mut values) = self.provider.storage().values.write() {
            for value in values.values_mut() {
                value.zeroize();
            }
            values.clear();
        }
    }
}

#[wasm_bindgen]
impl MlsDevice {
    #[wasm_bindgen(constructor)]
    pub fn new(identity: &str) -> Result<MlsDevice, String> {
        validate_identity(identity)?;
        let provider = OpenMlsRustCrypto::default();
        let signer = SignatureKeyPair::new(SUITE.signature_algorithm())
            .map_err(|_| "Cannot generate device signing keys.")?;
        signer
            .store(provider.storage())
            .map_err(|_| "Cannot persist device signing keys.")?;
        let mut trusted = BTreeMap::new();
        trusted.insert(identity.as_bytes().to_vec(), signer.to_public_vec());
        Ok(Self {
            provider,
            signer,
            identity: identity.to_owned(),
            groups: BTreeMap::new(),
            trusted,
        })
    }

    #[wasm_bindgen(js_name = publicKey)]
    pub fn public_key(&self) -> Vec<u8> {
        self.signer.to_public_vec()
    }

    #[wasm_bindgen(js_name = deviceIdentity)]
    pub fn device_identity(&self) -> String {
        self.identity.clone()
    }

    #[wasm_bindgen(js_name = signStatement)]
    pub fn sign_statement(&self, purpose: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
        if !matches!(purpose, "enrollment" | "device-request" | "room-intent") {
            return Err("This statement requires the profile authorization key.".into());
        }
        self.signer
            .sign(&statement_message(purpose, payload)?)
            .map_err(|_| "Cannot sign the device statement.".into())
    }

    /// Application identity approval is deliberately separate from MLS parsing.
    /// P1 callers use synthetic pinned identities; P2 supplies verified credentials.
    #[wasm_bindgen(js_name = approveIdentity)]
    pub fn approve_identity(&mut self, identity: &str, public_key: &[u8]) -> Result<(), String> {
        validate_identity(identity)?;
        if public_key.len() != 32 {
            return Err("Invalid device signing public key.".into());
        }
        if self
            .trusted
            .get(identity.as_bytes())
            .is_some_and(|previous| previous.as_slice() != public_key)
        {
            return Err("An approved device key cannot be silently replaced.".into());
        }
        if self.trusted.iter().any(|(other, key)| {
            other.as_slice() != identity.as_bytes() && key.as_slice() == public_key
        }) {
            return Err("One signing key cannot identify two devices.".into());
        }
        self.trusted
            .insert(identity.as_bytes().to_vec(), public_key.to_vec());
        Ok(())
    }

    #[wasm_bindgen(js_name = keyPackage)]
    pub fn key_package(&self) -> Result<Vec<u8>, String> {
        let credential = CredentialWithKey {
            credential: BasicCredential::new(self.identity.as_bytes().to_vec()).into(),
            signature_key: self.signer.to_public_vec().into(),
        };
        KeyPackage::builder()
            .build(SUITE, &self.provider, &self.signer, credential)
            .map_err(|_| "Cannot generate an MLS key package.")?
            .key_package()
            .tls_serialize_detached()
            .map_err(|_| "Cannot encode an MLS key package.".into())
    }

    #[wasm_bindgen(js_name = createRoom)]
    pub fn create_room(&mut self, room: &str) -> Result<(), String> {
        if room.is_empty() || room.len() > 128 || self.groups.contains_key(room) {
            return Err("Invalid or already-created MLS room.".into());
        }
        let credential = CredentialWithKey {
            credential: BasicCredential::new(self.identity.as_bytes().to_vec()).into(),
            signature_key: self.signer.to_public_vec().into(),
        };
        let config = MlsGroupCreateConfig::builder()
            .ciphersuite(SUITE)
            .use_ratchet_tree_extension(true)
            .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
            .build();
        let group = MlsGroup::new_with_group_id(
            &self.provider,
            &self.signer,
            &config,
            GroupId::from_slice(room.as_bytes()),
            credential,
        )
        .map_err(|_| "Cannot create an encrypted room.")?;
        self.groups.insert(room.to_owned(), group);
        Ok(())
    }

    #[wasm_bindgen(js_name = describeKeyPackage)]
    pub fn describe_key_package(bytes: &[u8]) -> Result<String, String> {
        let package = decode_key_package(bytes, &OpenMlsRustCrypto::default())?;
        let identity = String::from_utf8(
            package
                .leaf_node()
                .credential()
                .serialized_content()
                .to_vec(),
        )
        .map_err(|_| "Unsupported device identity encoding.")?;
        validate_identity(&identity)?;
        json(&MemberInfo {
            identity,
            public_key: package.leaf_node().signature_key().as_slice().to_vec(),
            index: 0,
        })
    }

    #[wasm_bindgen(js_name = addMember)]
    pub fn add_member(&mut self, room: &str, package: &[u8]) -> Result<String, String> {
        let package = decode_key_package(package, &self.provider)?;
        check_trusted(
            &self.trusted,
            package.leaf_node().credential(),
            package.leaf_node().signature_key().as_slice(),
        )?;
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_some() {
            return Err("A membership commit is already awaiting acknowledgement.".into());
        }
        let (commit, welcome, _) = group
            .add_members(&self.provider, &self.signer, &[package])
            .map_err(|_| "Cannot stage the MLS member addition.")?;
        json(&MembershipFrames {
            commit: commit
                .tls_serialize_detached()
                .map_err(|_| "Cannot encode the MLS commit.")?,
            welcome: Some(
                welcome
                    .tls_serialize_detached()
                    .map_err(|_| "Cannot encode the MLS invitation.")?,
            ),
        })
    }

    #[wasm_bindgen(js_name = removeMember)]
    pub fn remove_member(&mut self, room: &str, identity: &str) -> Result<String, String> {
        if identity == self.identity {
            return Err("Use another authorized member to remove this device.".into());
        }
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_some() {
            return Err("A membership commit is already awaiting acknowledgement.".into());
        }
        let index = group
            .members()
            .find(|member| member.credential.serialized_content() == identity.as_bytes())
            .map(|member| member.index)
            .ok_or("Device is not a member of this room.")?;
        let (commit, welcome, _) = group
            .remove_members(&self.provider, &self.signer, &[index])
            .map_err(|_| "Cannot stage the MLS member removal.")?;
        json(&MembershipFrames {
            commit: commit
                .tls_serialize_detached()
                .map_err(|_| "Cannot encode the MLS commit.")?,
            welcome: welcome
                .map(|message| message.tls_serialize_detached())
                .transpose()
                .map_err(|_| "Cannot encode the MLS invitation.")?,
        })
    }

    /// Call only after the delivery service confirms this exact pending commit.
    #[wasm_bindgen(js_name = acknowledgeCommit)]
    pub fn acknowledge_commit(&mut self, room: &str) -> Result<(), String> {
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_none() {
            return Err("No pending MLS commit to acknowledge.".into());
        }
        group
            .merge_pending_commit(&self.provider)
            .map_err(|_| "Cannot accept the acknowledged MLS commit.".into())
    }

    /// Only after explicit rejection of this attempt, never on a network timeout.
    #[wasm_bindgen(js_name = discardRejectedCommit)]
    pub fn discard_rejected_commit(&mut self, room: &str) -> Result<(), String> {
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_none() {
            return Err("No pending MLS commit to discard.".into());
        }
        group
            .clear_pending_commit(self.provider.storage())
            .map_err(|_| "Cannot discard the rejected MLS commit.".into())
    }

    #[wasm_bindgen(js_name = joinRoom)]
    pub fn join_room(&mut self, room: &str, welcome: &[u8]) -> Result<(), String> {
        if room.is_empty() || room.len() > 128 || self.groups.contains_key(room) {
            return Err("Invalid or already-joined MLS room.".into());
        }
        if welcome.is_empty() || welcome.len() > MAX_FRAME_BYTES {
            return Err("Invalid MLS invitation size.".into());
        }
        let message = MlsMessageIn::tls_deserialize_exact(welcome)
            .map_err(|_| "Malformed MLS invitation.")?;
        let welcome = match message.extract() {
            MlsMessageBodyIn::Welcome(welcome) => welcome,
            _ => return Err("Expected an MLS invitation.".into()),
        };
        let config = MlsGroupJoinConfig::builder()
            .use_ratchet_tree_extension(true)
            .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
            .build();
        let staged = StagedWelcome::new_from_welcome(&self.provider, &config, welcome, None)
            .map_err(|_| "Cannot decrypt or validate the MLS invitation.")?;
        for member in staged.members() {
            check_trusted(&self.trusted, &member.credential, &member.signature_key)?;
        }
        let mut group = staged
            .into_group(&self.provider)
            .map_err(|_| "Cannot persist the joined MLS room.")?;
        if group.group_id().as_slice() != room.as_bytes() {
            group
                .delete(self.provider.storage())
                .map_err(|_| "Cannot discard the mismatched MLS room.")?;
            return Err("MLS invitation belongs to another room.".into());
        }
        self.groups.insert(room.to_owned(), group);
        Ok(())
    }

    #[wasm_bindgen(js_name = encryptMessage)]
    pub fn encrypt_message(&mut self, room: &str, content: &[u8]) -> Result<Vec<u8>, String> {
        if content.is_empty() || content.len() > MAX_FRAME_BYTES / 2 {
            return Err("Invalid encrypted-message payload size.".into());
        }
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_some() {
            return Err("Cannot send while a membership commit is pending.".into());
        }
        group
            .create_message(&self.provider, &self.signer, content)
            .map_err(|_| "Cannot encrypt: room is inactive or its commit is pending.")?
            .tls_serialize_detached()
            .map_err(|_| "Cannot encode the encrypted message.".into())
    }

    #[wasm_bindgen(js_name = processMessage)]
    pub fn process_message(&mut self, room: &str, frame: &[u8]) -> Result<String, String> {
        if frame.is_empty() || frame.len() > MAX_FRAME_BYTES {
            return Err("Invalid MLS frame size.".into());
        }
        let message =
            MlsMessageIn::tls_deserialize_exact(frame).map_err(|_| "Malformed MLS frame.")?;
        let message = match message.extract() {
            MlsMessageBodyIn::PrivateMessage(private) => private,
            _ => return Err("Only private MLS frames are accepted.".into()),
        };
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        let processed = group
            .process_message(&self.provider, message)
            .map_err(|_| {
                "MLS frame was rejected: wrong room, epoch, signature, replay or ciphertext."
            })?;
        let sender = String::from_utf8(processed.credential().serialized_content().to_vec())
            .map_err(|_| "Unsupported sender identity.")?;
        let result = match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(message) => LocalProcessResult {
                kind: "message".into(),
                sender,
                content: message.into_bytes(),
            },
            ProcessedMessageContent::StagedCommitMessage(staged) => {
                if let Some(leaf) = staged.update_path_leaf_node() {
                    check_trusted(
                        &self.trusted,
                        leaf.credential(),
                        leaf.signature_key().as_slice(),
                    )?;
                }
                for proposal in staged.queued_proposals() {
                    match proposal.proposal() {
                        Proposal::Add(add) => {
                            let leaf = add.key_package().leaf_node();
                            check_trusted(
                                &self.trusted,
                                leaf.credential(),
                                leaf.signature_key().as_slice(),
                            )?;
                        }
                        Proposal::Update(update) => {
                            let leaf = update.leaf_node();
                            check_trusted(
                                &self.trusted,
                                leaf.credential(),
                                leaf.signature_key().as_slice(),
                            )?;
                        }
                        Proposal::Remove(_) => {}
                        _ => return Err("Unsupported MLS membership proposal.".into()),
                    }
                }
                group
                    .merge_staged_commit(&self.provider, *staged)
                    .map_err(|_| "Cannot apply the approved MLS commit.")?;
                LocalProcessResult {
                    kind: "commit".into(),
                    sender,
                    content: vec![],
                }
            }
            ProcessedMessageContent::OwnPendingCommit => {
                return Err("Confirm an own pending commit through acknowledgeCommit.".into());
            }
            ProcessedMessageContent::OwnPrivateMessage => {
                return Err("Own echo is not an authenticated incoming message.".into());
            }
            _ => return Err("Standalone MLS proposals are not accepted.".into()),
        };
        json(&result)
    }

    #[wasm_bindgen(js_name = roomInfo)]
    pub fn room_info(&self, room: &str) -> Result<String, String> {
        let group = self.groups.get(room).ok_or("Unknown encrypted room.")?;
        let members = group
            .members()
            .map(|member| {
                Ok(MemberInfo {
                    identity: String::from_utf8(member.credential.serialized_content().to_vec())
                        .map_err(|_| "Unsupported member identity.")?,
                    public_key: member.signature_key,
                    index: member.index.u32(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        json(&RoomInfo {
            room: room.to_owned(),
            epoch: group.epoch().as_u64().to_string(),
            active: group.is_active(),
            pending_commit: group.pending_commit().is_some(),
            members,
        })
    }

    /// Only after an explicit leave or a verified newer Welcome. The caller
    /// preserves retained history separately and never rolls this ratchet back.
    #[wasm_bindgen(js_name = discardRoom)]
    pub fn discard_room(&mut self, room: &str, expected_epoch: &str) -> Result<(), String> {
        let group = self.groups.get_mut(room).ok_or("Unknown encrypted room.")?;
        if group.pending_commit().is_some() || group.epoch().as_u64().to_string() != expected_epoch
        {
            return Err("Resolve the exact current room state before discarding live keys.".into());
        }
        group
            .delete(self.provider.storage())
            .map_err(|_| "Cannot discard the old room state.")?;
        self.groups.remove(room);
        Ok(())
    }

    /// Raw local secrets, never a cloud-backup or delivery format. The caller
    /// must atomically encrypt these bytes with its device-local wrapping key.
    #[wasm_bindgen(js_name = snapshotLocal)]
    pub fn snapshot_local(&self) -> Result<Vec<u8>, String> {
        let storage = self
            .provider
            .storage()
            .values
            .read()
            .map_err(|_| "Device storage lock is poisoned.")?
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        let mut state = LocalState {
            format: 2,
            engine: "openmls-0.9.2".into(),
            provider_revision: PROVIDER_REVISION.into(),
            identity: self.identity.clone(),
            public_key: self.signer.to_public_vec(),
            trusted: self
                .trusted
                .iter()
                .map(|(id, key)| (id.clone(), key.clone()))
                .collect(),
            rooms: self.groups.keys().cloned().collect(),
            storage,
        };
        let encoded = serde_json::to_vec(&state);
        for (_, value) in &mut state.storage {
            value.zeroize();
        }
        let result = encoded.map_err(|_| "Cannot encode local MLS state.")?;
        if result.len() > MAX_LOCAL_BYTES {
            return Err("Local MLS state exceeds its storage limit.".into());
        }
        Ok(result)
    }

    /// Only call after authenticated local unwrapping and profile-context checks.
    #[wasm_bindgen(js_name = restoreLocal)]
    pub fn restore_local(bytes: &[u8]) -> Result<MlsDevice, String> {
        if bytes.is_empty() || bytes.len() > MAX_LOCAL_BYTES {
            return Err("Invalid local MLS state size.".into());
        }
        let state: LocalState =
            serde_json::from_slice(bytes).map_err(|_| "Malformed local MLS state.")?;
        if state.format != 2
            || state.engine != "openmls-0.9.2"
            || state.provider_revision != PROVIDER_REVISION
            || state.public_key.len() != 32
        {
            return Err("Unsupported local MLS state version.".into());
        }
        validate_identity(&state.identity)?;
        let provider = OpenMlsRustCrypto::default();
        {
            let mut store = provider
                .storage()
                .values
                .write()
                .map_err(|_| "Cannot restore device storage.")?;
            for (key, value) in state.storage {
                if store.insert(key, value).is_some() {
                    return Err("Duplicate local MLS storage entry.".into());
                }
            }
        }
        let signer = SignatureKeyPair::read(
            provider.storage(),
            &state.public_key,
            SUITE.signature_algorithm(),
        )
        .ok_or("Local device signing key is missing.")?;
        let mut client = Self {
            provider,
            signer,
            identity: state.identity,
            groups: BTreeMap::new(),
            trusted: BTreeMap::new(),
        };
        for (identity, public_key) in state.trusted {
            let identity =
                String::from_utf8(identity).map_err(|_| "Invalid saved device identity.")?;
            client.approve_identity(&identity, &public_key)?;
        }
        check_trusted(
            &client.trusted,
            &BasicCredential::new(client.identity.as_bytes().to_vec()).into(),
            &state.public_key,
        )?;
        for room in state.rooms {
            if room.is_empty() || room.len() > 128 || client.groups.contains_key(&room) {
                return Err("Invalid saved MLS room identifier.".into());
            }
            let group = MlsGroup::load(
                client.provider.storage(),
                &GroupId::from_slice(room.as_bytes()),
            )
            .map_err(|_| "Cannot decode saved MLS room.")?
            .ok_or("Saved MLS room state is missing.")?;
            if group.ciphersuite() != SUITE {
                return Err("Saved MLS room has an unsupported cipher suite.".into());
            }
            for member in group.members() {
                check_trusted(&client.trusted, &member.credential, &member.signature_key)?;
            }
            client.groups.insert(room, group);
        }
        Ok(client)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_a_device_key_package_and_room() {
        let pins: serde_json::Value =
            serde_json::from_str(include_str!("../engine-lock.json")).unwrap();
        assert_eq!(pins["providerRevision"], PROVIDER_REVISION);
        let mut client = MlsDevice::new("synthetic-profile/device-a").unwrap();
        assert_eq!(client.public_key().len(), 32);
        assert!(!client.key_package().unwrap().is_empty());
        client.create_room("synthetic-room").unwrap();
        assert!(client.create_room("synthetic-room").is_err());
    }

    #[test]
    fn profile_authorization_recovery_is_separate_from_live_device_state() {
        let root = ProfileSigningKey::new().unwrap();
        let mut secret = root.export_secret();
        let recovered = ProfileSigningKey::restore_secret(&secret).unwrap();
        assert_eq!(root.public_key(), recovered.public_key());
        assert_eq!(
            root.sign_statement("device-certificate", b"certificate")
                .unwrap(),
            recovered
                .sign_statement("device-certificate", b"certificate")
                .unwrap()
        );
        assert!(root.sign_statement("device-request", b"request").is_err());
        secret[63] ^= 1;
        assert!(ProfileSigningKey::restore_secret(&secret).is_err());
        secret.zeroize();
        let device = MlsDevice::new("new-device").unwrap();
        assert_ne!(root.public_key(), device.public_key());
        assert!(device.sign_statement("device-request", b"request").is_ok());
        assert!(device
            .sign_statement("device-certificate", b"certificate")
            .is_err());
    }

    #[test]
    fn statement_verification_uses_the_pinned_provider_without_platform_ed25519() {
        let root = ProfileSigningKey::new().unwrap();
        let payload = b"exact profile certificate";
        let signature = root.sign_statement("device-certificate", payload).unwrap();
        assert!(ProfileSigningKey::verify_statement(
            "device-certificate",
            payload,
            &root.public_key(),
            &signature
        )
        .unwrap());
        assert!(!ProfileSigningKey::verify_statement(
            "enrollment",
            payload,
            &root.public_key(),
            &signature
        )
        .unwrap());
        assert!(!ProfileSigningKey::verify_statement(
            "device-certificate",
            b"changed",
            &root.public_key(),
            &signature
        )
        .unwrap());
        assert!(!ProfileSigningKey::verify_statement(
            "device-certificate",
            payload,
            &ProfileSigningKey::new().unwrap().public_key(),
            &signature
        )
        .unwrap());
        assert!(ProfileSigningKey::verify_statement(
            "device-certificate",
            payload,
            &[0; 31],
            &signature
        )
        .is_err());
    }

    fn approve(a: &mut MlsDevice, b: &MlsDevice) {
        a.approve_identity(&b.identity, &b.public_key()).unwrap();
    }

    fn invitation(value: String) -> MembershipFrames {
        serde_json::from_str(&value).unwrap()
    }

    fn pair() -> (MlsDevice, MlsDevice) {
        let mut alice = MlsDevice::new("alice/device-1").unwrap();
        let mut bob = MlsDevice::new("bob/device-2").unwrap();
        approve(&mut alice, &bob);
        approve(&mut bob, &alice);
        alice.create_room("room").unwrap();
        let frames = invitation(
            alice
                .add_member("room", &bob.key_package().unwrap())
                .unwrap(),
        );
        alice.acknowledge_commit("room").unwrap();
        bob.join_room("room", &frames.welcome.unwrap()).unwrap();
        (alice, bob)
    }

    #[test]
    fn messages_are_private_authenticated_and_bidirectional() {
        let (mut alice, mut bob) = pair();
        let frame = alice.encrypt_message("room", b"private text").unwrap();
        assert!(!frame.windows(12).any(|window| window == b"private text"));
        let result: LocalProcessResult =
            serde_json::from_str(&bob.process_message("room", &frame).unwrap()).unwrap();
        assert_eq!(result.content, b"private text");
        assert_eq!(result.sender, "alice/device-1");
        let response = bob.encrypt_message("room", b"response").unwrap();
        assert!(alice.process_message("room", &response).is_ok());
    }

    #[test]
    fn a_joined_member_can_invite_a_fresh_device_after_the_founder_is_removed() {
        let (_alice, mut bob) = pair();
        let removal = bob.remove_member("room", "alice/device-1").unwrap();
        assert!(serde_json::from_str::<MembershipFrames>(&removal).is_ok());
        bob.acknowledge_commit("room").unwrap();
        let mut bob = MlsDevice::restore_local(&bob.snapshot_local().unwrap()).unwrap();
        let mut replacement = MlsDevice::new("alice/device-fresh").unwrap();
        approve(&mut bob, &replacement);
        approve(&mut replacement, &bob);
        let frames = invitation(
            bob.add_member("room", &replacement.key_package().unwrap())
                .unwrap(),
        );
        bob.acknowledge_commit("room").unwrap();
        replacement
            .join_room("room", &frames.welcome.unwrap())
            .unwrap();
        let message = bob.encrypt_message("room", b"new invitation").unwrap();
        assert!(replacement.process_message("room", &message).is_ok());
    }

    #[test]
    fn unknown_credentials_cannot_join_or_be_added() {
        let mut alice = MlsDevice::new("alice").unwrap();
        let mut bob = MlsDevice::new("bob").unwrap();
        alice.create_room("room").unwrap();
        assert!(alice
            .add_member("room", &bob.key_package().unwrap())
            .is_err());
        approve(&mut alice, &bob);
        let frames = invitation(
            alice
                .add_member("room", &bob.key_package().unwrap())
                .unwrap(),
        );
        assert!(alice.encrypt_message("room", b"pending commit").is_err());
        alice.acknowledge_commit("room").unwrap();
        assert!(bob
            .join_room("room", frames.welcome.as_ref().unwrap())
            .is_err());
    }

    #[test]
    fn joining_does_not_grant_history_and_removal_stops_future_decryption() {
        let (mut alice, mut bob) = pair();
        let old = alice.encrypt_message("room", b"before carol").unwrap();
        bob.process_message("room", &old).unwrap();
        let mut carol = MlsDevice::new("carol").unwrap();
        approve(&mut alice, &carol);
        approve(&mut bob, &carol);
        approve(&mut carol, &alice);
        approve(&mut carol, &bob);
        let frames = invitation(
            alice
                .add_member("room", &carol.key_package().unwrap())
                .unwrap(),
        );
        alice.acknowledge_commit("room").unwrap();
        bob.process_message("room", &frames.commit).unwrap();
        carol.join_room("room", &frames.welcome.unwrap()).unwrap();
        assert!(carol.process_message("room", &old).is_err());
        let fresh = alice.encrypt_message("room", b"with carol").unwrap();
        carol.process_message("room", &fresh).unwrap();
        bob.process_message("room", &fresh).unwrap();
        let mut stale_bob = MlsDevice::restore_local(&bob.snapshot_local().unwrap()).unwrap();
        let removal = invitation(alice.remove_member("room", "bob/device-2").unwrap());
        alice.acknowledge_commit("room").unwrap();
        carol.process_message("room", &removal.commit).unwrap();
        bob.process_message("room", &removal.commit).unwrap();
        let later = carol.encrypt_message("room", b"not for bob").unwrap();
        assert!(bob.process_message("room", &later).is_err());
        assert!(stale_bob.process_message("room", &later).is_err());
        assert!(bob.encrypt_message("room", b"removed").is_err());
    }

    #[test]
    fn bad_frames_do_not_poison_valid_messages_and_replay_fails() {
        let (mut alice, mut bob) = pair();
        let frame = alice.encrypt_message("room", b"authentic").unwrap();
        let mut tampered = frame.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(bob.process_message("room", &tampered).is_err());
        let mut trailing = frame.clone();
        trailing.push(0);
        assert!(bob.process_message("room", &trailing).is_err());
        bob.process_message("room", &frame).unwrap();
        assert!(bob.process_message("room", &frame).is_err());
        assert!(bob.process_message("room", b"garbage").is_err());
    }

    #[test]
    fn local_reload_keeps_pending_commits_and_ratchets_without_a_new_identity() {
        let (mut alice, mut bob) = pair();
        let first = alice.encrypt_message("room", b"first").unwrap();
        bob.process_message("room", &first).unwrap();
        let snapshot = alice.snapshot_local().unwrap();
        let mut restored = MlsDevice::restore_local(&snapshot).unwrap();
        assert_eq!(alice.public_key(), restored.public_key());
        let next = restored.encrypt_message("room", b"second").unwrap();
        bob.process_message("room", &next).unwrap();
        let new_member = MlsDevice::new("new-member").unwrap();
        approve(&mut restored, &new_member);
        restored
            .add_member("room", &new_member.key_package().unwrap())
            .unwrap();
        let mut restored_pending =
            MlsDevice::restore_local(&restored.snapshot_local().unwrap()).unwrap();
        assert!(restored_pending
            .encrypt_message("room", b"must wait")
            .is_err());
        restored_pending.acknowledge_commit("room").unwrap();
    }

    #[test]
    fn rejecting_a_pending_commit_does_not_rewind_message_keys() {
        let (mut alice, mut bob) = pair();
        let first = alice.encrypt_message("room", b"before rejection").unwrap();
        bob.process_message("room", &first).unwrap();
        let new_member = MlsDevice::new("new-member").unwrap();
        approve(&mut alice, &new_member);
        alice
            .add_member("room", &new_member.key_package().unwrap())
            .unwrap();
        assert!(alice.remove_member("room", "bob/device-2").is_err());
        assert!(alice
            .add_member("room", &new_member.key_package().unwrap())
            .is_err());
        let mut restored = MlsDevice::restore_local(&alice.snapshot_local().unwrap()).unwrap();
        restored.discard_rejected_commit("room").unwrap();
        assert!(restored.discard_rejected_commit("room").is_err());
        assert!(restored.acknowledge_commit("room").is_err());
        let next = restored
            .encrypt_message("room", b"after rejection")
            .unwrap();
        let result: LocalProcessResult =
            serde_json::from_str(&bob.process_message("room", &next).unwrap()).unwrap();
        assert_eq!(result.content, b"after rejection");
        assert!(bob.process_message("room", &first).is_err());
    }

    #[test]
    fn incoming_commits_cannot_install_an_unapproved_identity() {
        let (mut alice, mut bob) = pair();
        let before = bob.room_info("room").unwrap();
        let new_member = MlsDevice::new("unapproved-member").unwrap();
        approve(&mut alice, &new_member);
        let frames = invitation(
            alice
                .add_member("room", &new_member.key_package().unwrap())
                .unwrap(),
        );
        alice.acknowledge_commit("room").unwrap();
        assert!(bob.process_message("room", &frames.commit).is_err());
        assert_eq!(bob.room_info("room").unwrap(), before);
    }

    #[test]
    fn one_time_key_packages_cannot_join_two_rooms() {
        let mut alice = MlsDevice::new("alice").unwrap();
        let mut bob = MlsDevice::new("bob").unwrap();
        approve(&mut alice, &bob);
        approve(&mut bob, &alice);
        let package = bob.key_package().unwrap();
        alice.create_room("first").unwrap();
        alice.create_room("second").unwrap();
        let first = invitation(alice.add_member("first", &package).unwrap());
        let second = invitation(alice.add_member("second", &package).unwrap());
        alice.acknowledge_commit("first").unwrap();
        alice.acknowledge_commit("second").unwrap();
        bob.join_room("first", &first.welcome.unwrap()).unwrap();
        assert!(bob.join_room("second", &second.welcome.unwrap()).is_err());
    }
}
