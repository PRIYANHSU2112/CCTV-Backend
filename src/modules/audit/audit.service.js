import { AuditLogModel } from './audit-log.model.js';

export class AuditService {
  /**
   * Log an administrative or security audit event
   */
  static async logEvent({ actor, action, targetType, targetId, changes = {}, ip = null, userAgent = null }) {
    try {
      return await AuditLogModel.create({
        actorId: actor?.id || actor?._id || 'system',
        actorName: actor?.name || 'System',
        actorRole: actor?.role || 'SYSTEM',
        action,
        targetType,
        targetId: targetId ? String(targetId) : null,
        changes,
        ip,
        userAgent
      });
    } catch (err) {
      console.error('[Audit Log Failure]:', err.message);
      return null;
    }
  }

  /**
   * Retrieve paginated audit logs
   */
  static async listLogs({ page = 1, limit = 20, search, action, targetType }) {
    const query = {};

    if (action) {
      query.action = action;
    }

    if (targetType) {
      query.targetType = targetType;
    }

    if (search) {
      query.$or = [
        { actorName: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { targetId: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const [items, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(query)
    ]);

    const formattedItems = items.map((item) => ({
      ...item,
      id: item._id.toString()
    }));

    return {
      items: formattedItems,
      page,
      limit,
      total
    };
  }
}
