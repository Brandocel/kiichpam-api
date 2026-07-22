import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole, AdminUser } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { hashPassword, verifyPassword } from './password.util';

/**
 * Forma pública de un usuario administrativo (sin el hash de la contraseña).
 */
export type SafeAdminUser = Omit<AdminUser, 'password'>;

@Injectable()
export class AdminUsersService implements OnModuleInit {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Al iniciar el módulo, crea el SUPER_ADMIN inicial si la tabla está vacía
   * y hay credenciales de seed configuradas. Evita que el panel quede sin acceso.
   */
  async onModuleInit(): Promise<void> {
    try {
      const email = this.configService
        .get<string>('adminSeed.email')
        ?.trim()
        .toLowerCase();
      const password = this.configService.get<string>('adminSeed.password');
      const name =
        this.configService.get<string>('adminSeed.name') ?? 'Administrador';

      if (!email || !password) {
        return;
      }

      const total = await this.prisma.adminUser.count();

      if (total > 0) {
        return;
      }

      await this.prisma.adminUser.create({
        data: {
          name,
          email,
          password: hashPassword(password),
          role: AdminRole.SUPER_ADMIN,
          isActive: true,
        },
      });

      this.logger.log(`SUPER_ADMIN inicial creado para ${email}`);
    } catch (error) {
      this.logger.error('No se pudo ejecutar el seed de AdminUser', error);
    }
  }

  async findAll(): Promise<SafeAdminUser[]> {
    const users = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => this.toSafe(user));
  }

  async create(dto: CreateAdminUserDto): Promise<SafeAdminUser> {
    const email = dto.email.trim().toLowerCase();

    await this.ensureEmailIsFree(email);

    const user = await this.prisma.adminUser.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashPassword(dto.password),
        role: dto.role,
        isActive: true,
      },
    });

    return this.toSafe(user);
  }

  async update(id: string, dto: UpdateAdminUserDto): Promise<SafeAdminUser> {
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const data: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();

      if (email !== existing.email) {
        await this.ensureEmailIsFree(email);
      }

      data.email = email;
    }

    if (dto.password !== undefined) {
      data.password = hashPassword(dto.password);
    }

    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    // Evitar quedarse sin administrador: si este cambio degradaría o
    // desactivaría al último SUPER_ADMIN activo, lo bloqueamos.
    const willLoseSuperAdmin =
      (dto.role !== undefined && dto.role !== AdminRole.SUPER_ADMIN) ||
      dto.isActive === false;

    if (willLoseSuperAdmin) {
      await this.ensureNotLastSuperAdmin(existing);
    }

    const user = await this.prisma.adminUser.update({
      where: { id },
      data,
    });

    return this.toSafe(user);
  }

  async remove(id: string): Promise<SafeAdminUser> {
    const existing = await this.prisma.adminUser.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    await this.ensureNotLastSuperAdmin(existing);

    const user = await this.prisma.adminUser.delete({ where: { id } });

    return this.toSafe(user);
  }

  /**
   * Lanza un error si el usuario es el último SUPER_ADMIN activo del sistema,
   * para no dejar el panel sin administrador.
   */
  private async ensureNotLastSuperAdmin(user: AdminUser): Promise<void> {
    const isActiveSuperAdmin =
      user.role === AdminRole.SUPER_ADMIN && user.isActive;

    if (!isActiveSuperAdmin) {
      return;
    }

    const otherActiveSuperAdmins = await this.prisma.adminUser.count({
      where: {
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
        id: { not: user.id },
      },
    });

    if (otherActiveSuperAdmins === 0) {
      throw new BadRequestException(
        'No puedes degradar, desactivar ni eliminar al último SUPER_ADMIN activo. Crea o asciende otro administrador primero.',
      );
    }
  }

  /**
   * Valida email + contraseña. Devuelve el usuario (sin password) si es válido
   * y está activo; de lo contrario null. Usado por el login del panel.
   */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<SafeAdminUser | null> {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isActive) {
      return null;
    }

    if (!verifyPassword(password, user.password)) {
      return null;
    }

    return this.toSafe(user);
  }

  private async ensureEmailIsFree(email: string): Promise<void> {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }
  }

  private toSafe(user: AdminUser): SafeAdminUser {
    const { password: _password, ...safe } = user;

    return safe;
  }
}
