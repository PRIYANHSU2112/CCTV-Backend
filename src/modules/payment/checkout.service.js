import { randomUUID } from 'crypto';
import { BaseService } from '../../shared/bases/base.service.js';
import { withMongoTransaction } from '../../shared/utils/mongo-transaction.util.js';
import { env } from '../../config/env.config.js';
import { SystemConstants } from '../../shared/constants/system.constant.js';
import {
  UserRole,
  UserStatus,
  ClientStatus,
  PaymentMethod,
  PaymentStatus,
  PlanStatus,
  SubscriptionStatus,
  CheckoutSessionStatus,
} from '../../shared/constants/enum.constant.js';
import { normalizeGstin } from '../../shared/utils/gstin.util.js';
import { roundMoney, toPaise, toRupees } from '../../shared/utils/money.util.js';
import { CheckoutSessionModel } from './checkout-session.model.js';
import { NotificationModel } from '../notification/notification.model.js';
import { UserModel } from '../user/user.model.js';

export class CheckoutService extends BaseService {
  constructor({
    razorpayService,
    paymentRepository,
    clientRepository,
    userRepository,
    subscriptionRepository,
    hashService,
    redisService,
    postPaymentQueueService = null,
  }) {
    super();
    this.razorpayService = razorpayService;
    this.paymentRepository = paymentRepository;
    this.clientRepository = clientRepository;
    this.userRepository = userRepository;
    this.subscriptionRepository = subscriptionRepository;
    this.hashService = hashService;
    this.redisService = redisService;
    this.postPaymentQueueService = postPaymentQueueService;
  }

  getGatewayConfig() {
    return this.razorpayService.getPublicConfig();
  }

