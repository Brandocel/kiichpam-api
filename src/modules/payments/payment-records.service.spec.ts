import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';

import { PaymentRecordsService } from './payment-records.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PaymentRecordsService', () => {
  let service: PaymentRecordsService;
  let upsert: jest.Mock;

  const reservation = {
    id: 'reservation-id',
    folio: 'RSV-260310-BNEJ68',
  };

  const buildPaymentIntent = (
    overrides: Partial<Stripe.PaymentIntent> = {},
  ): Stripe.PaymentIntent =>
    ({
      id: 'pi_123',
      status: 'succeeded',
      amount: 259600,
      amount_received: 259600,
      currency: 'mxn',
      payment_method_types: ['card'],
      metadata: {},
      ...overrides,
    }) as Stripe.PaymentIntent;

  beforeEach(async () => {
    upsert = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRecordsService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              upsert,
            },
          },
        },
      ],
    }).compile();

    service = module.get<PaymentRecordsService>(PaymentRecordsService);
  });

  it('registra el pago exitoso con el monto en centavos', async () => {
    await service.registerFromPaymentIntent(reservation, buildPaymentIntent());

    expect(upsert).toHaveBeenCalledTimes(1);

    const args = upsert.mock.calls[0][0];

    expect(args.where).toEqual({
      reservationId_reference: {
        reservationId: reservation.id,
        reference: 'pi_123',
      },
    });

    expect(args.create).toMatchObject({
      reservationId: reservation.id,
      provider: 'STRIPE',
      method: 'CARD',
      status: 'SUCCEEDED',
      amountMXN: 259600,
      reference: 'pi_123',
    });
  });

  it('identifica los pagos OXXO por metadata', async () => {
    await service.registerFromPaymentIntent(
      reservation,
      buildPaymentIntent({
        status: 'requires_action',
        amount_received: 0,
        payment_method_types: ['oxxo'],
        metadata: { paymentType: 'oxxo' },
      }),
    );

    expect(upsert.mock.calls[0][0].create).toMatchObject({
      method: 'OXXO',
      status: 'REQUIRES_ACTION',
      amountMXN: 259600,
    });
  });

  it('no interrumpe el flujo de pago si falla el guardado', async () => {
    upsert.mockRejectedValueOnce(new Error('db caída'));

    await expect(
      service.registerFromPaymentIntent(reservation, buildPaymentIntent()),
    ).resolves.toBeUndefined();
  });
});
