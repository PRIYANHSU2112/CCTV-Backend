import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class CompanyController extends BaseController {
  constructor({ companyService }) {
    super();
    this.companyService = companyService;

    // Bind methods for Express routing
    this.getCompany = this.getCompany.bind(this);
    this.updateCompany = this.updateCompany.bind(this);
  }

  getCompany = this.catchAsync(async (req, res) => {
    const company = await this.companyService.getCompany();
    return this.sendResponse(res, company, Messages.FETCHED);
  });

  updateCompany = this.catchAsync(async (req, res) => {
    const company = await this.companyService.updateCompany(req.body);
    return this.sendResponse(res, company, Messages.UPDATED);
  });
}
