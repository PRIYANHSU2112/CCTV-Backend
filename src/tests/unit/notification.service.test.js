import { jest } from '@jest/globals';
import { NotificationService } from '../../modules/notification/notification.service.js';

describe('NotificationService (Unit Tests)', () => {
  let notificationService;
  let mockNotificationRepository;

  const mockNotification = {
    _id: 'notif_001',
    id: 'notif_001',
    recipient: 'user_001',
    title: 'Payment Received',
    message: 'Payment of ₹1,500 received for Invoice INV-2026-001',
    type: 'PAYMENT',
    priority: 'MEDIUM',
    channel: 'IN_APP',
    actionUrl: '/invoices/inv_123',
    metadata: { invoiceNumber: 'INV-2026-001', amount: 1500 },
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  beforeEach(() => {
    mockNotificationRepository = {
      createNotification: jest.fn(),
      createMany: jest.fn(),
      findByRecipient: jest.fn(),
      countUnread: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      deleteNotification: jest.fn(),
      deleteReadNotifications: jest.fn()
    };

    notificationService = new NotificationService({
      notificationRepository: mockNotificationRepository
    });
  });

  describe('sendNotification', () => {
    it('should create and return a new notification', async () => {
      mockNotificationRepository.createNotification.mockResolvedValue(mockNotification);

      const result = await notificationService.sendNotification({
        recipient: 'user_001',
        title: 'Payment Received',
        message: 'Payment of ₹1,500 received for Invoice INV-2026-001',
        type: 'PAYMENT',
        actionUrl: '/invoices/inv_123',
        metadata: { invoiceNumber: 'INV-2026-001', amount: 1500 }
      });

      expect(mockNotificationRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'user_001', title: 'Payment Received', type: 'PAYMENT' })
      );
      expect(result.id).toBe('notif_001');
    });
  });

  describe('broadcastNotification', () => {
    it('should send notifications to multiple users', async () => {
      const recipientIds = ['user_001', 'user_002', 'user_003'];
      mockNotificationRepository.createMany.mockResolvedValue([{}, {}, {}]);

      const result = await notificationService.broadcastNotification({
        recipientIds,
        title: 'System Maintenance',
        message: 'Scheduled maintenance at 2AM IST'
      });

      expect(mockNotificationRepository.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ recipient: 'user_001' }),
          expect.objectContaining({ recipient: 'user_002' }),
          expect.objectContaining({ recipient: 'user_003' })
        ])
      );
      expect(result.sentCount).toBe(3);
    });
  });

  describe('getMyNotifications', () => {
    it('should return paginated notifications for the user', async () => {
      mockNotificationRepository.findByRecipient.mockResolvedValue({
        items: [mockNotification],
        total: 1
      });

      const result = await notificationService.getMyNotifications('user_001', { page: 1, limit: 20 });

      expect(mockNotificationRepository.findByRecipient).toHaveBeenCalledWith(
        'user_001',
        expect.objectContaining({ skip: 0, limit: 20 })
      );
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
    });

    it('should filter by isRead when provided', async () => {
      mockNotificationRepository.findByRecipient.mockResolvedValue({ items: [], total: 0 });

      await notificationService.getMyNotifications('user_001', { page: 1, limit: 10, isRead: 'false' });

      expect(mockNotificationRepository.findByRecipient).toHaveBeenCalledWith(
        'user_001',
        expect.objectContaining({ isRead: false })
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count', async () => {
      mockNotificationRepository.countUnread.mockResolvedValue(5);

      const result = await notificationService.getUnreadCount('user_001');

      expect(mockNotificationRepository.countUnread).toHaveBeenCalledWith('user_001');
      expect(result.unreadCount).toBe(5);
    });
  });

  describe('markAsRead', () => {
    it('should mark a single notification as read', async () => {
      const readNotification = { ...mockNotification, isRead: true, readAt: new Date() };
      mockNotificationRepository.markAsRead.mockResolvedValue(readNotification);

      const result = await notificationService.markAsRead('notif_001', 'user_001');

      expect(mockNotificationRepository.markAsRead).toHaveBeenCalledWith('notif_001', 'user_001');
      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundError if notification does not exist', async () => {
      mockNotificationRepository.markAsRead.mockResolvedValue(null);

      await expect(notificationService.markAsRead('notif_999', 'user_001'))
        .rejects
        .toThrow('Notification not found');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for the user', async () => {
      mockNotificationRepository.markAllAsRead.mockResolvedValue({ modifiedCount: 8 });

      const result = await notificationService.markAllAsRead('user_001');

      expect(mockNotificationRepository.markAllAsRead).toHaveBeenCalledWith('user_001');
      expect(result.modifiedCount).toBe(8);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a single notification', async () => {
      mockNotificationRepository.deleteNotification.mockResolvedValue(mockNotification);

      const result = await notificationService.deleteNotification('notif_001', 'user_001');

      expect(mockNotificationRepository.deleteNotification).toHaveBeenCalledWith('notif_001', 'user_001');
      expect(result.id).toBe('notif_001');
    });

    it('should throw NotFoundError if notification does not exist', async () => {
      mockNotificationRepository.deleteNotification.mockResolvedValue(null);

      await expect(notificationService.deleteNotification('notif_999', 'user_001'))
        .rejects
        .toThrow('Notification not found');
    });
  });

  describe('clearReadNotifications', () => {
    it('should delete all read notifications for the user', async () => {
      mockNotificationRepository.deleteReadNotifications.mockResolvedValue({ deletedCount: 3 });

      const result = await notificationService.clearReadNotifications('user_001');

      expect(mockNotificationRepository.deleteReadNotifications).toHaveBeenCalledWith('user_001');
      expect(result.deletedCount).toBe(3);
    });
  });
});
