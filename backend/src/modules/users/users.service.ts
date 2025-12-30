import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['point'],
    });
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['point'],
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'name', 'role', 'phone'],
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  // Admin Colombia methods
  async findAllVendors(): Promise<User[]> {
    const vendors = await this.usersRepository.find({
      where: { role: 'vendedor' as any },
      relations: ['point'],
      order: { createdAt: 'DESC' },
    });

    // Calculate dynamic debt for each vendor
    for (const vendor of vendors) {
      const stats = await this.calculateVendorStats(vendor.id);
      vendor.debt = stats.debt;
      vendor.paidAmount = stats.paidAmount;
    }

    return vendors;
  }

  async createVendor(createVendorDto: any): Promise<User> {
    const hashedPassword = await bcrypt.hash(createVendorDto.password, 10);

    const vendor = this.usersRepository.create({
      name: createVendorDto.name,
      email: createVendorDto.email,
      phone: createVendorDto.phone,
      password: hashedPassword,
      role: 'vendedor' as any,
      pointId: createVendorDto.pointId || null,
      debt: createVendorDto.initialDebt || 0,
      paidAmount: 0,
      isBanned: false,
    });

    return this.usersRepository.save(vendor);
  }

  async changeUserRole(id: number, newRole: string): Promise<User> {
    const user = await this.findOne(id);
    user.role = newRole as any;
    return this.usersRepository.save(user);
  }

  async toggleBanUser(id: number, isBanned: boolean): Promise<User> {
    const user = await this.findOne(id);
    user.isBanned = isBanned;
    return this.usersRepository.save(user);
  }

  async getVendorDebtDetails(id: number, query?: any): Promise<any> {
    const vendor = await this.findOne(id);

    if (vendor.role !== 'vendedor') {
      throw new NotFoundException('El usuario no es un vendedor');
    }

    const stats = await this.calculateVendorStats(id, query);

    return {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        point: vendor.point,
        debt: stats.debt,
        paidAmount: stats.paidAmount,
        isBanned: vendor.isBanned,
        createdAt: vendor.createdAt,
      },
    };
  }

  async getVendorTransactions(userId: number, query: any): Promise<any> {
    const { period, startDate, endDate, page = 1, limit = 10, isPaid } = query;
    const skip = (page - 1) * limit;

    let dateFrom: Date;
    let dateTo: Date = new Date();

    if (period === 'today') {
      dateFrom = new Date();
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'last15days') {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 15);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'thisMonth') {
      dateFrom = new Date();
      dateFrom.setDate(1);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'custom' && startDate && endDate) {
      // Parsear fechas en zona horaria local
      const [yearFrom, monthFrom, dayFrom] = startDate.split('-').map(Number);
      dateFrom = new Date(yearFrom, monthFrom - 1, dayFrom);
      dateFrom.setHours(0, 0, 0, 0);
      
      const [yearTo, monthTo, dayTo] = endDate.split('-').map(Number);
      dateTo = new Date(yearTo, monthTo - 1, dayTo);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      dateFrom = new Date(0);
    }

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp')
      .where('transaction.createdBy.id = :userId', { userId })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: isPaid === 'true' })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page: Number(page),
        lastPage: Math.ceil(total / limit),
        limit: Number(limit),
      },
    };
  }

  private async calculateVendorStats(userId: number, query?: any): Promise<{ debt: number; paidAmount: number }> {
    const { period, startDate, endDate } = query || {};

    let dateFrom: Date;
    let dateTo: Date = new Date();

    if (period === 'today') {
      dateFrom = new Date();
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'last15days') {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 15);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'thisMonth') {
      dateFrom = new Date();
      dateFrom.setDate(1);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'custom' && startDate && endDate) {
      // Parsear fechas en zona horaria local
      const [yearFrom, monthFrom, dayFrom] = startDate.split('-').map(Number);
      dateFrom = new Date(yearFrom, monthFrom - 1, dayFrom);
      dateFrom.setHours(0, 0, 0, 0);
      
      const [yearTo, monthTo, dayTo] = endDate.split('-').map(Number);
      dateTo = new Date(yearTo, monthTo - 1, dayTo);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      dateFrom = new Date(0);
    }

    // Calculate debt (completed transactions not paid by vendor)
    const debtResult = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdBy.id = :userId', { userId })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: false })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .select('SUM(transaction.amountCOP)', 'sum')
      .getRawOne();

    // Calculate paid amount (completed transactions paid by vendor)
    const paidResult = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdBy.id = :userId', { userId })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: true })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .select('SUM(transaction.amountCOP)', 'sum')
      .getRawOne();

    return {
      debt: Number(debtResult.sum || 0),
      paidAmount: Number(paidResult.sum || 0),
    };
  }
}

