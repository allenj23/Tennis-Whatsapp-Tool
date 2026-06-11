/**
 * AES-256-GCM encryption for local data files (key derived per machine/user).
 */

const crypto = require('crypto');
const os     = require('os');

function deriveKey(salt) {
  const material = `${os.hostname()}|${os.userInfo().username}|${process.cwd()}`;
  return crypto.scryptSync(salt, material, 32);
}

function encrypt(salt, obj) {
  const key    = deriveKey(salt);
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return {
    v:    1,
    iv:   iv.toString('base64'),
    tag:  cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  };
}

function decrypt(salt, blob) {
  const key      = deriveKey(salt);
  const iv       = Buffer.from(blob.iv, 'base64');
  const tag      = Buffer.from(blob.tag, 'base64');
  const data     = Buffer.from(blob.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

module.exports = { encrypt, decrypt };
