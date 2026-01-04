import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { AccountTransaction, AccountTransactionType } from './entities/account-transaction.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { AddBalanceDto } from './dto/add-balance.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private accountsRepository: Repository<Account>,
    @InjectRepository(AccountTransaction)
    private accountTransactionsRepository: Repository<AccountTransaction>,
  ) {}

  // Crear una nueva cuenta
  async create(createAccountDto: CreateAccountDto, userId: number): Promise<Account> {
    const account = this.accountsRepository.create({
      name: createAccountDto.name,
      balance: createAccountDto.initialBalance || 0,
      owner: { id: userId } as any,
    });

    const savedAccount = await this.accountsRepository.save(account);

    // Si hay saldo inicial, crear transacción
    if (createAccountDto.initialBalance && createAccountDto.initialBalance > 0) {
      await this.accountTransactionsRepository.save({
        account: { id: savedAccount.id } as any,
        amount: createAccountDto.initialBalance,
        type: AccountTransactionType.DEPOSIT,
        description: 'Saldo inicial',
        balanceBefore: 0,
        balanceAfter: createAccountDto.initialBalance,
      });
    }

    return savedAccount;
  }

  // Obtener todas las cuentas del usuario
  async findAll(userId: number): Promise<Account[]> {
    return this.accountsRepository.find({
      where: { owner: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  // Obtener una cuenta específica
  async findOne(id: number, userId: number): Promise<Account> {
    const account = await this.accountsRepository.findOne({
      where: { id, owner: { id: userId } },
    });

    if (!account) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return account;
  }

  // Agregar saldo a una cuenta
  async addBalance(id: number, addBalanceDto: AddBalanceDto, userId: number): Promise<Account> {
    const account = await this.findOne(id, userId);

    const balanceBefore = parseFloat(account.balance.toString());
    const newBalance = balanceBefore + addBalanceDto.amount;

    // Actualizar saldo
    account.balance = newBalance;
    await this.accountsRepository.save(account);

    // Registrar transacción
    await this.accountTransactionsRepository.save({
      account: { id: account.id } as any,
      amount: addBalanceDto.amount,
      type: AccountTransactionType.DEPOSIT,
      description: addBalanceDto.description || 'Depósito manual',
      balanceBefore,
      balanceAfter: newBalance,
    });

    return account;
  }

  // Actualizar saldo directamente (para correcciones)
  async updateBalance(id: number, updateBalanceDto: UpdateBalanceDto, userId: number): Promise<Account> {
    const account = await this.findOne(id, userId);

    const balanceBefore = parseFloat(account.balance.toString());
    const newBalance = updateBalanceDto.balance;
    const difference = newBalance - balanceBefore;

    // Actualizar saldo
    account.balance = newBalance;
    await this.accountsRepository.save(account);

    // Registrar transacción (depósito o retiro según la diferencia)
    if (difference !== 0) {
      await this.accountTransactionsRepository.save({
        account: { id: account.id } as any,
        amount: Math.abs(difference),
        type: difference > 0 ? AccountTransactionType.DEPOSIT : AccountTransactionType.WITHDRAWAL,
        description: `Ajuste de saldo: ${difference > 0 ? 'Aumento' : 'Disminución'} manual`,
        balanceBefore,
        balanceAfter: newBalance,
      });
    }

    return account;
  }

  // Restar saldo de una cuenta (usado al completar transacción)
  async withdrawBalance(
    accountId: number,
    amount: number,
    transactionId: number,
    userId: number,
  ): Promise<Account> {
    const account = await this.findOne(accountId, userId);

    const balanceBefore = parseFloat(account.balance.toString());

    if (balanceBefore < amount) {
      throw new BadRequestException(
        `Saldo insuficiente en ${account.name}. Disponible: ${balanceBefore} Bs, Requerido: ${amount} Bs`,
      );
    }

    const newBalance = balanceBefore - amount;

    // Actualizar saldo
    account.balance = newBalance;
    await this.accountsRepository.save(account);

    // Registrar transacción
    await this.accountTransactionsRepository.save({
      account: { id: account.id } as any,
      amount,
      type: AccountTransactionType.WITHDRAWAL,
      transaction: { id: transactionId } as any,
      description: `Retiro por transacción #${transactionId}`,
      balanceBefore,
      balanceAfter: newBalance,
    });

    return account;
  }

  // Obtener historial de transacciones de una cuenta
  async getAccountHistory(accountId: number, userId: number): Promise<AccountTransaction[]> {
    // Verificar que la cuenta pertenezca al usuario
    await this.findOne(accountId, userId);

    return this.accountTransactionsRepository.find({
      where: { account: { id: accountId } },
      relations: ['transaction'],
      order: { createdAt: 'DESC' },
    });
  }

  // Obtener resumen de todas las cuentas
  async getSummary(userId: number): Promise<{
    accounts: Account[];
    totalBalance: number;
    recentTransactions: AccountTransaction[];
  }> {
    const accounts = await this.findAll(userId);
    const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance.toString()), 0);

    // Obtener las últimas 20 transacciones de todas las cuentas
    const accountIds = accounts.map(acc => acc.id);
    let recentTransactions: AccountTransaction[] = [];

    // Solo hacer la consulta si hay cuentas
    if (accountIds.length > 0) {
      recentTransactions = await this.accountTransactionsRepository
        .createQueryBuilder('at')
        .leftJoinAndSelect('at.account', 'account')
        .leftJoinAndSelect('at.transaction', 'transaction')
        .where('at.account.id IN (:...accountIds)', { accountIds })
        .orderBy('at.createdAt', 'DESC')
        .limit(20)
        .getMany();
    }

    return {
      accounts,
      totalBalance,
      recentTransactions,
    };
  }

  // Eliminar una cuenta (solo si balance es 0)
  async remove(id: number, userId: number): Promise<void> {
    const account = await this.findOne(id, userId);

    if (parseFloat(account.balance.toString()) !== 0) {
      throw new BadRequestException('No se puede eliminar una cuenta con saldo diferente de 0');
    }

    await this.accountsRepository.remove(account);
  }
}

