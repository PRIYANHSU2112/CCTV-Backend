import { createContainer, asClass, asValue } from 'awilix';
import { PaymentRepository } from './payment.repository.js';
import { PaymentService } from './payment.service.js';
import { CheckoutService } from './checkout.service.js';
import { RazorpayService } from './razorpay.service.js';
import { PaymentController } from './payment.controller.js';
import { createPaymentRouter } from './payment.routes.js';
import { paymentSwaggerDocs } from './payment.swagger.js';

import { PdfService } from '../invoice/pdf.service.js';
import { S3Service } from '../../shared/storage/s3.service.js';

export const initPaymentModule = ({
  redisService,
  clientRepository,
  subscriptionRepository = null,
  userRepository,
  hashService,
  postPaymentQueueService = null,
}) => {
  const moduleContainer = createContainer();

  moduleContainer.register({
    redisService: asValue(redisService),
    clientRepository: asValue(clientRepository),
    subscriptionRepository: asValue(subscriptionRepository),
    userRepository: asValue(userRepository),
    hashService: asValue(hashService),
    postPaymentQueueService: asValue(postPaymentQueueService),
  });

  moduleContainer.register({
    pdfService: asClass(PdfService).singleton(),
    s3Service: asClass(S3Service).singleton(),
    razorpayService: asClass(RazorpayService).singleton(),
    paymentRepository: asClass(PaymentRepository).singleton(),
    paymentService: asClass(PaymentService).scoped(),
    checkoutService: asClass(CheckoutService).scoped(),
    paymentController: asClass(PaymentController).scoped(),
  });

  const paymentController = moduleContainer.resolve('paymentController');
  const router = createPaymentRouter(paymentController);

  return {
    router,
    container: moduleContainer,
    swaggerDocs: paymentSwaggerDocs,
  };
};

export {
  PaymentService,
  CheckoutService,
  PaymentController,
  PaymentRepository,
  RazorpayService,
};