  /**
   * Book subscription (PENDING_PAYMENT) + PENDING payment + Razorpay order.
   * DB writes run in a MongoDB ACID transaction.
   */
  async createCheckoutSession(payload) {
    const plan = await this.subscriptionRepository.findPlanById(payload.planId);
    if (!plan || plan.status !== PlanStatus.ACTIVE) {
      this.throwBadRequest('Active subscription plan not found');
    }

    // ── PARTIAL PAYMENT PATH (Pay Remaining Balance) ─────────────────────────
    // Skip #normalizeCustomer validation (address/pincode not required for balance pays)
    if (payload.existingSubscriptionId) {
      return this.#createPartialPaymentSession(payload, plan);
    }

    // ── FULL / CUSTOM NEW CHECKOUT PATH ──────────────────────────────────────
    const customer = this.#normalizeCustomer(payload);

    // Auto-detect if existing customer already has an ACTIVE subscription with outstanding balance
    if (!payload.existingSubscriptionId && customer.phone) {
      const existingUser = await this.userRepository.findByPhone(customer.phone);
      if (existingUser) {
        const activeSub = await this.subscriptionRepository.findActiveSubscriptionByClient(existingUser._id);
        if (activeSub && (activeSub.remainingAmount || 0) > 0) {
          payload.existingSubscriptionId = (activeSub._id || activeSub.id).toString();
          return this.#createPartialPaymentSession(payload, plan);
        }
      }
    }

    const fullPlanPrice = roundMoney(Number(plan.totalPrice));
    const customAmountNum = payload.customAmount ? roundMoney(Number(payload.customAmount)) : 0;
    const amount = customAmountNum > 0 ? customAmountNum : fullPlanPrice;
    if (!(amount > 0)) {
      this.throwBadRequest('Plan price is invalid');
    }
    const remainingAmount = roundMoney(Math.max(0, fullPlanPrice - amount));
    const amountPaise = toPaise(amount);
    const sessionId = randomUUID().replace(/-/g, '');
    const ttlMin = env.CHECKOUT_SESSION_TTL_MINUTES || 30;
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    // External gateway call — outside Mongo transaction
    const order = await this.razorpayService.createOrder({
      amountPaise,
      currency: 'INR',
      receipt: `chk_${sessionId.slice(0, 20)}`,
      notes: { sessionId, planId: String(plan._id || plan.id) },
    });

    const receiptNo = await this.#generateReceiptNo();
    const months = plan.durationInMonths || 1;
    const startDate = new Date();
    const renewalDate = new Date(startDate);
    renewalDate.setMonth(renewalDate.getMonth() + months);
    const monthlyCharge = roundMoney(amount / Math.max(1, months));

    const booked = await withMongoTransaction(async (session) => {
      let user = await this.userRepository.findByPhone(customer.phone, false, {
        session,
      });
      if (!user) {
        const hashedPassword = await this.hashService.hashPassword('Client@123');
        user = await this.userRepository.create(
          {
            name: customer.name,
            phone: customer.phone,
            email: customer.email || undefined,
            password: hashedPassword,
            role: UserRole.CLIENT,
            status: UserStatus.ACTIVE,
          },
          { session },
        );
      } else {
        const userUpdates = {};
        if (customer.name && (!user.name || user.name.startsWith('User '))) {
          userUpdates.name = customer.name;
        }
        if (customer.email && (!user.email || user.email !== customer.email)) {
          userUpdates.email = customer.email;
        }
        if (user.phone !== customer.phone) {
          userUpdates.phone = customer.phone;
        }
        if (Object.keys(userUpdates).length > 0) {
          await this.userRepository.update(user._id, userUpdates, { session }).catch(() => {});
        }
      }

      let client = await this.clientRepository.findByUserId(user._id, {
        session,
        lean: true,
      });
      if (!client) {
        client = await this.clientRepository.create(
          {
            userId: user._id,
            email: customer.email || user.email || undefined,
            businessName: customer.businessName,
            gstin: customer.gstin || undefined,
            installationAddress: {
              address: customer.address,
              city: customer.city,
              pincode: customer.pincode,
              state: customer.state,
            },
            status: ClientStatus.DUE,
          },
          { session },
        );
      } else {
        const clientUpdates = {};
        if (customer.email && (!client.email || client.email !== customer.email)) {
          clientUpdates.email = customer.email;
        }
        if (customer.businessName && client.businessName !== customer.businessName) {
          clientUpdates.businessName = customer.businessName;
        }
        if (Object.keys(clientUpdates).length > 0) {
          await this.clientRepository.update(
            client._id || client.id,
            clientUpdates,
            { session }
          ).catch(() => {});
        }
      }

      const subscription = await this.subscriptionRepository.createSubscription(
        {
          clientId: user._id,
          planId: plan._id || plan.id,
          packageTier: plan.packageTier,
          cameraCount: plan.maxCameras,
          monthlyCharge,
          totalPlanPrice: fullPlanPrice,
          paidAmount: amount,
          remainingAmount,
          durationInMonths: months,
          contractStartDate: startDate,
          renewalDate,
          autoRenewal: plan.autoRenewalSupported !== false,
          status: SubscriptionStatus.PENDING_PAYMENT,
        },
        { session },
      );

      const payment = await this.paymentRepository.create(
        {
          clientId: client._id || client.id,
          subscriptionId: subscription._id || subscription.id,
          checkoutSessionId: sessionId,
          amount,
          planTotalPrice: fullPlanPrice,
          remainingAmount,
          amountPaise,
          currency: 'INR',
          method: PaymentMethod.GATEWAY,
          status: PaymentStatus.PENDING,
          paidAt: null,
          receiptNo,
          razorpayOrderId: order.id,
          note: `Checkout for plan ${plan.name}`,
        },
        { session },
      );

      await this.clientRepository.update(
        client._id || client.id,
        { currentSubscriptionId: subscription._id || subscription.id },
        { session },
      );

      const [checkoutSession] = await CheckoutSessionModel.create(
        [
          {
            sessionId,
            planId: plan._id || plan.id,
            clientId: client._id || client.id,
            userId: user._id,
            subscriptionId: subscription._id || subscription.id,
            paymentTransactionId: payment._id || payment.id,
            customer,
            amount,
            planTotalPrice: fullPlanPrice,
            remainingAmount,
            durationInMonths: months,
            amountPaise,
            currency: 'INR',
            razorpayOrderId: order.id,
            status: CheckoutSessionStatus.PENDING,
            expiresAt,
          },
        ],
        { session },
      );

      return {
        checkoutSession,
        payment,
        subscription,
        client,
        user,
      };
    });

    try {
      await this.redisService.set(
        `checkout:session:${sessionId}`,
        { sessionId, status: CheckoutSessionStatus.PENDING },
        ttlMin * 60,
      );
    } catch {
      // Redis optional
    }

    const pub = this.razorpayService.getPublicConfig();
    return {
      sessionId,
      orderId: order.id,
      amount,
      amountPaise,
      planTotalPrice: fullPlanPrice,
      remainingAmount,
      durationInMonths: months,
      currency: 'INR',
      keyId: pub.keyId,
      expiresAt,
      subscriptionId: booked.subscription._id?.toString?.() || booked.subscription.id,
      paymentId: booked.payment._id?.toString?.() || booked.payment.id,
      receiptNo,
      prefill: {
        name: customer.name,
        email: customer.email || '',
        contact: customer.phone,
      },
      plan: {
        id: String(plan._id || plan.id),
        name: plan.name,
        packageTier: plan.packageTier,
        billingCycle: plan.billingCycle,
        totalPrice: fullPlanPrice,
        durationInMonths: months,
      },
    };
  }

