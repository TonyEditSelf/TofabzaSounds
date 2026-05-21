'use server';
import 'server-only';

import crypto from 'crypto';

// =============================================================
// /lib/encryption/index.js
// AES-256-GCM envelope encryption for stored API keys.
//
// Master key: ENCRYPTION_KEY env var (32 bytes hex = 64 hex chars).
// Never stored in DB. Never logged. Never exposed to client.
//
// Envelope format (stored in DB as single string):
//   {iv_hex}:{authTag_hex}:{ciphertext_hex}
//
// Key rotation: see /docs/ENCRYPTION-KEY-ROTATION.md
// =============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV — recommended for GCM

/**
 * Derives the 32-byte encryption key from the ENCRYPTION_KEY env var.
 * Throws clearly if the env var is missing or wrong length.
 * @returns {Buffer} 32-byte key buffer
 */
function getMasterKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY env var is not set. ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes). ` +
      `Got ${raw.length} characters.`
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Each call generates a fresh random IV.
 *
 * @param {string} plaintext - The value to encrypt (e.g. an API key)
 * @returns {string} Envelope string: "{iv_hex}:{authTag_hex}:{ciphertext_hex}"
 */
export function encryptValue(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptValue: plaintext must be a non-empty string');
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext.toString('hex'),
  ].join(':');
}

/**
 * Decrypts an envelope string produced by encryptValue().
 * Throws on any tampering (GCM auth tag mismatch).
 *
 * IMPORTANT: Every call to this function should be followed by
 * an audit_log INSERT. The caller is responsible for logging.
 *
 * @param {string} envelope - "{iv_hex}:{authTag_hex}:{ciphertext_hex}"
 * @returns {string} The original plaintext
 */
export function decryptValue(envelope) {
  if (typeof envelope !== 'string') {
    throw new Error('decryptValue: envelope must be a string');
  }

  const parts = envelope.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'decryptValue: invalid envelope format. Expected "iv:authTag:ciphertext"'
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext;
  try {
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // GCM auth tag mismatch = data was tampered with, or wrong key
    throw new Error(
      'decryptValue: decryption failed — data may be corrupted or the key has changed'
    );
  }

  return plaintext;
}

/**
 * Returns a masked display version of an API key for UI display.
 * Never shows more than 8 characters.
 *
 * @param {string} plaintext - The decrypted API key
 * @returns {string} e.g. "sk-...a8f2" or "****...a8f2"
 */
export function maskApiKey(plaintext) {
  if (!plaintext || plaintext.length < 8) return '****';
  const prefix = plaintext.startsWith('sk-') ? 'sk-...' : '****...';
  const suffix = plaintext.slice(-4);
  return `${prefix}${suffix}`;
}

/**
 * Generates a new secure ENCRYPTION_KEY value.
 * Run once: node -e "require('./lib/encryption').generateKey()"
 * Store the output as ENCRYPTION_KEY in your environment.
 * NEVER commit to git.
 */
export function generateKey() {
  const key = crypto.randomBytes(32).toString('hex');
  console.log('Generated ENCRYPTION_KEY:');
  console.log(key);
  console.log('\nStore this in your environment as ENCRYPTION_KEY.');
  console.log('Back it up securely. Losing it means losing all stored API keys.');
  return key;
}
