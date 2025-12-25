// Polyfills for crypto libraries in browser environment
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  // Make Buffer available globally
  window.Buffer = Buffer;

  // Polyfill for crypto
  if (!window.crypto) {
    window.crypto = require('crypto-browserify');
  }

  // Add global reference that @noble/secp256k1 expects
  (global as any).Buffer = Buffer;
}
