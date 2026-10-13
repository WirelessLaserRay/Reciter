/**
 * 本地设备特征敏感凭据加密与解密模块 (AES-256-GCM)
 * - 针对本地存储的 API Key、Token 等高敏感凭据实施透明加密
 * - 密文格式：enc:v1:<base64(iv + ciphertext + tag)>
 * - 对旧版明文具备 100% 向下向前兼容，解密异常具备安全兜底
 */

export const ENCRYPTED_PREFIX = "enc:v1:";
const SALT_STORAGE_KEY = "reciter_device_crypto_salt";
let cachedCryptoKey: CryptoKey | null = null;
let memorySaltFallback: string | null = null;

/** 判断某个设置键是否属于应加密的高敏感凭据 */
export function isSensitiveSettingKey(key: string): boolean {
  if (key === "ai_api_key" || key === "deepl_api_key" || key === "sync_token") {
    return true;
  }
  if (key.endsWith("_api_key") || key.endsWith("_token") || key.endsWith("_secret")) {
    return true;
  }
  return false;
}

/** 判断字符串是否已经是加密后的密文格式 */
export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

function getOrGenerateDeviceSalt(): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      let salt = window.localStorage.getItem(SALT_STORAGE_KEY);
      if (!salt) {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        salt = Array.from(arr)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        window.localStorage.setItem(SALT_STORAGE_KEY, salt);
      }
      return salt;
    }
  } catch {}

  if (!memorySaltFallback) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    memorySaltFallback = Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return memorySaltFallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getDeviceDerivedKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) return cachedCryptoKey;

  const salt = getOrGenerateDeviceSalt();
  const passphrase = `reciter-device-vault-${salt.slice(0, 16)}`;
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  cachedCryptoKey = derivedKey;
  return derivedKey;
}

/**
 * 加密敏感字符串（AES-256-GCM）
 * 若传入为空或已经是密文，则原样返回
 */
export async function encryptSensitiveValue(plainText: string): Promise<string> {
  if (!plainText || !plainText.trim() || isEncryptedValue(plainText)) {
    return plainText;
  }

  try {
    const key = await getDeviceDerivedKey();
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plainText);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedData
    );

    // 拼接 IV (12 字节) + CiphertextWithTag
    const ciphertextBytes = new Uint8Array(ciphertextBuffer);
    const combined = new Uint8Array(iv.length + ciphertextBytes.length);
    combined.set(iv, 0);
    combined.set(ciphertextBytes, iv.length);

    return `${ENCRYPTED_PREFIX}${bytesToBase64(combined)}`;
  } catch (e) {
    console.error("加密敏感凭据失败:", e);
    return plainText; // 异常兜底，避免业务中断
  }
}

/**
 * 解密敏感字符串（AES-256-GCM）
 * 若非密文格式（旧版明文）或为空，则原样返回明文
 */
export async function decryptSensitiveValue(cipherText: string): Promise<string> {
  if (!cipherText || !isEncryptedValue(cipherText)) {
    return cipherText;
  }

  try {
    const key = await getDeviceDerivedKey();
    const rawPayload = cipherText.slice(ENCRYPTED_PREFIX.length);
    const combined = base64ToBytes(rawPayload);

    if (combined.length <= 12) {
      throw new Error("密文长度非法");
    }

    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (e) {
    console.error("解密敏感凭据失败:", e);
    return ""; // 解密失败保护，避免泄漏非法密文给请求头
  }
}
