class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value);
    if (ttlSeconds > 0) {
      this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
    }
  }

  get(key) {
    if (this.ttl.has(key) && Date.now() > this.ttl.get(key)) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  size() {
    return this.cache.size;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, expireTime] of this.ttl.entries()) {
      if (now > expireTime) {
        this.delete(key);
      }
    }
  }
}

const cache = new MemoryCache();

// Cleanup expired entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;