import { BaseController } from '../../shared/bases/base.controller.js';
import { Messages } from '../../shared/constants/messages.constant.js';

export class NotificationController extends BaseController {
  constructor({ notificationService }) {
    super();
    this.notificationService = notificationService;

    this.sendNotification = this.sendNotification.bind(this);
    this.broadcastNotification = this.broadcastNotification.bind(this);
    this.getMyNotifications = this.getMyNotifications.bind(this);
    this.getUnreadCount = this.getUnreadCount.bind(this);
    this.markAsRead = this.markAsRead.bind(this);
    this.markAllAsRead = this.markAllAsRead.bind(this);
    this.deleteNotification = this.deleteNotification.bind(this);
    this.clearReadNotifications = this.clearReadNotifications.bind(this);
  }

  /**
   * POST /notifications — Admin sends a notification to a user
   */
  sendNotification = this.catchAsync(async (req, res) => {
    const notification = await this.notificationService.sendNotification(req.body);
    return this.sendCreated(res, notification, 'Notification sent successfully');
  });

  /**
   * POST /notifications/broadcast — Admin broadcasts to multiple users
   */
  broadcastNotification = this.catchAsync(async (req, res) => {
    const result = await this.notificationService.broadcastNotification(req.body);
    return this.sendCreated(res, result, 'Broadcast sent successfully');
  });

  /**
   * GET /notifications/me — Get my notifications (paginated)
   */
  getMyNotifications = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const result = await this.notificationService.getMyNotifications(userId, req.query);
    return this.sendPaginated(res, result.items, result.pagination);
  });

  /**
   * GET /notifications/me/unread-count — Get unread count
   */
  getUnreadCount = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const result = await this.notificationService.getUnreadCount(userId);
    return this.sendResponse(res, result, Messages.FETCHED);
  });

  /**
   * PATCH /notifications/:id/read — Mark single notification as read
   */
  markAsRead = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const notification = await this.notificationService.markAsRead(req.params.id, userId);
    return this.sendResponse(res, notification, Messages.UPDATED);
  });

  /**
   * PATCH /notifications/me/read-all — Mark all as read
   */
  markAllAsRead = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const result = await this.notificationService.markAllAsRead(userId);
    return this.sendResponse(res, result, Messages.UPDATED);
  });

  /**
   * DELETE /notifications/:id — Delete a single notification
   */
  deleteNotification = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    await this.notificationService.deleteNotification(req.params.id, userId);
    return this.sendResponse(res, null, Messages.DELETED);
  });

  /**
   * DELETE /notifications/me/read — Clear all read notifications
   */
  clearReadNotifications = this.catchAsync(async (req, res) => {
    const userId = req.user.id || req.user._id;
    const result = await this.notificationService.clearReadNotifications(userId);
    return this.sendResponse(res, result, Messages.DELETED);
  });
}
