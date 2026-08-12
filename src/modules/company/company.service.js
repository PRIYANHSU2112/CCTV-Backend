import { BaseService } from '../../shared/bases/base.service.js';

export class CompanyService extends BaseService {
  constructor({ companyRepository, redisService }) {
    super();
    this.companyRepository = companyRepository;
    this.redisService = redisService;
    this.CACHE_KEY = 'company:profile';
    this.CACHE_TTL = 3600; // 1 hour TTL for high performance
  }

  /**
   * Fetch company profile with Redis Cache-Aside optimization
   */
  async getCompany() {
    if (this.redisService && this.redisService.get) {
      const cached = await this.redisService.get(this.CACHE_KEY);
      if (cached) {
        return { ...cached, _cached: true };
      }
    }

    const companyDoc = await this.companyRepository.getCompanyProfile();
    const companyObj = companyDoc.toJSON ? companyDoc.toJSON() : companyDoc;

    if (this.redisService && this.redisService.set) {
      await this.redisService.set(this.CACHE_KEY, companyObj, this.CACHE_TTL);
    }

    return companyObj;
  }

  /**
   * Update company profile details and invalidate Redis cache
   */
  async updateCompany(updateData) {
    const existing = await this.companyRepository.getCompanyProfile();
    const companyId = existing._id || existing.id;

    const updatedDoc = await this.companyRepository.updateCompanyProfile(companyId, updateData);
    if (!updatedDoc) {
      this.throwNotFound('Company Profile');
    }

    const companyObj = updatedDoc.toJSON ? updatedDoc.toJSON() : updatedDoc;

    // Invalidate Redis cache for instant reactivity
    if (this.redisService && this.redisService.del) {
      await this.redisService.del(this.CACHE_KEY);
    }

    return companyObj;
  }
}
