import {
    BadRequestException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
  import { CreateProposalReservationDto } from './dto/create-proposal-reservation.dto';
  
  type ProposalPackage = {
    code: string;
    name: string;
    durationMinutes: number;
    isActive: boolean;
  };
  
  @Injectable()
  export class ProposalReservationsService {
    constructor(private readonly googleCalendarService: GoogleCalendarService) {}
  
    private readonly proposalPackages: ProposalPackage[] = [
      {
        code: 'amor-de-verano',
        name: 'Amor de Verano',
        durationMinutes: 120,
        isActive: true,
      },
      {
        code: 'tesoro-de-amor',
        name: 'Tesoro de Amor',
        durationMinutes: 120,
        isActive: true,
      },
      {
        code: 'fragancia-de-amor',
        name: 'Fragancia de Amor',
        durationMinutes: 120,
        isActive: true,
      },
      {
        code: 'amor-eterno',
        name: 'Amor Eterno',
        durationMinutes: 120,
        isActive: true,
      },
    ];
  
    findAllPackages() {
      return {
        success: true,
        message: 'Proposal packages fetched successfully',
        data: this.proposalPackages.filter((item) => item.isActive),
      };
    }
  
    async create(dto: CreateProposalReservationDto) {
      const selectedPackage = this.proposalPackages.find(
        (item) => item.code === dto.packageCode && item.isActive,
      );
  
      if (!selectedPackage) {
        throw new NotFoundException('Proposal package not found');
      }
  
      this.validateTimeRange(dto.startTime, dto.endTime);
  
      const folio = this.generateFolio();
  
      const calendarResult =
        await this.googleCalendarService.upsertProposalReservationEvent({
          folio,
          packageCode: selectedPackage.code,
          packageName: selectedPackage.name,
          customerName: dto.customerName,
          partnerName: dto.partnerName,
          email: dto.email,
          phone: dto.phone,
          reservationDate: dto.reservationDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          guests: dto.guests ?? 2,
          notes: dto.notes,
        });
  
      return {
        success: true,
        message: 'Proposal reservation created successfully',
        data: {
          folio,
          package: selectedPackage,
          customerName: dto.customerName,
          partnerName: dto.partnerName ?? null,
          email: dto.email,
          phone: dto.phone,
          reservationDate: dto.reservationDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          guests: dto.guests ?? 2,
          notes: dto.notes ?? null,
          calendar: calendarResult,
        },
      };
    }
  
    private validateTimeRange(startTime: string, endTime: string) {
      const start = this.toMinutes(startTime);
      const end = this.toMinutes(endTime);
  
      if (end <= start) {
        throw new BadRequestException(
          'endTime must be greater than startTime',
        );
      }
    }
  
    private toMinutes(time: string): number {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    }
  
    private generateFolio() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      const dd = `${now.getDate()}`.padStart(2, '0');
      const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  
      return `PM-${yyyy}${mm}${dd}-${random}`;
    }
  }