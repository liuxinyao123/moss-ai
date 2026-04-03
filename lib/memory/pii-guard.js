/**
 * DSclaw - PII Guard
 * 
 * Detect and redact sensitive information before storing to memory:
 * - API Keys (sk-, AKIA, gsk_, ghp_, etc)
 * - Inline secrets (secret, token, password, key)
 * - PEM private keys
 * - Credit card numbers (xxxx xxxx xxxx xxxx)
 * - Chinese ID card (18 digits)
 * - US SSN (xxx-xx-xxxx)
 */

class PIIGuard {
    // Patterns to detect PII
    patterns = [
        // API Keys
        /sk_[A-Za-z0-9]{48,}/gi,
        /AKIA[A-Z0-9]{16}/gi,
        /gsk_[A-Za-z0-9]{32,}/gi,
        /ghp_[A-Za-z0-9]{36,}/gi,
        /glpat-[A-Za-z0-9-]{20,}/gi,
        // Inline secret assignments
        /(secret|token|password|key|api[_-]?key|access[_-]?token)\s*=\s*['"][A-Za-z0-9/+=_-]{20,}['"]/gi,
        // PEM private key
        /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi,
        // Credit card
        /\b\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\b/gi,
        // Chinese ID card
        /\b[1-9]\d{5}[1-9]\d{3}[0-9xX]\b/gi,
        // US SSN
        /\b\d{3}-\d{2}-\d{4}\b/gi,
    ];
    
    // Detect if content contains any PII
    containsPII(content) {
        for (const pattern of this.patterns) {
            if (pattern.test(content)) {
                return true;
            }
        }
        return false;
    }
    
    // Redact PII from content
    redactPII(content) {
        let redacted = content;
        for (const pattern of this.patterns) {
            redacted = redacted.replace(pattern, '[REDACTED PII]');
        }
        return redacted;
    }
}

module.exports = PIIGuard;
