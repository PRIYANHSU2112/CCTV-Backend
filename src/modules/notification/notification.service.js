import { BaseService } from '../../shared/bases/base.service.js';

export class NotificationService extends BaseService {
  constructor({ notificationRepository }) {
    super();
    this.notificationRepository = notificationRepository;
  }

  /**
   * Send a notification to a single user
   */
  async sendNotification({ recipient, title, message, type = 'SYSTEM', priority = 'MEDIUM', channel = 'IN_APP', actionUrl = null, metadata = {} }) {
    return this.notificationRepository.createNotification({
      recipient,
      title,
      message,
      type,
      priority,
      channel,
      actionUrl,
      metadata
    });
  }

  /**
   * Broadcast a notification to multiple users
   */
  async broadcastNotification({ recipientIds, title, message, type = 'SYSTEM', priority = 'MEDIUM', channel = 'IN_APP', actionUrl = null, metadata = {} }) {
    if (!recipientIds?.length) {
      this.throwBadRequest('At least one recipient is required for broadcast');
    }

    const notifications = recipientIds.map(recipientId => ({
      recipient: recipientId,
      title,
      message,
      type,
      priority,
      channel,
      actionUrl,
      metadata
    }));

    const result = await this.notificationRepository.createMany(notifications);
    return { sentCount: result.length };
  }

  /**
   * Get paginated notifications for the authenticated user
   */
  async getMyNotifications(userId, query = {}) {
    const { page, limit, skip } = this.getPaginationParams(query.page, query.limit);

    const isRead = query.isRead !== undefined
      ? query.isRead === 'true' || query.isRead === true
      : undefined;

    const { items, total } = await this.notificationRepository.findByRecipient(userId, { skip, limit, isRead });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get unread notification count for the authenticated user
   */
  async getUnreadCount(userId) {
    const count = await this.notificationRepository.countUnread(userId);
    return { unreadCount: count };
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await this.notificationRepository.markAsRead(notificationId, userId);
    if (!notification) {
      this.throwNotFound('Notification');
    }
    return notification;
  }

  /**
   * Mark all notifications as read for the authenticated user
   */
  async markAllAsRead(userId) {
    return this.notificationRepository.markAllAsRead(userId);
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId, userId) {
    const deleted = await this.notificationRepository.deleteNotification(notificationId, userId);
    if (!deleted) {
      this.throwNotFound('Notification');
    }
    return deleted;
  }

  /**
   * Clear all read notifications for the authenticated user
   */
  async clearReadNotifications(userId) {
    return this.notificationRepository.deleteReadNotifications(userId);
  }
}
