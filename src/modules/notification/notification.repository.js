import { BaseRepository } from '../../shared/bases/base.repository.js';
import { NotificationModel } from './notification.model.js';

export class NotificationRepository extends BaseRepository {
  constructor() {
    super();
    this.model = NotificationModel;
  }

  /**
   * Create a single notification
   */
  async createNotification(data) {
    return this.model.create(data);
  }

  /**
   * Bulk-create notifications (e.g., broadcast to multiple users)
   */
  async createMany(notifications) {
    return this.model.insertMany(notifications, { ordered: false });
  }

  /**
   * Get paginated notifications for a specific user (newest first)
   */
  async findByRecipient(recipientId, { skip = 0, limit = 20, isRead } = {}) {
    const filter = { recipient: recipientId };
    if (typeof isRead === 'boolean') {
      filter.isRead = isRead;
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec()
    ]);

    return { items, total };
  }

  /**
   * Count unread notifications for a user
   */
  async countUnread(recipientId) {
    return this.model.countDocuments({ recipient: recipientId, isRead: false }).exec();
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, recipientId) {
    return this.model.findOneAndUpdate(
      { _id: notificationId, recipient: recipientId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).lean().exec();
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(recipientId) {
    const result = await this.model.updateMany(
      { recipient: recipientId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId, recipientId) {
    return this.model.findOneAndDelete({ _id: notificationId, recipient: recipientId }).lean().exec();
  }

  /**
   * Bulk-delete all read notifications for a user (cleanup)
   */
  async deleteReadNotifications(recipientId) {
    const result = await this.model.deleteMany({ recipient: recipientId, isRead: true }).exec();
    return { deletedCount: result.deletedCount };
  }
}
