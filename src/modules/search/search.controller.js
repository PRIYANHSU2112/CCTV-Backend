import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class SearchController extends BaseController {
  constructor({ searchService }) {
    super();
    this.searchService = searchService;
  }

  globalSearch = this.catchAsync(async (req, res) => {
    const start = process.hrtime();
    const { q, limit, type } = req.query;

    const result = await this.searchService.globalSearch({
      query: q,
      limit: limit ? parseInt(limit, 10) : 5,
      type: type || 'all',
    });

    const diff = process.hrtime(start);
    const tookMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    return res.status(200).json({
      success: true,
      message: Messages.FETCHED,
      data: result.results,
      meta: {
        ...result.meta,
        tookMs: Number(tookMs),
      },
    });
  });
}