  /**
   * Partial payment session for "Pay Remaining Balance" from client portal.
   * Reuses the existing subscription — does NOT create a new one.
   */
  async #createPartialPaymentSession(payload, plan) {
    const existingSubId = payload.existingSubscriptionId;
    const existingSub = await this.subscriptionRepository.findSubscriptionById(existingSubId);
    if (!existingSub) {
      this.throwNotFound('Subscription');
    }

    const remaining = roundMoney(Number(existingSub.remainingAmount || 0));
    if (remaining <= 0) {
      this.throwBadRequest('No outstanding balance to pay on this subscription');
    }

    const customAmountNum = payload.customAmount ? roundMoney(Number(payload.customAmount)) : 0;
    const amount = (customAmountNum > 0 && customAmountNum <= remaining)
      ? customAmountNum
      : remaining;

    const remainingAfterPayment = roundMoney(Math.max(0, remaining - amount));
    const fullPlanPrice = roundMoney(Number(existingSub.totalPlanPrice || plan.totalPrice));
    const amountPaise = toPaise(amount);
    const sessionId = randomUUID().replace(/-/g, '');
    const ttlMin = env.CHECKOUT_SESSION_TTL_MINUTES || 30;
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    const order = await this.razorpayService.createOrder({
      amountPaise,
      currency: 'INR',
      receipt: `bal_${sessionId.slice(0, 18)}`,
      notes: { sessionId, subscriptionId: existingSubId, type: 'BALANCE_PAYMENT' },
    });

    const receiptNo = await this.#generateReceiptNo();

    // Resolve client from existing subscription (clientId = userId reference)
    const userId = existingSub.clientId;
    const client = await this.clientRepository.findByUserId(userId);
    if (!client) {
      this.throwNotFound('Client profile for this subscription');
    }

    // Build customer snapshot from client profile (no strict validation needed)
    const userRef = client.userId && typeof client.userId === 'object' ? client.userId : null;
    const installAddr = client.installationAddress || {};
    const customer = {
      name: userRef?.name || payload.name || 'Client',
      phone: userRef?.phone || payload.phone || '0000000000',
      email: client.email || userRef?.email || payload.email || '',
      businessName: client.businessName || payload.businessName || 'Business',
      address: installAddr.address || payload.address || 'N/A',
      city: installAddr.city || payload.city || 'N/A',
      pincode: installAddr.pincode || payload.pincode || '000000',
      state: installAddr.state || payload.state || 'Madhya Pradesh',
      gstin: client.gstin || '',
    };

