import { BaseService } from '../../shared/bases/base.service.js';

export class CompanyService extends BaseService {
  constructor({ companyRepository, redisService }) {
    super();
    this.companyRepository = companyRepository;
    this.redisService = redisService;
    this.CACHE_KEY = 'company:profile';
    this.CACHE_TTL = 3600; // 1 hour TTL for Redis
    this.L1_CACHE_TTL = 60 * 1000; // 60 seconds In-Memory TTL for sub-millisecond responses
    this._inMemoryCache = null;
    this._inMemoryExpiry = 0;
  }

  /**
   * Fetch company profile with Multi-tier (L1 In-Memory + L2 Redis) Cache-Aside optimization
   */
  async getCompany() {
    const now = Date.now();
    // L1: In-Memory cache check (serves in < 0.1ms)
    if (this._inMemoryCache && now < this._inMemoryExpiry) {
      return { ...this._inMemoryCache, _cached: true, _l1: true };
    }

    // L2: Redis Cache check
    if (this.redisService && this.redisService.get) {
      const cached = await this.redisService.get(this.CACHE_KEY);
      if (cached) {
        this._inMemoryCache = cached;
        this._inMemoryExpiry = now + this.L1_CACHE_TTL;
        return { ...cached, _cached: true };
      }
    }

    // Database read
    const companyDoc = await this.companyRepository.getCompanyProfile();
    const companyObj = companyDoc.toJSON ? companyDoc.toJSON() : companyDoc;

    // Populate L1 and L2 caches
    this._inMemoryCache = companyObj;
    this._inMemoryExpiry = now + this.L1_CACHE_TTL;

    if (this.redisService && this.redisService.set) {
      await this.redisService.set(this.CACHE_KEY, companyObj, this.CACHE_TTL);
    }

    return companyObj;
  }

  /**
   * Update company profile details and invalidate both L1 & L2 caches
   */
  async updateCompany(updateData) {
    const existing = await this.companyRepository.getCompanyProfile();
    const companyId = existing._id || existing.id;

    const updatedDoc = await this.companyRepository.updateCompanyProfile(companyId, updateData);
    if (!updatedDoc) {
      this.throwNotFound('Company Profile');
    }

    const companyObj = updatedDoc.toJSON ? updatedDoc.toJSON() : updatedDoc;

    // Invalidate L1 in-memory cache
    this._inMemoryCache = null;
    this._inMemoryExpiry = 0;

    // Invalidate Redis cache for instant reactivity
    if (this.redisService && this.redisService.del) {
      await this.redisService.del(this.CACHE_KEY);
    }

    return companyObj;
  }
}

