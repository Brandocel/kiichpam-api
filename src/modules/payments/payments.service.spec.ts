import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma/prisma.service';

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
            },
            reservation: {
              update: jest.fn(),
            },
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