    const payment = await this.paymentRepository.create({
      clientId: client._id || client.id,
      subscriptionId: existingSubId,
      checkoutSessionId: sessionId,
      amount,
      planTotalPrice: fullPlanPrice,
      remainingAmount: remainingAfterPayment,
      amountPaise,
      currency: 'INR',
      method: PaymentMethod.GATEWAY,
      status: PaymentStatus.PENDING,
      paidAt: null,
      receiptNo,
      razorpayOrderId: order.id,
      note: `Balance payment for subscription ${existingSubId}`,
    });

    await CheckoutSessionModel.create({
      sessionId,
      planId: existingSub.planId || plan._id,
      clientId: client._id || client.id,
      userId,
      subscriptionId: existingSubId,
      existingSubscriptionId: existingSubId,
      paymentTransactionId: payment._id || payment.id,
      customer,
      amount,
      planTotalPrice: fullPlanPrice,
      remainingAmount: remainingAfterPayment,
      durationInMonths: existingSub.durationInMonths || plan.durationInMonths || 1,
      amountPaise,
      currency: 'INR',
      razorpayOrderId: order.id,
      status: CheckoutSessionStatus.PENDING,
      expiresAt,
    });

    try {
      await this.redisService.set(
        `checkout:session:${sessionId}`,
        { sessionId, status: CheckoutSessionStatus.PENDING },
        ttlMin * 60,
      );
    } catch { /* Redis optional */ }

