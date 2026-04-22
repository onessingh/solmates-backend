/**
 * AUDIT FIX: Anonymization utilities for logging
 * Prevents PII exposure in logs
 */

const crypto = require('crypto');

/**
 * Hash PII (Personally Identifiable Information) for logging
 * @param {string} value - Value to hash
 * @returns {string} - First 8 characters of SHA256 hash
 */
function hashPII(value) {
    if (!value) return 'empty';
    
    return crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex')
        .substring(0, 8);
}

/**
 * Partially mask IP address for logging
 * @param {string} ip - IP address
 * @returns {string} - Masked IP (e.g., 192.168.1.*** or 2001:db8::****)
 */
function maskIP(ip) {
    if (!ip) return 'unknown';
    
    // IPv4
    if (ip.includes('.')) {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
        }
    }
    
    // IPv6
    if (ip.includes(':')) {
        const parts = ip.split(':');
        if (parts.length > 2) {
            return `${parts[0]}:${parts[1]}::****`;
        }
    }
    
    return ip;
}

/**
 * Create anonymized log object
 * @param {Object} data - Original data
 * @returns {Object} - Anonymized data
 */
function anonymizeLogData(data) {
    const anonymized = { ...data };
    
    // Hash sensitive fields if present
    if (anonymized.adminId) {
        anonymized.hashedAdminId = hashPII(anonymized.adminId);
        delete anonymized.adminId;
    }
    
    if (anonymized.email) {
        anonymized.hashedEmail = hashPII(anonymized.email);
        delete anonymized.email;
    }
    
    if (anonymized.username) {
        anonymized.hashedUsername = hashPII(anonymized.username);
        delete anonymized.username;
    }
    
    // Mask IP addresses
    if (anonymized.ip) {
        anonymized.maskedIP = maskIP(anonymized.ip);
        delete anonymized.ip;
    }
    
    return anonymized;
}

module.exports = {
    hashPII,
    maskIP,
    anonymizeLogData
};
