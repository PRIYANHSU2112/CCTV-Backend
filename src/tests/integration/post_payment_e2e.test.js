import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectDatabase, disconnectDatabase } from '../../config/database.config.js';
import { env } from '../../config/env.config.js';
import { SubscriptionPlanModel } from '../../modules/subscription/plan.model.js';
import { UserModel } from '../../modules/user/user.model.js';
import { ClientModel } from '../../modules/client/client.model.js';
import { ClientSubscriptionModel } from '../../modules/subscription/client-subscription.model.js';
import { PaymentTransactionModel } from '../../modules/payment/payment-transaction.model.js';
import { CheckoutSessionModel } from '../../modules/payment/checkout-session.model.js';
import { InvoiceModel } from '../../modules/invoice/invoice.model.js';
import { NotificationModel } from '../../modules/notification/notification.model.js';

import { RazorpayService } from '../../modules/payment/razorpay.service.js';
import { PaymentRepository } from '../../modules/payment/payment.repository.js';
import { ClientRepository } from '../../modules/client/client.repository.js';
import { UserRepository } from '../../modules/user/user.repository.js';
import { SubscriptionRepository } from '../../modules/subscription/subscription.repository.js';
import { HashService } from '../../shared/security/hash.service.js';
import { CheckoutService } from '../../modules/payment/checkout.service.js';
import { PostPaymentWorkers } from '../../shared/queues/post-payment.workers.js';
import { PdfService } from '../../modules/invoice/pdf.service.js';
import { PdfWorker } from '../../modules/invoice/pdf.worker.js';

