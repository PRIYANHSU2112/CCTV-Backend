import { Router } from 'express';
import { authenticateJwt, requirePermission } from '../../shared/middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/middlewares/validate.middleware.js';
import { Permissions } from '../../shared/constants/permissions.constant.js';
import { sendNotificationSchema, broadcastNotificationSchema, getNotificationsQuerySchema } from './notification.validator.js';

export const createNotificationRouter = (notificationController) => {
  const router = Router();

  // All notification endpoints require JWT authentication
  router.use(authenticateJwt);

  // ──── User-Facing Endpoints (Own Notifications) ────

  /**
   * @route GET /api/v1/notifications
   * @desc Get authenticated user's notifications
   */
  router.get('/', validateRequest(getNotificationsQuerySchema, 'query'), notificationController.getMyNotifications);

  /**
   * @route GET /api/v1/notifications/me
   * @desc Get authenticated user's notifications (paginated)
   */
  router.get('/me', validateRequest(getNotificationsQuerySchema, 'query'), notificationController.getMyNotifications);

  /**
   * @route GET /api/v1/notifications/me/unread-count
   * @desc Get unread notification count for authenticated user
   */
  router.get('/me/unread-count', notificationController.getUnreadCount);

  /**
   * @route PATCH /api/v1/notifications/me/read-all
   * @desc Mark all notifications as read for authenticated user
   */
  router.patch('/me/read-all', notificationController.markAllAsRead);

  /**
   * @route DELETE /api/v1/notifications/me/read
   * @desc Clear all read notifications for authenticated user
   */
  router.delete('/me/read', notificationController.clearReadNotifications);

  /**
   * @route PATCH /api/v1/notifications/:id/read
   * @desc Mark a single notification as read
   */
  router.patch('/:id/read', notificationController.markAsRead);

  /**
   * @route DELETE /api/v1/notifications/:id
   * @desc Delete a single notification
   */
  router.delete('/:id', notificationController.deleteNotification);

  // ──── Admin Endpoints (Send / Broadcast) ────

  /**
   * @route POST /api/v1/notifications
   * @desc Send a notification to a specific user (Admin only)
   */
  router.post('/', requirePermission(Permissions.NOTIFICATIONS_SEND), validateRequest(sendNotificationSchema), notificationController.sendNotification);

  /**
   * @route POST /api/v1/notifications/broadcast
   * @desc Broadcast a notification to multiple users (Admin only)
   */
  router.post('/broadcast', requirePermission(Permissions.NOTIFICATIONS_SEND), validateRequest(broadcastNotificationSchema), notificationController.broadcastNotification);

  return router;
};
