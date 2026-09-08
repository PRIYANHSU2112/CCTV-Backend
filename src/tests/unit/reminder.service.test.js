import { jest } from '@jest/globals';
import { ReminderService } from '../../modules/reminder/reminder.service.js';
import { LogStatus } from '../../modules/reminder/reminder.model.js';
import { NotFoundError } from '../../shared/errors/not-found.error.js';
import { ClientModel } from '../../modules/client/client.model.js';
import { ClientSubscriptionModel } from '../../modules/subscription/client-subscription.model.js';

describe('ReminderService (Unit Tests)', () => {
  let reminderService;
  let mockReminderRepository;
  let mockQueueService;
  let mockClientRepository;

  beforeEach(() => {
    mockReminderRepository = {
      getConfig: jest.fn(),
      saveConfig: jest.fn(),
      findEligibleClientsForLifecycleOffset: jest.fn(),
      createLogWithIdempotency: jest.fn(),
      updateLogByProviderId: jest.fn(),
      updateLogStatus: jest.fn(),
      findLogById: jest.fn(),
      getReminderStats: jest.fn(),
      createRule: jest.fn(),
      findPaginatedRules: jest.fn(),
      findPaginatedLogs: jest.fn(),
      findRuleById: jest.fn(),
      deleteRule: jest.fn(),
    };

    mockQueueService = {
      scheduleJob: jest.fn(),
      addReminder: jest.fn(),
      addBulkReminders: jest.fn(),
      pauseJob: jest.fn(),
      removeJob: jest.fn(),
    };

    mockClientRepository = {
      findById: jest.fn(),
    };

    reminderService = new ReminderService({
      reminderRepository: mockReminderRepository,
      reminderQueueService: mockQueueService,
      clientRepository: mockClientRepository,
    });
  });

  describe('Daily Automated Lifecycle Engine', () => {
    it('should evaluate enabled lifecycle rules, apply client channel preferences, enforce DB idempotency, and enqueue jobs', async () => {
      const mockRules = [
        {
          id: 'pre_due_7',
          label: '7 Days Before Renewal',
          offsetDays: -7,
          enabled: true,
          channels: ['WhatsApp', 'SMS'],
          messageTemplate: 'Hi {{clientName}}, your renewal of {{amountDue}} is due on {{dueDate}}.',
        },
        {
          id: 'disabled_rule',
          label: 'Disabled Rule',
          offsetDays: -3,
          enabled: false,
          channels: ['SMS'],
          messageTemplate: 'Disabled template',
        },
      ];

      mockReminderRepository.getConfig.mockResolvedValue({ rules: mockRules });

      const mockEligibleClients = [
        {
          clientId: 'CL-1001',
          clientMongoId: 'mongo_1001',
          businessName: 'Super Mart',
          phone: '9876543210',
          email: 'mart@example.com',
          amountDue: 5900,
          balance: 5900,
          renewalDate: new Date('2026-09-14'),
          notificationPreferences: { whatsapp: true, sms: false }, // Client opted out of SMS
        },
      ];

      mockReminderRepository.findEligibleClientsForLifecycleOffset.mockResolvedValue({
        clients: mockEligibleClients,
        targetDateStr: '2026-09-14',
      });

      // Returns log entry on first channel (WhatsApp)
      mockReminderRepository.createLogWithIdempotency.mockResolvedValue({
        _id: 'log_abc_1',
        idempotencyKey: 'lifecycle:pre_due_7:CL-1001:2026-09-14:WhatsApp',
        status: LogStatus.QUEUED,
      });

      mockQueueService.addBulkReminders.mockResolvedValue([
        { id: 'lifecycle:pre_due_7:CL-1001:2026-09-14:WhatsApp' },
      ]);

      const result = await reminderService.processDailyLifecycleReminders();

      expect(mockReminderRepository.getConfig).toHaveBeenCalledTimes(1);
      // Disabled rule should not be queried
      expect(mockReminderRepository.findEligibleClientsForLifecycleOffset).toHaveBeenCalledTimes(1);
      expect(mockReminderRepository.findEligibleClientsForLifecycleOffset).toHaveBeenCalledWith(mockRules[0]);

      // Only WhatsApp should be created because client opted out of SMS
      expect(mockReminderRepository.createLogWithIdempotency).toHaveBeenCalledTimes(1);
      expect(mockReminderRepository.createLogWithIdempotency).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'lifecycle:pre_due_7:CL-1001:2026-09-14:WhatsApp',
          channel: 'WhatsApp',
          recipientPhone: '9876543210',
        })
      );

      // Bulk enqueue should be called with the 1 WhatsApp job
      expect(mockQueueService.addBulkReminders).toHaveBeenCalledTimes(1);
      expect(result.totalEnqueued).toBe(1);
    });

    it('should skip enqueueing if DB returns null indicating duplicate idempotencyKey today', async () => {
      mockReminderRepository.getConfig.mockResolvedValue({
        rules: [
          {
            id: 'due_today',
            label: 'On Due Date',
            offsetDays: 0,
            enabled: true,
            channels: ['WhatsApp'],
            messageTemplate: 'Due today',
          },
        ],
      });

      mockReminderRepository.findEligibleClientsForLifecycleOffset.mockResolvedValue({
        clients: [
          {
            clientId: 'CL-1002',
            clientMongoId: 'mongo_1002',
            phone: '9876543210',
            notificationPreferences: { whatsapp: true },
          },
        ],
        targetDateStr: '2026-09-07',
      });

      // DB returns null because compound index blocked duplicate
      mockReminderRepository.createLogWithIdempotency.mockResolvedValue(null);

      const result = await reminderService.processDailyLifecycleReminders();

      expect(mockReminderRepository.createLogWithIdempotency).toHaveBeenCalledTimes(1);
      expect(mockQueueService.addBulkReminders).not.toHaveBeenCalled();
      expect(result.totalEnqueued).toBe(0);
    });
  });

  describe('Quick Send Single Client & Bulk Broadcast', () => {
    it('should send quick reminder to a single client with custom message', async () => {
      const mockClient = {
        _id: '6a8d250c765d1fccea1939b1',
        name: 'Alpha Store',
        businessName: 'Alpha Store Pvt Ltd',
        phone: '9123456780',
        email: 'alpha@store.com',
        notificationPreferences: { whatsapp: true, sms: true },
      };

      jest.spyOn(ClientModel, 'findById').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockClient),
          }),
        }),
      });

      jest.spyOn(ClientSubscriptionModel, 'findOne').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                remainingAmount: 2400,
                planId: { name: 'Pro 16-Cam Plan' },
                renewalDate: new Date('2026-09-20'),
              }),
            }),
          }),
        }),
      });

      mockReminderRepository.createLogWithIdempotency.mockResolvedValue({
        _id: 'log_quick_1',
        idempotencyKey: 'manual:batch_1:6a8d250c765d1fccea1939b1:WhatsApp',
        status: LogStatus.QUEUED,
      });

      mockQueueService.addBulkReminders.mockResolvedValue([{ id: 'job_quick_1' }]);

      const result = await reminderService.sendQuickReminder({
        recipientType: 'SINGLE',
        clientId: '6a8d250c765d1fccea1939b1',
        channels: ['WhatsApp'],
        messageTemplate: 'Important update regarding your CCTV plan.',
      });

      expect(mockReminderRepository.createLogWithIdempotency).toHaveBeenCalledTimes(1);
      expect(mockQueueService.addBulkReminders).toHaveBeenCalledTimes(1);
      expect(result.queuedCount).toBe(1);
    });

    it('should throw NotFoundError if client does not exist for single send', async () => {
      jest.spyOn(ClientModel, 'findById').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      await expect(
        reminderService.sendQuickReminder({
          recipientType: 'SINGLE',
          clientId: '6a8d250c765d1fccea1939b1',
          channels: ['WhatsApp'],
          messageTemplate: 'Hello',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Provider Webhook & Asynchronous Delivery Reports (DLR)', () => {
    it('should process DELIVERED status from MSG91 webhook payload and update log', async () => {
      const webhookPayload = {
        requestId: 'req_msg91_88899',
        status: 'delivered',
      };

      mockReminderRepository.updateLogByProviderId.mockResolvedValue({
        _id: 'log_123',
        status: LogStatus.DELIVERED,
      });

      const result = await reminderService.handleProviderWebhook(webhookPayload);

      expect(mockReminderRepository.updateLogByProviderId).toHaveBeenCalledWith(
        'req_msg91_88899',
        expect.objectContaining({
          status: LogStatus.DELIVERED,
          deliveredAt: expect.any(Date),
        })
      );
      expect(result.updated).toBe(true);
      expect(result.status).toBe(LogStatus.DELIVERED);
    });

    it('should process FAILED status from provider webhook and record failure reason', async () => {
      const webhookPayload = {
        id: 'wamid.HBgLMTIzNDU2Nzg5',
        status: 'failed',
        reason: 'Invalid WhatsApp destination number',
      };

      mockReminderRepository.updateLogByProviderId.mockResolvedValue({
        _id: 'log_456',
        status: LogStatus.FAILED,
      });

      const result = await reminderService.handleProviderWebhook(webhookPayload);

      expect(mockReminderRepository.updateLogByProviderId).toHaveBeenCalledWith(
        'wamid.HBgLMTIzNDU2Nzg5',
        expect.objectContaining({
          status: LogStatus.FAILED,
          failureReason: 'Invalid WhatsApp destination number',
        })
      );
      expect(result.updated).toBe(true);
      expect(result.status).toBe(LogStatus.FAILED);
    });
  });

  describe('Retry Failed Reminder with Deterministic Tracking', () => {
    it('should re-enqueue a failed reminder preserving deterministic trackingId', async () => {
      const mockLog = {
        _id: 'failed_log_1',
        idempotencyKey: 'manual:batch1:cli1:WhatsApp',
        clientId: { _id: 'cli_1', name: 'Store 1', businessName: 'Store 1 Pvt Ltd' },
        channel: 'WhatsApp',
        status: LogStatus.FAILED,
        failureReason: 'Rate limit exceeded',
        message: 'Hello, your payment is due.',
        recipientPhone: '9876543210',
        save: jest.fn().mockResolvedValue(true),
      };

      mockReminderRepository.findLogById.mockResolvedValue(mockLog);
      mockQueueService.addBulkReminders.mockResolvedValue([{ id: 'retry_job_1' }]);

      const result = await reminderService.retryFailedReminder('failed_log_1');

      expect(mockLog.status).toBe(LogStatus.QUEUED);
      expect(mockLog.failureReason).toBeNull();
      expect(mockLog.save).toHaveBeenCalledTimes(1);
      expect(mockQueueService.addBulkReminders).toHaveBeenCalledWith([
        expect.objectContaining({
          logId: 'failed_log_1',
          idempotencyKey: 'manual:batch1:cli1:WhatsApp',
          channel: 'WhatsApp',
        }),
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe('Analytics & KPIs', () => {
    it('should return aggregated reminder metrics across channels and statuses', async () => {
      const mockStats = {
        sentToday: 120,
        deliveredToday: 114,
        failedToday: 6,
        deliveryRatePercent: 95.0,
        pendingInQueue: 12,
        byChannel: {
          whatsapp: 90,
          sms: 30,
        },
      };

      mockReminderRepository.getReminderStats.mockResolvedValue(mockStats);

      const stats = await reminderService.getReminderStats();

      expect(mockReminderRepository.getReminderStats).toHaveBeenCalledTimes(1);
      expect(stats.deliveryRatePercent).toBe(95.0);
      expect(stats.sentToday).toBe(120);
    });
  });
});
