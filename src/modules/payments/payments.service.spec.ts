import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PaymentRecordsService } from './payment-records.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { ReservationMailService } from '../reservations/reservation-mail.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mocked_key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findFirst: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
            },
            reservation: {
              update: jest.fn(),
            },
          },
        },
        {
          provide: GoogleCalendarService,
          useValue: {
            upsertReservationEvent: jest.fn(),
            cancelReservationEventByFolio: jest.fn(),
          },
        },
        {
          provide: ReservationMailService,
          useValue: {
            sendReservationPaidEmails: jest.fn(),
          },
        },
        {
          provide: PaymentRecordsService,
          useValue: {
            registerFromPaymentIntent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
