import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

/** @type {Map<string, { body: Buffer, contentType: string, size: number }>} */
const memoryStore = new Map();

/** @type {S3Client|null} */
let internalClient = null;
/** @type {S3Client|null} */
let signingClient = null;

function isMemory() {
    return env.storageDriver === 'memory';
}

function assertConfigured() {
    if (isMemory()) return;
    if (!env.storageEndpoint || !env.storageAccessKey || !env.storageSecretKey) {
        const err = new Error('Chưa cấu hình lưu trữ (STORAGE_*).');
        err.status = 503;
        throw err;
    }
}

function makeClient(endpoint) {
    return new S3Client({
        region: env.storageRegion || 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: env.storageAccessKey,
            secretAccessKey: env.storageSecretKey
        },
        // SDK v3.729+ mặc định CRC32 — R2/MinIO lệch chữ ký presigned PUT từ browser.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
    });
}

function getInternalClient() {
    assertConfigured();
    if (isMemory()) return null;
    if (!internalClient) {
        internalClient = makeClient(env.storageEndpoint);
    }
    return internalClient;
}

function getSigningClient() {
    assertConfigured();
    if (isMemory()) return null;
    if (!signingClient) {
        signingClient = makeClient(env.storagePublicEndpoint || env.storageEndpoint);
    }
    return signingClient;
}

function isNotFound(err) {
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name || err?.Code || '';
    return (
        status === 404 ||
        name === 'NotFound' ||
        name === 'NoSuchKey' ||
        name === 'NotFoundException'
    );
}

/**
 * Presigned PUT — Content-Type khóa cứng trên URL (không chỉ tin client).
 * @param {string} key
 * @param {string} contentType
 * @param {number} [expiresInSeconds]
 * @returns {Promise<string>}
 */
export async function getPresignedPutUrl(key, contentType, expiresInSeconds = 20 * 60) {
    assertConfigured();
    if (isMemory()) {
        return `http://127.0.0.1:9/memory-put/${encodeURIComponent(key)}`;
    }
    const command = new PutObjectCommand({
        Bucket: env.storageBucket,
        Key: key,
        ContentType: contentType
    });
    return getSignedUrl(getSigningClient(), command, { expiresIn: expiresInSeconds });
}

/**
 * @param {string} key
 * @param {number} [expiresInSeconds]
 * @returns {Promise<string>}
 */
export async function getPresignedGetUrl(key, expiresInSeconds = 90 * 60) {
    assertConfigured();
    if (isMemory()) {
        return `http://127.0.0.1:9/memory-get/${encodeURIComponent(key)}`;
    }
    const command = new GetObjectCommand({
        Bucket: env.storageBucket,
        Key: key
    });
    return getSignedUrl(getSigningClient(), command, { expiresIn: expiresInSeconds });
}

/**
 * @param {string} key
 * @returns {Promise<{ contentLength: number, contentType: string|undefined }|null>}
 */
export async function headObject(key) {
    assertConfigured();
    if (isMemory()) {
        const item = memoryStore.get(key);
        if (!item) return null;
        return { contentLength: item.size, contentType: item.contentType };
    }
    try {
        const res = await getInternalClient().send(
            new HeadObjectCommand({ Bucket: env.storageBucket, Key: key })
        );
        return {
            contentLength: Number(res.ContentLength) || 0,
            contentType: res.ContentType
        };
    } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
    }
}

/**
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteObject(key) {
    assertConfigured();
    if (isMemory()) {
        memoryStore.delete(key);
        return;
    }
    try {
        await getInternalClient().send(
            new DeleteObjectCommand({ Bucket: env.storageBucket, Key: key })
        );
    } catch (err) {
        if (isNotFound(err)) return;
        throw err;
    }
}

/**
 * Ghi object (test / xác nhận upload giả lập). Không dùng cho luồng browser.
 * @param {string} key
 * @param {Buffer|Uint8Array|string} body
 * @param {string} contentType
 */
export async function putObject(key, body, contentType) {
    assertConfigured();
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (isMemory()) {
        memoryStore.set(key, { body: buf, contentType, size: buf.length });
        return;
    }
    await getInternalClient().send(
        new PutObjectCommand({
            Bucket: env.storageBucket,
            Key: key,
            Body: buf,
            ContentType: contentType
        })
    );
}

/** @param {string} [key] */
export function __resetMemoryStore(key) {
    if (key) memoryStore.delete(key);
    else memoryStore.clear();
}
