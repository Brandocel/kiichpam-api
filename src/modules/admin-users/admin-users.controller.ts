import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { IntegrationProtected } from '../../common/decorators/integration-protected.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ValidateCredentialsDto } from './dto/validate-credentials.dto';

@ApiTags('Admin Users')
@Controller('admin-users')
@IntegrationProtected()
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios del panel administrativo' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un usuario del panel administrativo' })
  create(@Body() dto: CreateAdminUserDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un usuario del panel administrativo' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un usuario del panel administrativo' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('validate-credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar credenciales de acceso al panel (usado por el login)',
  })
  async validateCredentials(@Body() dto: ValidateCredentialsDto) {
    const user = await this.service.validateCredentials(
      dto.email,
      dto.password,
    );

    return {
      valid: Boolean(user),
      user,
    };
  }
}
