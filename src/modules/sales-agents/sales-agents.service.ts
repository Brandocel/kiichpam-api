import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, Prisma, SalesAgent } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../admin-users/password.util';
import { CreateSalesAgentDto } from './dto/create-sales-agent.dto';
import { QuerySalesAgentPerformanceDto } from './dto/query-sales-agent-performance.dto';
import { UpdateSalesAgentDto } from './dto/update-sales-agent.dto';

/**
 * Estados de reservación que cuentan como venta cerrada. La comisión solo se
 * devenga sobre estos; el resto se reporta como "en proceso".
 */
const CLOSED_STATUSES = ['PAID'];

/**
 * Forma pública del agente: lo único que la web puede ver sin autenticación
 * al resolver un link de venta. Nunca expone comisión ni datos de contacto.
 */
export type PublicSalesAgent = {
  code: string;
  name: string;
  company: string | null;
  type: SalesAgent['type'];
};

/**
 * Alfabeto del token público: sin 0/O/1/I/L para que nadie confunda
 * caracteres al dictarlo o transcribirlo por teléfono.
 */
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 8;

@Injectable()
export class SalesAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const agents = await this.prisma.salesAgent.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      include: {
        adminUser: { select: { id: true, email: true, isActive: true } },
      },
    });

    const counts = await this.prisma.reservation.groupBy({
      by: ['salesAgentId'],
      where: {
        salesAgentId: { not: null },
      },
      _count: { _all: true },
    });

    const countByAgent = new Map(
      counts.map((row) => [row.salesAgentId, row._count._all]),
    );

    return agents.map((agent) => ({
      ...agent,
      reservationsCount: countByAgent.get(agent.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    const agent = await this.prisma.salesAgent.findUnique({ where: { id } });

    if (!agent) {
      throw new NotFoundException('Agente no encontrado.');
    }

    return agent;
  }

  async create(dto: CreateSalesAgentDto) {
    const code = this.normalizeCode(dto.code ?? dto.name);
    const email = dto.email?.trim().toLowerCase() || null;

    await this.ensureCodeIsFree(code);

    // Cuenta de panel: solo si mandan contraseña. Requiere correo porque es
    // el identificador con el que se inicia sesión.
    let adminUserId: string | null = null;

    if (dto.panelPassword) {
      if (!email) {
        throw new BadRequestException(
          'Para darle acceso al panel, el agente necesita un correo.',
        );
      }

      adminUserId = await this.createPanelAccount(
        dto.name.trim(),
        email,
        dto.panelPassword,
      );
    }

    return this.prisma.salesAgent.create({
      data: {
        code,
        linkToken: await this.generateUniqueLinkToken(),
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        company: dto.company?.trim() || null,
        type: dto.type ?? 'INTERNAL',
        commissionPercent: dto.commissionPercent ?? 0,
        notes: dto.notes?.trim() || null,
        isActive: true,
        adminUserId,
      },
      include: { adminUser: { select: { id: true, email: true, isActive: true } } },
    });
  }

  /**
   * Crea la cuenta con la que el agente entra al panel. El rol AGENT existe
   * para poder distinguirlo del personal interno y para que la atribución de
   * lo que captura salga de su sesión.
   */
  private async createPanelAccount(
    name: string,
    email: string,
    password: string,
  ): Promise<string> {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una cuenta de panel con el correo ${email}.`,
      );
    }

    const user = await this.prisma.adminUser.create({
      data: {
        name,
        email,
        password: hashPassword(password),
        role: AdminRole.AGENT,
        isActive: true,
      },
    });

    return user.id;
  }

  /**
   * Devuelve el agente ligado a una cuenta del panel. Lo usa el login para
   * meter el código del agente en la sesión: así el panel puede atribuir sin
   * que el agente pueda elegir a nombre de quién registra.
   */
  async findByAdminUserId(adminUserId: string) {
    const agent = await this.prisma.salesAgent.findUnique({
      where: { adminUserId },
      select: { code: true, name: true, isActive: true, commissionPercent: true },
    });

    if (!agent || !agent.isActive) {
      return null;
    }

    return agent;
  }

  async update(id: string, dto: UpdateSalesAgentDto) {
    const existing = await this.prisma.salesAgent.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Agente no encontrado.');
    }

    const data: Prisma.SalesAgentUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);

      if (code !== existing.code) {
        await this.ensureCodeIsFree(code);
      }

      data.code = code;
    }

    if (dto.email !== undefined) {
      data.email = dto.email.trim().toLowerCase() || null;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (dto.company !== undefined) {
      data.company = dto.company.trim() || null;
    }

    if (dto.type !== undefined) {
      data.type = dto.type;
    }

    if (dto.commissionPercent !== undefined) {
      data.commissionPercent = dto.commissionPercent;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }

    // Acceso al panel: alta de cuenta, cambio de contraseña o revocación.
    if (dto.panelPassword) {
      const email =
        (dto.email?.trim().toLowerCase() || existing.email) ?? null;

      if (!email) {
        throw new BadRequestException(
          'Para darle acceso al panel, el agente necesita un correo.',
        );
      }

      if (existing.adminUserId) {
        await this.prisma.adminUser.update({
          where: { id: existing.adminUserId },
          data: {
            password: hashPassword(dto.panelPassword),
            email,
            isActive: true,
          },
        });
      } else {
        data.adminUser = {
          connect: {
            id: await this.createPanelAccount(
              dto.name?.trim() || existing.name,
              email,
              dto.panelPassword,
            ),
          },
        };
      }
    }

    // Revocar el acceso desactiva la cuenta pero no la borra, para no perder
    // el rastro de quién capturó cada reservación.
    if (dto.panelAccessEnabled !== undefined && existing.adminUserId) {
      await this.prisma.adminUser.update({
        where: { id: existing.adminUserId },
        data: { isActive: dto.panelAccessEnabled },
      });
    }

    const updated = await this.prisma.salesAgent.update({
      where: { id },
      data,
      include: {
        adminUser: { select: { id: true, email: true, isActive: true } },
      },
    });

    // Si cambió el código, realineamos el snapshot de las reservaciones que
    // siguen apuntando a este agente para que los filtros por código no se
    // rompan. El histórico de agentes borrados no se toca.
    if (data.code && updated.code !== existing.code) {
      await this.prisma.reservation.updateMany({
        where: { salesAgentId: id },
        data: { salesAgentCode: updated.code },
      });
    }

    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.salesAgent.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Agente no encontrado.');
    }

    // Las reservaciones conservan salesAgentCode y agentCommissionPercent
    // (onDelete: SetNull sobre salesAgentId), así que el histórico sobrevive.
    return this.prisma.salesAgent.delete({ where: { id } });
  }

  /**
   * Regenera el token público. Útil si un link se filtró o si el agente
   * quiere dejar de usar el anterior. El `code` no cambia, así que el
   * histórico y los reportes siguen intactos.
   */
  async regenerateLinkToken(id: string) {
    const existing = await this.prisma.salesAgent.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Agente no encontrado.');
    }

    return this.prisma.salesAgent.update({
      where: { id },
      data: { linkToken: await this.generateUniqueLinkToken() },
    });
  }

  /**
   * Resuelve un agente activo a partir del valor que viene en `?ag=`.
   *
   * Acepta tanto el token público como el código legible: los links repartidos
   * antes de que existiera el token siguen atribuyendo igual. Devuelve null si
   * no existe o está desactivado, de modo que un link viejo nunca rompe la
   * compra: solo deja de atribuir.
   */
  async resolveActiveByCode(code?: string | null): Promise<SalesAgent | null> {
    const normalized = this.normalizeCode(code ?? '');

    if (!normalized) {
      return null;
    }

    const agent = await this.prisma.salesAgent.findFirst({
      where: {
        OR: [{ linkToken: normalized }, { code: normalized }],
      },
    });

    if (!agent || !agent.isActive) {
      return null;
    }

    return agent;
  }

  /**
   * Versión pública para que la web valide un link y salude al visitante con
   * el nombre del agente. No expone comisión, correo ni teléfono.
   */
  async findPublicByCode(code: string): Promise<PublicSalesAgent> {
    const agent = await this.resolveActiveByCode(code);

    if (!agent) {
      throw new NotFoundException('Agente no encontrado o inactivo.');
    }

    return {
      code: agent.code,
      name: agent.name,
      company: agent.company,
      type: agent.type,
    };
  }

  /**
   * Ranking de ventas por agente en un rango de fechas de visita.
   * Los montos se devuelven en pesos (la base los guarda en centavos).
   */
  async performance(query: QuerySalesAgentPerformanceDto) {
    const visitDateFilter = this.buildVisitDateFilter(query.from, query.to);
    const agentCode = this.normalizeCode(query.agentCode ?? '');

    const reservations = await this.prisma.reservation.findMany({
      where: {
        salesAgentCode: agentCode ? agentCode : { not: null },
        ...(Object.keys(visitDateFilter).length > 0
          ? { visitDate: visitDateFilter }
          : {}),
      },
      select: {
        salesAgentCode: true,
        salesAgentId: true,
        agentCommissionPercent: true,
        status: true,
        totalMXN: true,
        adults: true,
        children: true,
        infants: true,
      },
    });

    const agents = await this.prisma.salesAgent.findMany();
    const agentByCode = new Map(agents.map((agent) => [agent.code, agent]));

    type Bucket = {
      code: string;
      name: string;
      company: string | null;
      type: string;
      isActive: boolean;
      commissionPercent: number;
      reservations: number;
      closedReservations: number;
      pax: number;
      revenueCents: number;
      closedRevenueCents: number;
      commissionCents: number;
    };

    const buckets = new Map<string, Bucket>();

    for (const reservation of reservations) {
      const code = reservation.salesAgentCode;

      if (!code) {
        continue;
      }

      const agent = agentByCode.get(code);

      const bucket: Bucket = buckets.get(code) ?? {
        code,
        name: agent?.name ?? code,
        company: agent?.company ?? null,
        type: agent?.type ?? 'OTHER',
        isActive: agent?.isActive ?? false,
        commissionPercent: agent?.commissionPercent ?? 0,
        reservations: 0,
        closedReservations: 0,
        pax: 0,
        revenueCents: 0,
        closedRevenueCents: 0,
        commissionCents: 0,
      };

      const isClosed = CLOSED_STATUSES.includes(reservation.status);

      bucket.reservations += 1;
      bucket.pax +=
        reservation.adults + reservation.children + reservation.infants;
      bucket.revenueCents += reservation.totalMXN;

      if (isClosed) {
        bucket.closedReservations += 1;
        bucket.closedRevenueCents += reservation.totalMXN;

        // El porcentaje congelado en la reservación manda; el del agente solo
        // es respaldo para filas creadas antes de tener snapshot.
        const percent =
          reservation.agentCommissionPercent ?? agent?.commissionPercent ?? 0;

        bucket.commissionCents += Math.round(
          (reservation.totalMXN * percent) / 100,
        );
      }

      buckets.set(code, bucket);
    }

    const rows = Array.from(buckets.values())
      .map((bucket) => ({
        code: bucket.code,
        name: bucket.name,
        company: bucket.company,
        type: bucket.type,
        isActive: bucket.isActive,
        commissionPercent: bucket.commissionPercent,
        reservations: bucket.reservations,
        closedReservations: bucket.closedReservations,
        pax: bucket.pax,
        revenueMXN: this.centsToPesos(bucket.revenueCents),
        closedRevenueMXN: this.centsToPesos(bucket.closedRevenueCents),
        commissionMXN: this.centsToPesos(bucket.commissionCents),
        closeRate:
          bucket.reservations > 0
            ? bucket.closedReservations / bucket.reservations
            : 0,
      }))
      .sort((a, b) => b.closedRevenueMXN - a.closedRevenueMXN);

    const totals = rows.reduce(
      (acc, row) => ({
        agents: acc.agents + 1,
        reservations: acc.reservations + row.reservations,
        closedReservations: acc.closedReservations + row.closedReservations,
        pax: acc.pax + row.pax,
        revenueMXN: acc.revenueMXN + row.revenueMXN,
        closedRevenueMXN: acc.closedRevenueMXN + row.closedRevenueMXN,
        commissionMXN: acc.commissionMXN + row.commissionMXN,
      }),
      {
        agents: 0,
        reservations: 0,
        closedReservations: 0,
        pax: 0,
        revenueMXN: 0,
        closedRevenueMXN: 0,
        commissionMXN: 0,
      },
    );

    return {
      range: {
        from: query.from ?? null,
        to: query.to ?? null,
      },
      totals,
      rows,
    };
  }

  private buildVisitDateFilter(from?: string, to?: string) {
    const filter: { gte?: Date; lte?: Date } = {};

    if (from) {
      const fromDate = new Date(from);

      if (!Number.isNaN(fromDate.getTime())) {
        fromDate.setHours(0, 0, 0, 0);
        filter.gte = fromDate;
      }
    }

    if (to) {
      const toDate = new Date(to);

      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        filter.lte = toDate;
      }
    }

    return filter;
  }

  /**
   * Normaliza el código a un slug seguro para URL: mayúsculas, sin acentos y
   * con guiones. Así "María López" y "maria lopez" resuelven al mismo agente.
   */
  private normalizeCode(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  /**
   * Token aleatorio verificando que no exista ya. El espacio es de 31^8
   * (~850 mil millones), así que una colisión es casi imposible, pero se
   * reintenta igual antes que arriesgar un choque en el índice único.
   */
  private async generateUniqueLinkToken(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = this.randomToken();

      const existing = await this.prisma.salesAgent.findUnique({
        where: { linkToken: token },
      });

      if (!existing) {
        return token;
      }
    }

    throw new ConflictException(
      'No se pudo generar un link único para el agente. Intenta de nuevo.',
    );
  }

  private randomToken(): string {
    const bytes = randomBytes(TOKEN_LENGTH);

    let token = '';

    for (let index = 0; index < TOKEN_LENGTH; index += 1) {
      token += TOKEN_ALPHABET[bytes[index] % TOKEN_ALPHABET.length];
    }

    return token;
  }

  private async ensureCodeIsFree(code: string): Promise<void> {
    if (!code) {
      throw new ConflictException(
        'El código del agente no puede quedar vacío. Usa letras o números.',
      );
    }

    const existing = await this.prisma.salesAgent.findUnique({
      where: { code },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un agente con el código ${code}.`);
    }
  }

  private centsToPesos(value: number): number {
    return Math.round(value) / 100;
  }
}