describe('End-to-End Post-Payment Workflow Integration', () => {
  test('Complete Checkout -> Payment -> Invoice Pipeline -> Notification Flow', async () => {
    console.log('===========================================================');
    console.log('🧪 Starting End-to-End Post-Payment Workflow Integration Test');
    console.log('===========================================================');

  try {
    // 1. Connect MongoDB Database
    console.log('1️⃣ Connecting to MongoDB Database...');
    await connectDatabase();
    console.log('✅ Connected to MongoDB Atlas');

    // Mock minimal Redis service for test environment
    const mockRedisService = {
      get: async () => null,
      set: async () => true,
      del: async () => true,
    };

    const mockRedisClient = {
      duplicate: () => ({ on: () => {}, close: () => {} })
    };

    // 2. Instantiate Repositories and Services
    const razorpayService = new RazorpayService();
    const paymentRepository = new PaymentRepository();
    const clientRepository = new ClientRepository();
    const userRepository = new UserRepository();
    const subscriptionRepository = new SubscriptionRepository();
    const hashService = new HashService();

    // Mock PostPaymentQueueService to capture enqueued jobs directly
    const enqueuedJobs = { adminJobs: [], invoiceJobs: [] };
    const mockPostPaymentQueueService = {
      addAdminNotificationJob: async (jobData) => {
        enqueuedJobs.adminJobs.push(jobData);
        console.log('   [Queue] Admin notification job enqueued:', jobData.paymentId);
        return { id: `admin_job_${jobData.paymentId}` };
      },
      addInvoicePipelineJob: async (jobData) => {
        enqueuedJobs.invoiceJobs.push(jobData);
        console.log('   [Queue] Invoice pipeline job enqueued:', jobData.paymentId);
        return { id: `invoice_job_${jobData.paymentId}` };
      }
    };

    const checkoutService = new CheckoutService({
      razorpayService,
      paymentRepository,
      clientRepository,
      userRepository,
      subscriptionRepository,
      hashService,
      redisService: mockRedisService,
      postPaymentQueueService: mockPostPaymentQueueService
    });

    // Instantiate PostPaymentWorkers with mocked internal BullMQ worker instances
    const postPaymentWorkers = new PostPaymentWorkers({
      redisClient: mockRedisClient,
      pdfQueueService: null
    });
    // Quiet BullMQ connection logs in test
    postPaymentWorkers.adminWorker = { close: async () => {} };
    postPaymentWorkers.invoiceWorker = { close: async () => {} };

    // 3. Seed Required Database Entities (Admin User & Subscription Plan)
    console.log('\n2️⃣ Seeding Test Admin User & Subscription Plan...');
    
    // Seed Admin User for receiving notifications
    let testAdmin = await UserModel.findOne({ role: 'SUPER_ADMIN', email: 'e2e_admin@satyakabir.com' });
    if (!testAdmin) {
      testAdmin = await UserModel.create({
        name: 'E2E Super Admin',
        email: 'e2e_admin@satyakabir.com',
        phone: '+919999888877',
        password: await hashService.hashPassword('Admin@123'),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE'
      });
    }
    console.log(`✅ Admin User Active: [ID: ${testAdmin._id}, Name: ${testAdmin.name}]`);

    // Seed Active Plan
    let testPlan = await SubscriptionPlanModel.findOne({ name: 'E2E Test Pro Plan' });
    if (!testPlan) {
      testPlan = await SubscriptionPlanModel.create({
        name: 'E2E Test Pro Plan',
        planCode: 'E2E-PRO-01',
        packageTier: 'PREMIUM',
        maxCameras: 8,
        basePrice: 1694.07,
        billingCycle: 'MONTHLY',
        durationInMonths: 1,
        status: 'ACTIVE'
      });
    }
    console.log(`✅ Plan Active: [ID: ${testPlan._id}, Name: ${testPlan.name}, Price: ₹${testPlan.totalPrice}]`);

    // 4. STEP A: Create Checkout Session (Initiate Purchase)
    console.log('\n3️⃣ STEP A: Creating Subscription Checkout Session...');
    const testCustomer = {
      planId: testPlan._id.toString(),
      name: 'Priyanshu Sahu',
      phone: '+919876543210',
      email: 'priyanshu@satyakabir.com',
      businessName: 'Satya Kabir Electronics',
      address: 'Plot 42, Commercial Zone, MP Nagar',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      pincode: '462011',
      gstin: '23AAAAA0000A1Z5'
    };

    const checkoutResult = await checkoutService.createCheckoutSession(testCustomer);
    console.log('✅ Checkout Session Created:');
    console.log(`   Session ID: ${checkoutResult.sessionId}`);
    console.log(`   Order ID:   ${checkoutResult.orderId}`);
    console.log(`   Amount:     ₹${checkoutResult.amount} (${checkoutResult.amountPaise} paise)`);
    console.log(`   Receipt No: ${checkoutResult.receiptNo}`);

    // Verify initial PENDING statuses in DB
    const pendingPayment = await PaymentTransactionModel.findById(checkoutResult.paymentId);
    const pendingSub = await ClientSubscriptionModel.findById(checkoutResult.subscriptionId);
    console.log(`   Initial Payment Status:      ${pendingPayment.status}`); // Should be PENDING
    console.log(`   Initial Subscription Status: ${pendingSub.status}`);     // Should be PENDING_PAYMENT

    // 5. STEP B: Simulate Razorpay Signature Verification & Payment Activation
    console.log('\n4️⃣ STEP B: Verifying Payment & Activating Subscription...');
    const fakeRazorpayPaymentId = `pay_${Date.now()}`;
    const generatedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${checkoutResult.orderId}|${fakeRazorpayPaymentId}`)
      .digest('hex');

    const verifyResult = await checkoutService.verifyCheckoutPayment({
      sessionId: checkoutResult.sessionId,
      razorpay_order_id: checkoutResult.orderId,
      razorpay_payment_id: fakeRazorpayPaymentId,
      razorpay_signature: generatedSignature
    });

    console.log('✅ Payment Verified Successfully!');
    console.log(`   Verified Session Status: ${verifyResult.status}`);
    console.log(`   Razorpay Payment ID:     ${verifyResult.payment.razorpayPaymentId}`);

    // Verify DB Activation
    const activePayment = await PaymentTransactionModel.findById(checkoutResult.paymentId);
    const activeSub = await ClientSubscriptionModel.findById(checkoutResult.subscriptionId);
    console.log(`   Updated DB Payment Status:      ${activePayment.status}`); // Must be PAID
    console.log(`   Updated DB Subscription Status: ${activeSub.status}`);     // Must be ACTIVE

    if (activePayment.status !== 'PAID' || activeSub.status !== 'ACTIVE') {
      throw new Error('❌ Payment or Subscription activation failed in MongoDB!');
    }

    // 6. STEP C: Verify Queue Job Enqueuing
    console.log('\n5️⃣ STEP C: Verifying Post-Payment Queue Job Enqueuing...');
    console.log(`   Enqueued Admin Notification Jobs: ${enqueuedJobs.adminJobs.length}`);
    console.log(`   Enqueued Invoice Pipeline Jobs:   ${enqueuedJobs.invoiceJobs.length}`);

    if (enqueuedJobs.adminJobs.length === 0 || enqueuedJobs.invoiceJobs.length === 0) {
      throw new Error('❌ Post-payment jobs were not enqueued properly!');
    }

    // 7. STEP D: Process Background Worker Jobs & Verify Artifact Generation
    console.log('\n6️⃣ STEP D: Executing Worker Pipeline Jobs (Async Processing)...');

    // Run Worker 1: Admin Notification Processing
    console.log('   ▶ Executing Admin Notification Worker...');
    const adminJobData = enqueuedJobs.adminJobs[0];
    const adminWorkerResult = await postPaymentWorkers.processAdminNotification({ data: adminJobData });
    console.log(`   ✅ Admin Notifications Created: ${adminWorkerResult.notified}`);

    // Run Worker 2: Invoice Pipeline Processing
    console.log('   ▶ Executing Invoice Pipeline Worker...');
    const invoiceJobData = enqueuedJobs.invoiceJobs[0];
    const invoiceWorkerResult = await postPaymentWorkers.processInvoicePipeline({ data: invoiceJobData });
    console.log(`   ✅ Invoice Pipeline Completed: [Invoice ID: ${invoiceWorkerResult.invoiceId}, Number: ${invoiceWorkerResult.invoiceNumber}]`);

    // Run PDF Rendering & S3 Upload Worker
    console.log('   ▶ Executing Puppeteer PDF Rendering & S3 Upload Worker...');
    const pdfService = new PdfService();
    const pdfWorker = new PdfWorker({
      redisClient: mockRedisClient,
      clientRepository,
      pdfService
    });
    pdfWorker.worker = { close: async () => {} };
    const pdfWorkerResult = await pdfWorker.processJob({ data: { invoiceId: invoiceWorkerResult.invoiceId } });
    console.log(`   ✅ PDF Generated & Uploaded: [${pdfWorkerResult.pdfUrl}]`);

    // 8. STEP E: Verify DB Final State (Invoice & Notification Records)
    console.log('\n7️⃣ STEP E: Verifying Database Artifacts (Invoice & Notifications)...');

    // Check Invoice Document in MongoDB
    const generatedInvoice = await InvoiceModel.findOne({ paymentTransactionId: checkoutResult.paymentId });
    if (!generatedInvoice) {
      throw new Error('❌ Invoice record was not created in MongoDB!');
    }

    console.log('✅ Generated Invoice Verified in MongoDB:');
    console.log(`   Invoice Number: ${generatedInvoice.invoiceNumber}`);
    console.log(`   Status:         ${generatedInvoice.status}`);       // Must be PAID
    console.log(`   PDF URL in DB:  ${generatedInvoice.pdfUrl}`);       // Verified pdfUrl field saved in DB
    console.log(`   Total Amount:   ₹${generatedInvoice.totalAmount}`);
    console.log(`   Subtotal:       ₹${generatedInvoice.subtotal}`);
    console.log(`   Paid At:        ${generatedInvoice.paidAt}`);
    console.log(`   Line Items:     ${generatedInvoice.items.map(i => i.description).join(', ')}`);

    if (!generatedInvoice.pdfUrl) {
      throw new Error('❌ PDF URL was not saved in Invoice MongoDB document!');
    }

    // Check Admin Notification in MongoDB
    const adminNotification = await NotificationModel.findOne({
      recipient: testAdmin._id,
      type: 'PAYMENT',
      'metadata.paymentId': checkoutResult.paymentId
    });

    if (!adminNotification) {
      throw new Error('❌ Admin Notification was not created in MongoDB!');
    }

    console.log('✅ Admin In-App Notification Verified in MongoDB:');
    console.log(`   Recipient Admin: ${testAdmin.name} (${testAdmin.email})`);
    console.log(`   Notification Title: "${adminNotification.title}"`);
    console.log(`   Notification Body:  "${adminNotification.message}"`);
    console.log(`   Notification Type:  ${adminNotification.type}`);
    console.log(`   Priority:           ${adminNotification.priority}`);
    console.log(`   Action URL:         ${adminNotification.actionUrl}`);

    // Cleanup worker
    await postPaymentWorkers.close();

    console.log('\n===========================================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED 100% SUCCESSFULLY!');
    console.log('===========================================================');

  } finally {
    await disconnectDatabase();
  }
  }, 60000);
});