    const pub = this.razorpayService.getPublicConfig();
    return {
      sessionId,
      orderId: order.id,
      amount,
      amountPaise,
      planTotalPrice: fullPlanPrice,
      remainingAmount: 0,
      durationInMonths: existingSub.durationInMonths || plan.durationInMonths || 1,
      currency: 'INR',
      keyId: pub.keyId,
      expiresAt,
      subscriptionId: existingSubId,
      paymentId: (payment._id || payment.id)?.toString(),
      receiptNo,
      isBalancePayment: true,
      prefill: {
        name: customer.name,
        email: customer.email || '',
        contact: customer.phone,
      },
      plan: {
        id: String(plan._id || plan.id),
        name: plan.name,
        packageTier: plan.packageTier,
        billingCycle: plan.billingCycle,
        totalPrice: fullPlanPrice,
        durationInMonths: existingSub.durationInMonths || plan.durationInMonths || 1,
      },
    };
  }

  /**
   * Verify Razorpay signature then ACID-activate subscription + mark payment PAID.
   */
  async verifyCheckoutPayment({
    sessionId,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  }) {
    const existing = await CheckoutSessionModel.findOne({ sessionId }).exec();
    if (!existing) this.throwNotFound('Checkout session');

    if (existing.status === CheckoutSessionStatus.PAID) {
      return this.#buildSuccessPayload(existing);
    }

    if (existing.status === CheckoutSessionStatus.FAILED) {
      this.throwBadRequest('Checkout session already failed');
    }

    if (existing.expiresAt && existing.expiresAt < new Date()) {
      await this.#markExpired(existing);
      this.throwBadRequest('Checkout session expired');
    }

    if (existing.razorpayOrderId !== orderId) {
      this.throwBadRequest('Razorpay order does not match checkout session');
    }

    this.razorpayService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    const activated = await withMongoTransaction(async (session) => {
      const checkout = await CheckoutSessionModel.findOne({ sessionId })
        .session(session)
        .exec();
      if (!checkout) this.throwNotFound('Checkout session');

      if (checkout.status === CheckoutSessionStatus.PAID) {
        return { checkout, alreadyPaid: true };
      }

      const paidAt = new Date();
      await this.paymentRepository.update(
        checkout.paymentTransactionId.toString(),
        {
          status: PaymentStatus.PAID,
          paidAt,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          failureReason: null,
        },
        { session },
      );

      const isBalancePayment = !!checkout.existingSubscriptionId;
      const subscriptionId = checkout.subscriptionId.toString();

      if (isBalancePayment) {
        // Update existing subscription's paidAmount and recalculate remainingAmount accurately
        const existingSub = await this.subscriptionRepository.findSubscriptionById(subscriptionId);
        const totalPlanPrice = roundMoney(Number(existingSub?.totalPlanPrice || checkout.planTotalPrice || 0));
        const newPaidAmount = roundMoney(Number(existingSub?.paidAmount || 0) + Number(checkout.amount));
        const newRemainingAmount = roundMoney(Math.max(0, totalPlanPrice - newPaidAmount));

        await this.subscriptionRepository.updateSubscription(
          subscriptionId,
          {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            lastPaymentDate: paidAt,
            status: SubscriptionStatus.ACTIVE,
          },
          { session },
        );
      } else {
        await this.subscriptionRepository.updateSubscription(
          subscriptionId,
          {
            status: SubscriptionStatus.ACTIVE,
            lastPaymentDate: paidAt,
          },
          { session },
        );
      }

      await this.clientRepository.updateStatus(
        checkout.clientId.toString(),
        ClientStatus.ACTIVE,
        { session },
      );

      checkout.status = CheckoutSessionStatus.PAID;
      checkout.failureReason = null;
      await checkout.save({ session });

      return { checkout, alreadyPaid: false };
    });

    try {
      await this.redisService.del(`checkout:session:${sessionId}`);
      await this.redisService.del('payment:summary');
      await this.redisService.del('sub:summary');
      await this.redisService.del(`client:${activated.checkout.clientId}`);
    } catch {
      // Redis optional
    }

    if (!activated.alreadyPaid) {
      this.#enqueuePostPaymentJobs(activated.checkout).catch(() => { });
    }

    return this.#buildSuccessPayload(activated.checkout);
  }

  async failCheckout({ sessionId, reason }) {
    const result = await withMongoTransaction(async (session) => {
      const checkout = await CheckoutSessionModel.findOne({ sessionId })
        .session(session)
        .exec();
      if (!checkout) this.throwNotFound('Checkout session');

      if (
        checkout.status === CheckoutSessionStatus.PAID ||
        checkout.status === CheckoutSessionStatus.FAILED
      ) {
        return checkout;
      }

      const failureReason = reason || 'Payment cancelled or failed';

      await this.paymentRepository.update(
        checkout.paymentTransactionId.toString(),
        {
          status: PaymentStatus.FAILED,
          failureReason,
        },
        { session },
      );

      // Only cancel the subscription if it is NOT a balance payment on an existing sub
      const isBalancePayment = !!checkout.existingSubscriptionId;
      if (!isBalancePayment) {
        await this.subscriptionRepository.updateSubscription(
          checkout.subscriptionId.toString(),
          { status: SubscriptionStatus.CANCELLED },
          { session },
        );
      }

      checkout.status = CheckoutSessionStatus.FAILED;
      checkout.failureReason = failureReason;
      await checkout.save({ session });
      return checkout;
    });

    try {
      await this.redisService.del(`checkout:session:${sessionId}`);
      await this.redisService.del('payment:summary');
    } catch {
      // optional
    }

    return {
      sessionId: result.sessionId,
      status: result.status,
      failureReason: result.failureReason,
    };
  }

  async getCheckoutSession(sessionId) {
    const checkout = await CheckoutSessionModel.findOne({ sessionId }).exec();
    if (!checkout) this.throwNotFound('Checkout session');

    if (
      checkout.status === CheckoutSessionStatus.PENDING &&
      checkout.expiresAt < new Date()
    ) {
      await this.#markExpired(checkout);
      return {
        sessionId,
        status: CheckoutSessionStatus.EXPIRED,
        expiresAt: checkout.expiresAt,
      };
    }

    return {
      sessionId: checkout.sessionId,
      status: checkout.status,
      amount: checkout.amount,
      planTotalPrice: checkout.planTotalPrice,
      remainingAmount: checkout.remainingAmount,
      durationInMonths: checkout.durationInMonths,
      amountPaise: checkout.amountPaise,
      currency: checkout.currency,
      orderId: checkout.razorpayOrderId,
      planId: checkout.planId?.toString?.(),
      subscriptionId: checkout.subscriptionId?.toString?.(),
      paymentTransactionId: checkout.paymentTransactionId?.toString?.(),
      failureReason: checkout.failureReason,
      expiresAt: checkout.expiresAt,
    };
  }

  async handleRazorpayWebhook(rawBody, signatureHeader) {
    this.razorpayService.verifyWebhookSignature(rawBody, signatureHeader);
    const event = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    const eventName = event?.event;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    if (!orderId) {
      return { handled: false, reason: 'No order id' };
    }

    const checkout = await CheckoutSessionModel.findOne({
      razorpayOrderId: orderId,
    }).exec();
    if (!checkout) {
      return { handled: false, reason: 'Checkout session not found' };
    }

    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      if (checkout.status === CheckoutSessionStatus.PAID) {
        return { handled: true, status: 'PAID', idempotent: true };
      }
      // Webhook without FE signature — mark paid via order match + ACID activate
      await withMongoTransaction(async (session) => {
        const doc = await CheckoutSessionModel.findOne({
          sessionId: checkout.sessionId,
        })
          .session(session)
          .exec();
        if (!doc || doc.status === CheckoutSessionStatus.PAID) return;

        const paidAt = new Date();
        await this.paymentRepository.update(
          doc.paymentTransactionId.toString(),
          {
            status: PaymentStatus.PAID,
            paidAt,
            razorpayPaymentId: paymentEntity.id,
            failureReason: null,
          },
          { session },
        );
        await this.subscriptionRepository.updateSubscription(
          doc.subscriptionId.toString(),
          {
            status: SubscriptionStatus.ACTIVE,
            lastPaymentDate: paidAt,
          },
          { session },
        );
        await this.clientRepository.updateStatus(
          doc.clientId.toString(),
          ClientStatus.ACTIVE,
          { session },
        );
        doc.status = CheckoutSessionStatus.PAID;
        await doc.save({ session });
      });

      this.#enqueuePostPaymentJobs(checkout).catch(() => { });
      return { handled: true, status: 'PAID' };
    }

    if (eventName === 'payment.failed') {
      await this.failCheckout({
        sessionId: checkout.sessionId,
        reason: paymentEntity?.error_description || 'Razorpay payment failed',
      });
      return { handled: true, status: 'FAILED' };
    }

    return { handled: false, reason: `Unhandled event ${eventName}` };
  }

  async #enqueuePostPaymentJobs(checkoutDoc) {
    if (!this.postPaymentQueueService || !checkoutDoc) return;
    try {
      const paymentId = checkoutDoc.paymentTransactionId?.toString();
      const clientId = checkoutDoc.clientId?.toString();
      const subscriptionId = checkoutDoc.subscriptionId?.toString();
      const amount = checkoutDoc.amount;
      const sessionId = checkoutDoc.sessionId;
      const customer = checkoutDoc.customer || {};

      let planName = 'CCTV Subscription Plan';
      if (checkoutDoc.planId && this.subscriptionRepository?.findPlanById) {
        try {
          const plan = await this.subscriptionRepository.findPlanById(checkoutDoc.planId);
          if (plan?.name) planName = plan.name;
        } catch {
          // Best effort plan lookup
        }
      }

      // Create in-app admin notifications directly in MongoDB
      try {
        const admins = await UserModel.find({
          role: { $in: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER', 'OPERATIONS_TEAM'] },
          status: 'ACTIVE',
        }).select('_id').lean().exec();

        if (admins.length > 0) {
          const displayName = customer.businessName || customer.name || 'Website Client';
          const formattedAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
          const notifications = admins.map((admin) => ({
            recipient: admin._id,
            title: 'Website Payment Received',
            message: `${displayName} paid ${formattedAmount} via Razorpay Online for plan "${planName}"`,
            type: 'PAYMENT',
            priority: 'HIGH',
            channel: 'IN_APP',
            actionUrl: `/payments/${paymentId}`,
            metadata: { paymentId, clientId, amount, planName, sessionId },
            isRead: false,
          }));
          await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => { });
        }
      } catch (directNotifErr) {
        // Direct notification best-effort
      }

      if (this.postPaymentQueueService) {
        await this.postPaymentQueueService.addAdminNotificationJob({
          paymentId,
          clientId,
          amount,
          receiptNo: `RCPT-${sessionId?.slice(0, 8) || 'ONLINE'}`,
          planName,
          sessionId,
          customerName: customer.name,
          businessName: customer.businessName
        }).catch(() => { });

        await this.postPaymentQueueService.addInvoicePipelineJob({
          paymentId,
          clientId,
          subscriptionId,
          amount,
          planName,
          sessionId,
          customer
        }).catch(() => { });
      }
    } catch {
      // Non-blocking background job enqueuing
    }
  }

  #normalizeCustomer(payload) {
    const rawPhone = String(payload.phone || '').trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');
    const phone = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
    const name = String(payload.name || '').trim();
    const businessName = String(payload.businessName || '').trim();
    const address = String(payload.address || '').trim();
    const city = String(payload.city || '').trim();
    const pincode = String(payload.pincode || '').trim();

    if (name.length < 2) this.throwBadRequest('Name is required');
    if (phone.length < 10) {
      this.throwBadRequest('Valid 10-digit mobile phone number is required');
    }
    if (businessName.length < 2) this.throwBadRequest('Business name is required');
    if (address.length < 5) this.throwBadRequest('Address is required');
    if (city.length < 2) this.throwBadRequest('City is required');
    if (!/^\d{6}$/.test(pincode)) this.throwBadRequest('Pincode must be 6 digits');

    return {
      name,
      phone,
      email: payload.email ? String(payload.email).trim().toLowerCase() : '',
      businessName,
      address,
      city,
      pincode,
      gstin: normalizeGstin(payload.gstin) || '',
      state: payload.state ? String(payload.state).trim() : 'Madhya Pradesh',
    };
  }

  async #generateReceiptNo() {
    const day = new Date();
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const prefix = `RCPT-${y}${m}${d}`;
    for (let i = 0; i < 5; i += 1) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const receiptNo = `${prefix}-${suffix}`;
      const existing = await this.paymentRepository.findByReceiptNo(receiptNo);
      if (!existing) return receiptNo;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  async #markExpired(checkout) {
    await withMongoTransaction(async (session) => {
      const doc = await CheckoutSessionModel.findOne({
        sessionId: checkout.sessionId,
      })
        .session(session)
        .exec();
      if (!doc || doc.status !== CheckoutSessionStatus.PENDING) return;

      await this.paymentRepository.update(
        doc.paymentTransactionId.toString(),
        {
          status: PaymentStatus.FAILED,
          failureReason: 'Checkout session expired',
        },
        { session },
      );
      await this.subscriptionRepository.updateSubscription(
        doc.subscriptionId.toString(),
        { status: SubscriptionStatus.CANCELLED },
        { session },
      );
      doc.status = CheckoutSessionStatus.EXPIRED;
      doc.failureReason = 'Checkout session expired';
      await doc.save({ session });
    });
  }

  async #buildSuccessPayload(checkoutDoc) {
    const payment = await this.paymentRepository.findById(
      checkoutDoc.paymentTransactionId.toString(),
    );
    const paymentObj = payment?.toJSON ? payment.toJSON() : payment;
    return {
      sessionId: checkoutDoc.sessionId,
      status: CheckoutSessionStatus.PAID,
      payment: paymentObj,
      subscriptionId: checkoutDoc.subscriptionId?.toString?.(),
      clientId: checkoutDoc.clientId?.toString?.(),
      receiptNo: paymentObj?.receiptNo,
      amount: checkoutDoc.amount,
      planTotalPrice: checkoutDoc.planTotalPrice,
      remainingAmount: checkoutDoc.remainingAmount,
      durationInMonths: checkoutDoc.durationInMonths,
    };
  }
}
