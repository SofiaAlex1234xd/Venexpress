import { Controller, Get, Post, Body, Param, Delete, UseGuards, Patch } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { AddBalanceDto } from './dto/add-balance.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN_VENEZUELA)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(@Body() createAccountDto: CreateAccountDto, @CurrentUser('id') userId: number) {
    return this.accountsService.create(createAccountDto, userId);
  }

  @Get()
  findAll(@CurrentUser('id') userId: number) {
    return this.accountsService.findAll(userId);
  }

  @Get('summary')
  getSummary(@CurrentUser('id') userId: number) {
    return this.accountsService.getSummary(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.accountsService.findOne(+id, userId);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.accountsService.getAccountHistory(+id, userId);
  }

  @Patch(':id/add-balance')
  addBalance(
    @Param('id') id: string,
    @Body() addBalanceDto: AddBalanceDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.accountsService.addBalance(+id, addBalanceDto, userId);
  }

  @Patch(':id/update-balance')
  updateBalance(
    @Param('id') id: string,
    @Body() updateBalanceDto: UpdateBalanceDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.accountsService.updateBalance(+id, updateBalanceDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.accountsService.remove(+id, userId);
  }
}

