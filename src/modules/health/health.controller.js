import { BaseController } from '../../shared/bases/base.controller.js';
import { HttpStatus } from '../../shared/constants/http-status.constant.js';

export class HealthController extends BaseController {
  constructor({ healthService }) {
    super();
    this.healthService = healthService;

    this.getLiveness = this.getLiveness.bind(this);
    this.getReadiness = this.getReadiness.bind(this);
  }

  getLiveness = this.catchAsync(async (req, res) => {
    const data = this.healthService.getLivenessStatus();
    return this.sendResponse(res, data, 'Liveness probe healthy');
  });

  getReadiness = this.catchAsync(async (req, res) => {
    const data = await this.healthService.getReadinessStatus();
    const statusCode = data.status === 'UP' ? HttpStatus.OK : HttpStatus.INTERNAL_SERVER_ERROR;
    return this.sendResponse(res, data, 'Readiness status', statusCode);
  });
}
