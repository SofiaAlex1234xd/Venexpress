import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) { }

  @Post()
  @Roles(UserRole.VENDEDOR, UserRole.ADMIN_COLOMBIA)
  create(@Body() createClientDto: CreateClientDto, @CurrentUser('id') userId: number) {
    return this.clientsService.create(createClientDto, userId);
  }

  @Get()
  @Roles(UserRole.VENDEDOR, UserRole.ADMIN_COLOMBIA, UserRole.ADMIN_VENEZUELA)
  findAll(
    @Query('search') search?: string,
    @Query('vendorId') vendorId?: number,
    @CurrentUser('id') userId?: number,
    @CurrentUser('role') userRole?: string,
  ) {
    return this.clientsService.findAll(search, userId, userRole, vendorId, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDEDOR, UserRole.ADMIN_COLOMBIA)
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(+id, updateClientDto);
  }

  @Delete(':id')
  @Roles(UserRole.VENDEDOR, UserRole.ADMIN_COLOMBIA)
  remove(@Param('id') id: string) {
    return this.clientsService.remove(+id);
  }

  @Get(':id/beneficiaries/count')
  @Roles(UserRole.VENDEDOR, UserRole.ADMIN_COLOMBIA)
  countBeneficiaries(@Param('id') id: string) {
    return this.clientsService.countBeneficiaries(+id);
  }
}

