import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionHistory } from './entities/transaction-history.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { User } from '../users/entities/user.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { RatesService } from '../rates/rates.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SetPurchaseRateDto } from './dto/set-purchase-rate.dto';
import { VenezuelaPayment } from './entities/venezuela-payment.entity';
import { CreateVenezuelaPaymentDto } from './dto/create-venezuela-payment.dto';
import { VenezuelaDebtSummary, TransactionDebtDetail, VenezuelaPaymentDetail } from './dto/venezuela-debt-detail.dto';

/**
 * Parsea una fecha en formato YYYY-MM-DD a un objeto Date en zona horaria local
 * Evita problemas de interpretación UTC
 */
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  // month - 1 porque los meses en Date son 0-indexados
  return new Date(year, month - 1, day);
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(TransactionHistory)
    private historyRepository: Repository<TransactionHistory>,
    @InjectRepository(Beneficiary)
    private beneficiariesRepository: Repository<Beneficiary>,
    @InjectRepository(VenezuelaPayment)
    private venezuelaPaymentsRepository: Repository<VenezuelaPayment>,
    private ratesService: RatesService,
  ) { }

  async create(createTransactionDto: CreateTransactionDto, user: any): Promise<Transaction> {
    // Obtener tasa actual
    const currentRate = await this.ratesService.getCurrentRate();

    // Obtener Destinatario completo
    const beneficiary = await this.beneficiariesRepository.findOne({
      where: { id: createTransactionDto.beneficiaryId },
    });

    if (!beneficiary) {
      throw new NotFoundException('Destinatario no encontrado');
    }

    // Calcular montos según la tasa
    let amountCOP: number;
    let amountBs: number;
    const rateToUse = createTransactionDto.customRate || currentRate.saleRate;

    if (createTransactionDto.amountCOP) {
      amountCOP = createTransactionDto.amountCOP;
      amountBs = amountCOP / rateToUse;
    } else if (createTransactionDto.amountBs) {
      amountBs = createTransactionDto.amountBs;
      amountCOP = amountBs * rateToUse;
    } else {
      throw new Error('Debe proporcionar amountCOP o amountBs');
    }

    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      amountCOP,
      amountBs,
      saleRate: rateToUse,
      createdBy: { id: user.id } as any,
      beneficiary: { id: beneficiary.id } as any,

      // Snapshot de datos del Destinatario
      beneficiaryFullName: beneficiary.fullName,
      beneficiaryDocumentId: beneficiary.documentId,
      beneficiaryBankName: beneficiary.bankName,
      beneficiaryAccountNumber: beneficiary.accountNumber,
      beneficiaryAccountType: beneficiary.accountType,
      beneficiaryPhone: beneficiary.phone || null,
      beneficiaryIsPagoMovil: beneficiary.isPagoMovil || false,

      lastEditedAt: new Date(), // Initialize timer
    });

    // Asociar cliente si es necesario
    if (user.role === UserRole.CLIENTE) {
      transaction.clientApp = { id: user.id } as any;
    } else if (createTransactionDto.clientPresencialId) {
      transaction.clientPresencial = { id: createTransactionDto.clientPresencialId } as any;
    }

    const savedTransaction = await this.transactionsRepository.save(transaction);

    // Crear entrada en historial
    await this.createHistoryEntry(
      savedTransaction.id,
      TransactionStatus.PENDIENTE,
      'Transacción creada',
      user.id,
    );

    return savedTransaction;
  }

  async findAll(user: any, paginationDto: PaginationDto): Promise<Transaction[]> {
    const { limit, offset } = paginationDto;
    const where: any = {};

    // Filtrar según el rol
    if (user.role === UserRole.CLIENTE) {
      where.clientApp = { id: user.id };
    } else if (user.role === UserRole.VENDEDOR) {
      where.createdBy = { id: user.id };
    }

    const transactions = await this.transactionsRepository.find({
      where,
      relations: ['createdBy', 'clientPresencial', 'clientApp', 'beneficiary'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Auto-actualizar estados si es necesario
    const updatedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        return await this.autoUpdateStatusIfNeeded(transaction, user.id);
      }),
    );

    return updatedTransactions;
  }

  async findOne(id: number, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy', 'clientPresencial', 'clientApp', 'beneficiary'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Verificar permisos
    if (
      user.role === UserRole.CLIENTE &&
      transaction.clientApp?.id !== user.id
    ) {
      throw new ForbiddenException('No tienes permiso para ver esta transacción');
    }

    return transaction;
  }

  async getHistory(transactionId: number): Promise<TransactionHistory[]> {
    return this.historyRepository.find({
      where: { transaction: { id: transactionId } },
      relations: ['changedBy'],
      order: { changedAt: 'ASC' },
    });
  }

  async updateStatus(
    id: number,
    updateStatusDto: UpdateTransactionStatusDto,
    user: any,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Actualizar status
    transaction.status = updateStatusDto.status;

    if (updateStatusDto.comprobanteVenezuela) {
      transaction.comprobanteVenezuela = updateStatusDto.comprobanteVenezuela;
    }

    if (updateStatusDto.notes) {
      transaction.notes = updateStatusDto.notes;
    }

    const updated = await this.transactionsRepository.save(transaction);

    // Crear entrada en historial
    await this.createHistoryEntry(
      id,
      updateStatusDto.status,
      updateStatusDto.notes || `Estado cambiado a ${updateStatusDto.status}`,
      user.id,
    );

    return updated;
  }

  async remove(id: number): Promise<void> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    await this.transactionsRepository.remove(transaction);
  }

  async markTransactionsAsPaid(
    transactionIds: number[],
    user: User,
  ): Promise<void> {
    if (user.role !== 'vendedor') {
      throw new ForbiddenException('Solo los vendedores pueden marcar transacciones como pagadas');
    }

    const transactions = await this.transactionsRepository.find({
      where: {
        id: In(transactionIds),
        createdBy: { id: user.id },
        status: TransactionStatus.COMPLETADO,
      },
    });

    if (transactions.length === 0) {
      throw new NotFoundException('No se encontraron transacciones válidas para marcar como pagadas');
    }

    const now = new Date();
    transactions.forEach(transaction => {
      transaction.isPaidByVendor = true;
      transaction.paidByVendorAt = now;
    });

    await this.transactionsRepository.save(transactions);
  }

  async markTransactionsByDateRangeAsPaid(
    startDate: string,
    endDate: string,
    user: User,
  ): Promise<number> {
    if (user.role !== 'vendedor') {
      throw new ForbiddenException('Solo los vendedores pueden marcar transacciones como pagadas');
    }

    const start = parseLocalDate(startDate);
    start.setHours(0, 0, 0, 0);

    const end = parseLocalDate(endDate);
    end.setHours(23, 59, 59, 999);

    const result = await this.transactionsRepository.update(
      {
        createdBy: { id: user.id },
        status: TransactionStatus.COMPLETADO,
        isPaidByVendor: false,
        createdAt: Between(start, end),
      },
      {
        isPaidByVendor: true,
        paidByVendorAt: new Date(),
      },
    );

    return result.affected || 0;
  }

  private async createHistoryEntry(
    transactionId: number,
    status: TransactionStatus,
    note: string,
    userId: number,
  ): Promise<void> {
    const history = this.historyRepository.create({
      transaction: { id: transactionId } as any,
      status,
      note,
      changedBy: { id: userId } as any,
    });

    await this.historyRepository.save(history);
  }

  /**
   * Verifica si una transacción puede ser editada (dentro de 5 minutos y estado PENDIENTE)
   */
  canEdit(transaction: Transaction): boolean {
    if (transaction.status !== TransactionStatus.PENDIENTE) {
      return false;
    }

    const now = new Date();
    const lastEdited = transaction.lastEditedAt || transaction.createdAt;
    const diffMinutes = (now.getTime() - lastEdited.getTime()) / (1000 * 60);

    return diffMinutes < 5;
  }

  /**
   * Actualiza el estado de una transacción si han pasado 5 minutos
   */
  async autoUpdateStatusIfNeeded(transaction: Transaction, userId: number): Promise<Transaction> {
    if (transaction.status === TransactionStatus.PENDIENTE && !this.canEdit(transaction)) {
      transaction.status = TransactionStatus.PENDIENTE_VENEZUELA;
      const updated = await this.transactionsRepository.save(transaction);

      await this.createHistoryEntry(
        transaction.id,
        TransactionStatus.PENDIENTE_VENEZUELA,
        'Estado actualizado automáticamente después de 5 minutos',
        userId,
      );

      return updated;
    }

    return transaction;
  }

  /**
   * Actualiza una transacción (solo si está en PENDIENTE y dentro de 5 minutos)
   */
  async update(
    id: number,
    updateDto: any,
    user: any,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Verificar permisos
    if (user.role === UserRole.VENDEDOR && transaction.createdBy.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para editar esta transacción');
    }

    // Verificar si puede editarse
    if (!this.canEdit(transaction)) {
      throw new ForbiddenException(
        'Esta transacción ya no puede ser editada. Solo se pueden editar transacciones en estado PENDIENTE dentro de los primeros 5 minutos.',
      );
    }

    // Si se cambia el monto, recalcular
    if (updateDto.amountCOP || updateDto.amountBs) {
      const currentRate = await this.ratesService.getCurrentRate();

      if (updateDto.amountCOP) {
        transaction.amountCOP = updateDto.amountCOP;
        transaction.amountBs = updateDto.amountCOP / currentRate.saleRate;
      } else if (updateDto.amountBs) {
        transaction.amountBs = updateDto.amountBs;
        transaction.amountCOP = updateDto.amountBs * currentRate.saleRate;
      }

      transaction.saleRate = currentRate.saleRate;
    }

    // Actualizar Destinatario si se proporciona
    if (updateDto.beneficiaryId) {
      const beneficiary = await this.beneficiariesRepository.findOne({
        where: { id: updateDto.beneficiaryId },
      });

      if (!beneficiary) {
        throw new NotFoundException('Destinatario no encontrado');
      }

      transaction.beneficiary = { id: beneficiary.id } as any;

      // Actualizar snapshot de datos del Destinatario
      transaction.beneficiaryFullName = beneficiary.fullName;
      transaction.beneficiaryDocumentId = beneficiary.documentId;
      transaction.beneficiaryBankName = beneficiary.bankName;
      transaction.beneficiaryAccountNumber = beneficiary.accountNumber;
      transaction.beneficiaryAccountType = beneficiary.accountType;
      transaction.beneficiaryPhone = beneficiary.phone || null;
      transaction.beneficiaryIsPagoMovil = beneficiary.isPagoMovil || false;
    }

    // Actualizar notas si se proporcionan
    if (updateDto.notes !== undefined) {
      transaction.notes = updateDto.notes;
    }

    // Reiniciar el cronómetro de edición
    transaction.lastEditedAt = new Date();

    const updated = await this.transactionsRepository.save(transaction);

    // Crear entrada en historial
    await this.createHistoryEntry(
      id,
      transaction.status,
      'Transacción actualizada',
      user.id,
    );

    return updated;
  }

  /**
   * Pausa el cronómetro de edición al entrar al modo de edición
   */
  async enterEditMode(id: number, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy', 'beneficiary'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Verificar permisos
    if (user.role === UserRole.VENDEDOR && transaction.createdBy.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para editar esta transacción');
    }

    // Verificar si puede editarse
    if (!this.canEdit(transaction)) {
      throw new ForbiddenException(
        'Esta transacción ya no puede ser editada. Solo se pueden editar transacciones en estado PENDIENTE dentro de los primeros 5 minutos.',
      );
    }

    // Pausar el cronómetro actualizando lastEditedAt
    transaction.lastEditedAt = new Date();

    return await this.transactionsRepository.save(transaction);
  }

  /**
   * Cancela una transacción (solo si está en PENDIENTE y dentro de 5 minutos)
   */
  async cancel(id: number, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Verificar permisos
    if (user.role === UserRole.VENDEDOR && transaction.createdBy.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para cancelar esta transacción');
    }

    // Verificar si puede cancelarse (usando la misma lógica que para editar)
    if (!this.canEdit(transaction)) {
      throw new ForbiddenException(
        'Esta transacción ya no puede ser cancelada. Solo se pueden cancelar transacciones en estado PENDIENTE dentro de los primeros 5 minutos.',
      );
    }

    // Actualizar estado
    transaction.status = TransactionStatus.CANCELADO_VENDEDOR;
    const updated = await this.transactionsRepository.save(transaction);

    // Crear entrada en historial
    await this.createHistoryEntry(
      id,
      TransactionStatus.CANCELADO_VENDEDOR,
      'Transacción cancelada por el vendedor',
      user.id,
    );

    return updated;
  }

  /**
   * Obtiene la deuda del vendedor basada en transacciones completadas
   */
  async getDebt(user: any, query: any): Promise<{ totalDebt: number; paidAmount: number; transactions: Transaction[] }> {
    const { period, startDate, endDate } = query;

    // Calcular rango de fechas según el período
    let dateFrom: Date;
    let dateTo: Date = new Date(); // Hasta ahora

    if (period === 'today') {
      // Desde las 00:00 de hoy
      dateFrom = new Date();
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'last15days') {
      // Últimos 15 días
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 15);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'thisMonth') {
      // Desde el día 1 del mes actual
      dateFrom = new Date();
      dateFrom.setDate(1);
      dateFrom.setHours(0, 0, 0, 0);
    } else if (period === 'custom' && startDate && endDate) {
      // Rango personalizado
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999); // Hasta el final del día
    } else {
      // Por defecto, mostrar todo
      dateFrom = new Date(0); // Desde el inicio de los tiempos
    }

    // Buscar transacciones completadas del vendedor en el rango de fechas (que no estén pagadas)
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp')
      .where('transaction.createdBy.id = :userId', { userId: user.id })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: false })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .orderBy('transaction.createdAt', 'DESC');

    const transactions = await queryBuilder.getMany();

    // Calcular deuda total
    const totalDebt = transactions.reduce((sum, transaction) => {
      const amount = Number(transaction.amountCOP) || 0;
      return sum + amount;
    }, 0);

    // Calcular total pagado en el mismo rango
    const paidQueryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdBy.id = :userId', { userId: user.id })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: true })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo });

    const paidResult = await paidQueryBuilder.select('SUM(transaction.amountCOP)', 'sum').getRawOne();
    const paidAmount = Number(paidResult.sum) || 0;

    return {
      totalDebt: Number(totalDebt),
      paidAmount: Number(paidAmount),
      transactions,
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
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      dateTo = parseLocalDate(endDate);
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

  // Admin Venezuela methods
  async getPendingVenezuela(): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { status: TransactionStatus.PENDIENTE_VENEZUELA },
      relations: ['createdBy', 'clientPresencial', 'clientApp', 'beneficiary'],
      order: { createdAt: 'ASC' },
    });
  }

  async completeTransfer(id: number, voucherUrl: string, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    if (transaction.status !== TransactionStatus.PENDIENTE_VENEZUELA) {
      throw new BadRequestException('Solo se pueden completar transacciones en estado pendiente_venezuela');
    }

    transaction.status = TransactionStatus.COMPLETADO;
    if (voucherUrl) {
      transaction.comprobanteVenezuela = voucherUrl;
    }

    const updated = await this.transactionsRepository.save(transaction);

    await this.createHistoryEntry(
      id,
      TransactionStatus.COMPLETADO,
      'Transferencia completada por administrador Venezuela',
      user.id,
    );

    return updated;
  }

  async rejectTransfer(id: number, reason: string, voucherUrl: string | null, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    if (transaction.status !== TransactionStatus.PENDIENTE_VENEZUELA) {
      throw new BadRequestException('Solo se pueden rechazar transacciones en estado pendiente_venezuela');
    }

    transaction.status = TransactionStatus.RECHAZADO;
    transaction.rejectionReason = reason; // Guardar motivo del rechazo en campo separado
    if (voucherUrl) {
      transaction.comprobanteVenezuela = voucherUrl;
    }

    const updated = await this.transactionsRepository.save(transaction);

    await this.createHistoryEntry(
      id,
      TransactionStatus.RECHAZADO,
      `Rechazado: ${reason}`,
      user.id,
    );

    return updated;
  }

  async cancelByAdmin(id: number, reason: string, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    transaction.status = TransactionStatus.CANCELADO_ADMINISTRADOR;
    transaction.notes = `Cancelado por administrador: ${reason}`;

    const updated = await this.transactionsRepository.save(transaction);

    await this.createHistoryEntry(
      id,
      TransactionStatus.CANCELADO_ADMINISTRADOR,
      `Cancelado por administrador: ${reason}`,
      user.id,
    );

    return updated;
  }

  async getHistoryAdmin(query: any): Promise<Transaction[]> {
    const { status, startDate, endDate } = query;

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp');

    // Filter by status if provided
    if (status && status !== 'all') {
      queryBuilder.andWhere('transaction.status = :status', { status });
    } else {
      // By default, show completed, rejected, and cancelled
      queryBuilder.andWhere('transaction.status IN (:...statuses)', {
        statuses: [TransactionStatus.COMPLETADO, TransactionStatus.RECHAZADO, TransactionStatus.CANCELADO_ADMINISTRADOR],
      });
    }

    // Filter by date range
    if (startDate) {
      const start = parseLocalDate(startDate);
      start.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: start });
    }
    if (endDate) {
      const end = parseLocalDate(endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: end });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  async getReports(query: any): Promise<any> {
    const { startDate, endDate } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: last 30 days
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      dateFrom.setHours(0, 0, 0, 0);
    }

    // Get all transactions in the date range
    const transactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .getMany();

    // Calculate stats
    const totalTransactions = transactions.length;
    const completedTransactions = transactions.filter(t => t.status === TransactionStatus.COMPLETADO);
    const rejectedTransactions = transactions.filter(t => t.status === TransactionStatus.RECHAZADO);
    const cancelledTransactions = transactions.filter(t =>
      t.status === TransactionStatus.CANCELADO_VENDEDOR || t.status === TransactionStatus.CANCELADO_ADMINISTRADOR
    );
    const pendingTransactions = transactions.filter(t =>
      t.status === TransactionStatus.PENDIENTE ||
      t.status === TransactionStatus.PENDIENTE_COLOMBIA ||
      t.status === TransactionStatus.PENDIENTE_VENEZUELA
    );

    const totalCOP = completedTransactions.reduce((sum, t) => sum + Number(t.amountCOP), 0);
    const totalBs = completedTransactions.reduce((sum, t) => sum + Number(t.amountBs), 0);

    // Group by day for chart data (usando fecha local, no UTC)
    const dailyData: { [key: string]: { cop: number; bs: number; count: number } } = {};
    completedTransactions.forEach(t => {
      // Obtener fecha en formato local YYYY-MM-DD
      const date = new Date(t.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      
      if (!dailyData[dayKey]) {
        dailyData[dayKey] = { cop: 0, bs: 0, count: 0 };
      }
      dailyData[dayKey].cop += Number(t.amountCOP);
      dailyData[dayKey].bs += Number(t.amountBs);
      dailyData[dayKey].count += 1;
    });

    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      summary: {
        totalTransactions,
        completedCount: completedTransactions.length,
        rejectedCount: rejectedTransactions.length,
        cancelledCount: cancelledTransactions.length,
        pendingCount: pendingTransactions.length,
        totalCOP,
        totalBs,
        averageRate: completedTransactions.length > 0
          ? completedTransactions.reduce((sum, t) => sum + Number(t.saleRate), 0) / completedTransactions.length
          : 0,
      },
      chartData,
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  async getReportsCSV(query: any): Promise<any> {
    const { startDate, endDate } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: last 30 days
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      dateFrom.setHours(0, 0, 0, 0);
    }

    // Get completed transactions with vendor info
    const transactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .where('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .orderBy('createdBy.name', 'ASC')
      .addOrderBy('transaction.createdAt', 'ASC')
      .getMany();

    return transactions;
  }

  /**
   * Marca la comisión (2%) como pagada al vendedor para un conjunto de transacciones
   * Solo Admin Colombia puede ejecutar esta acción.
   */
  async markVendorCommissionAsPaid(transactionIds: number[], user: User): Promise<{ affected: number }> {
    if (user.role !== UserRole.ADMIN_COLOMBIA) {
      throw new ForbiddenException('Solo Admin Colombia puede marcar comisiones como pagadas');
    }

    if (!transactionIds || transactionIds.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos una transacción');
    }

    const transactions = await this.transactionsRepository.find({
      where: {
        id: In(transactionIds),
        status: TransactionStatus.COMPLETADO,
      },
    });

    if (!transactions.length) {
      return { affected: 0 };
    }

    const now = new Date();
    transactions.forEach((tx) => {
      tx.isCommissionPaidToVendor = true;
      tx.commissionPaidAt = now;
    });

    const result = await this.transactionsRepository.save(transactions);
    return { affected: result.length };
  }

  /**
   * Resumen financiero para Admin Colombia: por vendedor y global.
   * Usa solo transacciones COMPLETADAS con tasa de compra establecida.
   */
  async getAdminColombiaFinancialSummary(query: any): Promise<any> {
    const { startDate, endDate } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      // Crear fechas en la zona horaria local del servidor
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: desde el principio hasta hoy
      dateFrom = new Date(0);
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
    }

    const transactions = await this.transactionsRepository.find({
      where: {
        status: TransactionStatus.COMPLETADO,
        isPurchaseRateSet: true,
        createdAt: Between(dateFrom, dateTo),
      },
      relations: ['createdBy'],
      order: { createdAt: 'ASC' },
    });

    interface VendorAgg {
      vendorId: number;
      vendorName: string;
      totalCommission: number;
      commissionPaid: number;
      commissionPending: number;
      adminColombiaEarnings: number;
      amountOwedToVenezuela: number;
    }

    const byVendor: Record<number, VendorAgg> = {};

    let globalCommissionTotal = 0;
    let globalCommissionPaid = 0;
    let globalAdminColombiaEarnings = 0;
    let globalAmountOwedToVenezuela = 0;

    transactions.forEach((tx) => {
      const vendorId = tx.createdBy?.id;
      const vendorName = tx.createdBy?.name || `Vendedor #${vendorId}`;

      if (!byVendor[vendorId]) {
        byVendor[vendorId] = {
          vendorId,
          vendorName,
          totalCommission: 0,
          commissionPaid: 0,
          commissionPending: 0,
          adminColombiaEarnings: 0,
          amountOwedToVenezuela: 0,
        };
      }

      const cop = Number(tx.amountCOP) || 0;
      const bs = Number(tx.amountBs) || 0;
      const saleRate = Number(tx.saleRate) || 0;
      const purchaseRate = Number(tx.purchaseRate) || 0;

      if (!saleRate || !purchaseRate) {
        return;
      }

      // Cálculos según las fórmulas proporcionadas
      // bolívares ya están en amountBs (calculados con tasa de venta)
      const bolivares = bs;
      const inversion = bolivares * purchaseRate;
      const gananciaSistema = cop - inversion;
      const gananciaAdminColombia = gananciaSistema / 2;
      const deudaColombiaConVenezuela = inversion + gananciaAdminColombia;

      const commission = cop * 0.02; // 2% para el vendedor

      const vendorAgg = byVendor[vendorId];
      vendorAgg.totalCommission += commission;
      vendorAgg.adminColombiaEarnings += gananciaAdminColombia;
      vendorAgg.amountOwedToVenezuela += deudaColombiaConVenezuela;

      globalCommissionTotal += commission;
      globalAdminColombiaEarnings += gananciaAdminColombia;
      globalAmountOwedToVenezuela += deudaColombiaConVenezuela;

      if (tx.isCommissionPaidToVendor) {
        vendorAgg.commissionPaid += commission;
        globalCommissionPaid += commission;
      }
    });

    // Calcular pendientes por vendedor
    Object.values(byVendor).forEach((agg) => {
      agg.commissionPending = agg.totalCommission - agg.commissionPaid;
    });

    return {
      global: {
        totalCommission: globalCommissionTotal,
        commissionPaid: globalCommissionPaid,
        commissionPending: globalCommissionTotal - globalCommissionPaid,
        adminColombiaEarnings: globalAdminColombiaEarnings,
        amountOwedToVenezuela: globalAmountOwedToVenezuela,
      },
      byVendor: Object.values(byVendor),
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  /**
   * Resumen financiero para Admin Venezuela: ganancias y deuda de Colombia.
   * Usa solo transacciones COMPLETADAS con tasa de compra establecida.
   */
  async getAdminVenezuelaFinancialSummary(query: any): Promise<any> {
    const { startDate, endDate } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      // Crear fechas en la zona horaria local del servidor
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: desde el principio hasta hoy
      dateFrom = new Date(0);
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
    }

    const transactions = await this.transactionsRepository.find({
      where: {
        status: TransactionStatus.COMPLETADO,
        isPurchaseRateSet: true,
        createdAt: Between(dateFrom, dateTo),
      },
      relations: ['createdBy'],
      order: { createdAt: 'ASC' },
    });

    let totalEarnings = 0; // Ganancias de Admin Venezuela
    let totalDebtFromColombia = 0; // Deuda de Admin Colombia con Venezuela

    transactions.forEach((tx) => {
      const cop = Number(tx.amountCOP) || 0;
      const bs = Number(tx.amountBs) || 0;
      const saleRate = Number(tx.saleRate) || 0;
      const purchaseRate = Number(tx.purchaseRate) || 0;

      if (!saleRate || !purchaseRate) {
        return;
      }

      // Cálculos según las fórmulas proporcionadas
      const bolivares = bs;
      const inversion = bolivares * purchaseRate;
      const gananciaSistema = cop - inversion;
      const gananciaAdminVenezuela = gananciaSistema / 2; // La otra mitad
      const deudaColombiaConVenezuela = inversion + (gananciaSistema / 2); // Inversión + mitad de Colombia

      totalEarnings += gananciaAdminVenezuela;
      totalDebtFromColombia += deudaColombiaConVenezuela;
    });

    // Obtener pagos de Colombia a Venezuela
    let payments = [];
    let totalPaid = 0;
    
    try {
      payments = await this.venezuelaPaymentsRepository.find({
        where: {
          paymentDate: Between(dateFrom, dateTo),
        },
        relations: ['createdBy'],
        order: { paymentDate: 'DESC' },
      });
      totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    } catch (error) {
      // Si la tabla no existe aún o hay un error, continuar sin pagos
      console.warn('Error fetching venezuela payments:', error.message);
    }

    // Calcular detalles de transacciones
    const transactionDetails = transactions.map((tx) => {
      const cop = Number(tx.amountCOP) || 0;
      const bs = Number(tx.amountBs) || 0;
      const saleRate = Number(tx.saleRate) || 0;
      const purchaseRate = Number(tx.purchaseRate) || 0;

      if (!saleRate || !purchaseRate) {
        return null;
      }

      const bolivares = bs;
      const inversion = bolivares * purchaseRate;
      const gananciaSistema = cop - inversion;
      const gananciaAdminVenezuela = gananciaSistema / 2;
      const deudaConVenezuela = inversion + gananciaAdminVenezuela;

      return {
        id: tx.id,
        createdAt: tx.createdAt,
        vendorName: tx.createdBy?.name || 'N/A',
        beneficiaryFullName: tx.beneficiaryFullName,
        amountCOP: cop,
        amountBs: bs,
        saleRate,
        purchaseRate,
        inversion,
        gananciaSistema,
        gananciaAdminVenezuela,
        deudaConVenezuela,
      };
    }).filter(Boolean);

    return {
      totalEarnings, // Ganancias de Admin Venezuela
      totalDebtFromColombia, // Deuda total de Admin Colombia
      totalPaid, // Total pagado por Admin Colombia en este período
      pendingDebt: totalDebtFromColombia - totalPaid, // Deuda pendiente
      transactionCount: transactions.length,
      transactionDetails, // Detalles con cálculos
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        paymentDate: p.paymentDate,
        paidBy: p.createdBy?.name,
        notes: p.notes,
      })),
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  // Reenviar transacción rechazada
  async resendRejectedTransaction(
    id: number,
    updateData: any,
    user: any,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy', 'beneficiary'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    // Verificar permisos
    if (user.role === UserRole.VENDEDOR && transaction.createdBy.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para modificar esta transacción');
    }

    // Verificar que esté rechazada
    if (transaction.status !== TransactionStatus.RECHAZADO) {
      throw new BadRequestException('Solo se pueden reenviar transacciones rechazadas');
    }

    // Verificar si hay cambios en el destinatario
    const beneficiaryChanged =
      (updateData.beneficiaryId && updateData.beneficiaryId !== transaction.beneficiary?.id) ||
      updateData.beneficiaryFullName !== transaction.beneficiaryFullName ||
      updateData.beneficiaryDocumentId !== transaction.beneficiaryDocumentId ||
      updateData.beneficiaryBankName !== transaction.beneficiaryBankName ||
      updateData.beneficiaryAccountNumber !== transaction.beneficiaryAccountNumber ||
      updateData.beneficiaryAccountType !== transaction.beneficiaryAccountType ||
      updateData.beneficiaryPhone !== transaction.beneficiaryPhone;

    // Si cambió el beneficiario, actualizar el snapshot
    if (beneficiaryChanged && updateData.saveBeneficiaryChanges) {
      if (updateData.beneficiaryFullName) transaction.beneficiaryFullName = updateData.beneficiaryFullName;
      if (updateData.beneficiaryDocumentId) transaction.beneficiaryDocumentId = updateData.beneficiaryDocumentId;
      if (updateData.beneficiaryBankName) transaction.beneficiaryBankName = updateData.beneficiaryBankName;
      if (updateData.beneficiaryAccountNumber) transaction.beneficiaryAccountNumber = updateData.beneficiaryAccountNumber;
      if (updateData.beneficiaryAccountType) transaction.beneficiaryAccountType = updateData.beneficiaryAccountType;
      if (updateData.beneficiaryPhone !== undefined) transaction.beneficiaryPhone = updateData.beneficiaryPhone;
    }

    // Actualizar estado y timestamp
    transaction.status = TransactionStatus.PENDIENTE_VENEZUELA;
    transaction.rejectionReason = null; // Limpiar motivo de rechazo al reenviar
    transaction.comprobanteVenezuela = null; // Limpiar comprobante de rechazo
    transaction.lastEditedAt = new Date();

    const updated = await this.transactionsRepository.save(transaction);

    // Crear entrada en historial
    await this.createHistoryEntry(
      id,
      TransactionStatus.PENDIENTE_VENEZUELA,
      'Transacción reenviada después de rechazo',
      user.id,
    );

    return updated;
  }

  async getVendorReports(user: any, query: any) {
    const { startDate, endDate } = query;

    // Construir filtros base
    const whereConditions: any = {
      createdBy: { id: user.id },
    };

    // Aplicar filtros de fecha si existen
    if (startDate && endDate) {
      const dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      const dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
      whereConditions.createdAt = Between(dateFrom, dateTo);
    }

    // Obtener todas las transacciones del vendedor con el filtro de fecha
    const transactions = await this.transactionsRepository.find({
      where: whereConditions,
      relations: ['createdBy', 'clientPresencial', 'clientApp'],
      order: { createdAt: 'DESC' },
    });

    // Calcular estadísticas
    const totalTransactions = transactions.length;

    // Transacciones por estado
    const byStatus = {
      pendiente: transactions.filter(t => t.status === TransactionStatus.PENDIENTE).length,
      pendiente_colombia: transactions.filter(t => t.status === TransactionStatus.PENDIENTE_COLOMBIA).length,
      pendiente_venezuela: transactions.filter(t => t.status === TransactionStatus.PENDIENTE_VENEZUELA).length,
      completado: transactions.filter(t => t.status === TransactionStatus.COMPLETADO).length,
      rechazado: transactions.filter(t => t.status === TransactionStatus.RECHAZADO).length,
      cancelado_vendedor: transactions.filter(t => t.status === TransactionStatus.CANCELADO_VENDEDOR).length,
      cancelado_administrador: transactions.filter(t => t.status === TransactionStatus.CANCELADO_ADMINISTRADOR).length,
    };

    // Montos totales
    const totalAmountCOP = transactions.reduce((sum, t) => sum + parseFloat(t.amountCOP.toString()), 0);
    const totalAmountBs = transactions.reduce((sum, t) => sum + parseFloat(t.amountBs.toString()), 0);

    // Montos por estado
    const completedTransactions = transactions.filter(t => t.status === TransactionStatus.COMPLETADO);
    const completedAmountCOP = completedTransactions.reduce((sum, t) => sum + parseFloat(t.amountCOP.toString()), 0);
    const completedAmountBs = completedTransactions.reduce((sum, t) => sum + parseFloat(t.amountBs.toString()), 0);

    const pendingTransactions = transactions.filter(t => t.status === TransactionStatus.PENDIENTE_VENEZUELA);
    const pendingAmountCOP = pendingTransactions.reduce((sum, t) => sum + parseFloat(t.amountCOP.toString()), 0);
    const pendingAmountBs = pendingTransactions.reduce((sum, t) => sum + parseFloat(t.amountBs.toString()), 0);

    const rejectedTransactions = transactions.filter(t => t.status === TransactionStatus.RECHAZADO);
    const rejectedAmountCOP = rejectedTransactions.reduce((sum, t) => sum + parseFloat(t.amountCOP.toString()), 0);
    const rejectedAmountBs = rejectedTransactions.reduce((sum, t) => sum + parseFloat(t.amountBs.toString()), 0);

    // Ganancias del sistema (diferencia entre COP y Bs convertido)
    const earnings = completedTransactions.map(t => {
      const copValue = parseFloat(t.amountCOP.toString());
      const bsValue = parseFloat(t.amountBs.toString());
      const rate = parseFloat(t.saleRate.toString());
      return copValue - (bsValue * rate);
    }).reduce((sum, earning) => sum + earning, 0);

    // Ganancias del vendedor (2% del monto COP) para TODAS las transacciones completadas
    const vendorEarningsTotal = completedTransactions.reduce((sum, t) => {
      const copValue = parseFloat(t.amountCOP.toString());
      return sum + copValue * 0.02;
    }, 0);

    const vendorEarningsPaid = completedTransactions
      .filter(t => t.isCommissionPaidToVendor)
      .reduce((sum, t) => {
        const copValue = parseFloat(t.amountCOP.toString());
        return sum + copValue * 0.02;
      }, 0);

    const vendorEarningsPending = vendorEarningsTotal - vendorEarningsPaid;

    // Transacciones por día (últimos 30 días o según el rango)
    const transactionsByDay = this.groupTransactionsByDay(transactions);

    return {
      totalTransactions,
      byStatus,
      totalAmountCOP,
      totalAmountBs,
      completedAmountCOP,
      completedAmountBs,
      pendingAmountCOP,
      pendingAmountBs,
      rejectedAmountCOP,
      rejectedAmountBs,
      earnings,
      vendorEarningsTotal,
      vendorEarningsPaid,
      vendorEarningsPending,
      transactionsByDay,
      averageRate: totalTransactions > 0
        ? transactions.reduce((sum, t) => sum + parseFloat(t.saleRate.toString()), 0) / totalTransactions
        : 0,
    };
  }

  private groupTransactionsByDay(transactions: Transaction[]) {
    const grouped = {};

    transactions.forEach(transaction => {
      // Normalize date to local timezone (YYYY-MM-DD)
      const txDate = new Date(transaction.createdAt);
      const year = txDate.getFullYear();
      const month = String(txDate.getMonth() + 1).padStart(2, '0');
      const day = String(txDate.getDate()).padStart(2, '0');
      const date = `${year}-${month}-${day}`;

      if (!grouped[date]) {
        grouped[date] = {
          date,
          count: 0,
          amountCOP: 0,
          amountBs: 0,
          completed: 0,
          pending: 0,
          rejected: 0,
        };
      }

      grouped[date].count++;
      grouped[date].amountCOP += parseFloat(transaction.amountCOP.toString());
      grouped[date].amountBs += parseFloat(transaction.amountBs.toString());

      if (transaction.status === TransactionStatus.COMPLETADO) {
        grouped[date].completed++;
      } else if (transaction.status === TransactionStatus.PENDIENTE_VENEZUELA) {
        grouped[date].pending++;
      } else if (transaction.status === TransactionStatus.RECHAZADO) {
        grouped[date].rejected++;
      }
    });

    return Object.values(grouped).sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  // Admin Colombia methods
  async getPendingForAdminColombia(): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { status: TransactionStatus.PENDIENTE_VENEZUELA },
      relations: ['createdBy', 'createdBy.point', 'clientPresencial', 'clientApp', 'beneficiary'],
      order: { createdAt: 'ASC' },
    });
  }

  async getHistoryAdminColombia(query: any): Promise<Transaction[]> {
    const { status, startDate, endDate, vendorId } = query;

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.point', 'point')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp');

    // Filter by vendor if provided
    if (vendorId) {
      queryBuilder.andWhere('transaction.createdBy.id = :vendorId', { vendorId: +vendorId });
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      queryBuilder.andWhere('transaction.status = :status', { status });
    } else {
      // By default, show completed, rejected, and cancelled
      queryBuilder.andWhere('transaction.status IN (:...statuses)', {
        statuses: [TransactionStatus.COMPLETADO, TransactionStatus.RECHAZADO, TransactionStatus.CANCELADO_ADMINISTRADOR],
      });
    }

    // Filter by date range
    if (startDate) {
      // Forzar inicio del día en zona horaria local
      const start = parseLocalDate(startDate);
      start.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: start });
    }
    if (endDate) {
      // Forzar final del día en zona horaria local
      const end = parseLocalDate(endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: end });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  async getReportsAdminColombia(query: any): Promise<any> {
    const { startDate, endDate, vendorId } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      // Crear fechas en la zona horaria local del servidor
      // Asegurar que cubran el día completo
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: last 30 days
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      dateFrom.setHours(0, 0, 0, 0);
    }

    // Build query
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .where('transaction.createdAt >= :dateFrom AND transaction.createdAt <= :dateTo', { 
        dateFrom, 
        dateTo 
      });

    // Filter by vendor if provided
    if (vendorId) {
      queryBuilder.andWhere('transaction.createdBy.id = :vendorId', { vendorId: +vendorId });
    }

    const transactions = await queryBuilder.getMany();

    // Calculate stats
    const totalTransactions = transactions.length;
    const completedTransactions = transactions.filter(t => t.status === TransactionStatus.COMPLETADO);
    const rejectedTransactions = transactions.filter(t => t.status === TransactionStatus.RECHAZADO);
    const cancelledTransactions = transactions.filter(t =>
      t.status === TransactionStatus.CANCELADO_VENDEDOR || t.status === TransactionStatus.CANCELADO_ADMINISTRADOR
    );
    const pendingTransactions = transactions.filter(t =>
      t.status === TransactionStatus.PENDIENTE ||
      t.status === TransactionStatus.PENDIENTE_COLOMBIA ||
      t.status === TransactionStatus.PENDIENTE_VENEZUELA
    );

    const totalCOP = completedTransactions.reduce((sum, t) => sum + Number(t.amountCOP), 0);
    const totalBs = completedTransactions.reduce((sum, t) => sum + Number(t.amountBs), 0);

    // Group by day for chart data (usando fecha local, no UTC)
    const dailyData: { [key: string]: { cop: number; bs: number; count: number } } = {};
    completedTransactions.forEach(t => {
      // Obtener fecha en formato local YYYY-MM-DD
      const date = new Date(t.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;
      
      if (!dailyData[dayKey]) {
        dailyData[dayKey] = { cop: 0, bs: 0, count: 0 };
      }
      dailyData[dayKey].cop += Number(t.amountCOP);
      dailyData[dayKey].bs += Number(t.amountBs);
      dailyData[dayKey].count += 1;
    });

    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    //Group stats by vendor
    const vendorStats: { [key: number]: any } = {};
    transactions.forEach(t => {
      const vendorId = t.createdBy.id;
      if (!vendorStats[vendorId]) {
        vendorStats[vendorId] = {
          vendor: {
            id: t.createdBy.id,
            name: t.createdBy.name,
            email: t.createdBy.email,
          },
          totalTransactions: 0,
          completedCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
          totalCOP: 0,
          totalBs: 0,
        };
      }
      vendorStats[vendorId].totalTransactions++;
      if (t.status === TransactionStatus.COMPLETADO) {
        vendorStats[vendorId].completedCount++;
        vendorStats[vendorId].totalCOP += Number(t.amountCOP);
        vendorStats[vendorId].totalBs += Number(t.amountBs);
      } else if (t.status === TransactionStatus.RECHAZADO) {
        vendorStats[vendorId].rejectedCount++;
      } else if (
        t.status === TransactionStatus.PENDIENTE ||
        t.status === TransactionStatus.PENDIENTE_COLOMBIA ||
        t.status === TransactionStatus.PENDIENTE_VENEZUELA
      ) {
        vendorStats[vendorId].pendingCount++;
      }
    });

    return {
      summary: {
        totalTransactions,
        completedCount: completedTransactions.length,
        rejectedCount: rejectedTransactions.length,
        cancelledCount: cancelledTransactions.length,
        pendingCount: pendingTransactions.length,
        totalCOP,
        totalBs,
        averageRate: completedTransactions.length > 0
          ? completedTransactions.reduce((sum, t) => sum + Number(t.saleRate), 0) / completedTransactions.length
          : 0,
      },
      chartData,
      vendorStats: Object.values(vendorStats),
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  async getReportsAdminColombiaCSV(query: any): Promise<any> {
    const { startDate, endDate, vendorId } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      // Crear fechas en la zona horaria local del servidor
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: last 30 days
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      dateFrom.setHours(0, 0, 0, 0);
    }

    // Build query
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .where('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO });

    // Filter by vendor if provided
    if (vendorId) {
      queryBuilder.andWhere('transaction.createdBy.id = :vendorId', { vendorId: +vendorId });
    }

    queryBuilder
      .orderBy('createdBy.name', 'ASC')
      .addOrderBy('transaction.createdAt', 'ASC');

    return queryBuilder.getMany();
  }

  /**
   * Establece la tasa de compra para una transacción específica
   */
  async setPurchaseRate(
    id: number,
    setPurchaseRateDto: SetPurchaseRateDto,
    user: User,
  ): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    // Verificar permisos - solo admin de Venezuela puede establecer tasas de compra
    if (user.role !== UserRole.ADMIN_VENEZUELA) {
      throw new ForbiddenException('No tiene permiso para realizar esta acción');
    }

    // Actualizar la tasa de compra
    transaction.purchaseRate = setPurchaseRateDto.purchaseRate;
    transaction.isPurchaseRateSet = true;

    // Si se marca como final, actualizar el historial
    if (setPurchaseRateDto.isFinal) {
      await this.createHistoryEntry(
        transaction.id,
        TransactionStatus.TASA_COMPRA_ESTABLECIDA,
        `Tasa de compra establecida en ${setPurchaseRateDto.purchaseRate} por ${user.name}`,
        user.id,
      );
    }

    return this.transactionsRepository.save(transaction);
  }

  /**
   * Establece la tasa de compra para múltiples transacciones
   */
  async bulkSetPurchaseRate(
    setPurchaseRateDto: SetPurchaseRateDto,
    user: User,
  ): Promise<{ message: string; affected: number }> {
    // Verificar permisos - solo admin de Venezuela puede establecer tasas de compra
    if (user.role !== UserRole.ADMIN_VENEZUELA) {
      throw new ForbiddenException('No tiene permiso para realizar esta acción');
    }

    let query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.isPurchaseRateSet = :isSet', { isSet: false });

    // Filtrar por IDs específicos si se proporcionan
    if (setPurchaseRateDto.transactionIds?.length > 0) {
      query = query.andWhere('transaction.id IN (:...ids)', {
        ids: setPurchaseRateDto.transactionIds,
      });
    }

    // Filtrar por fecha si se proporciona
    if (setPurchaseRateDto.date) {
      // Si date es string, parsearlo correctamente; si es Date, usarlo directamente
      const dateStr = typeof setPurchaseRateDto.date === 'string' 
        ? setPurchaseRateDto.date 
        : setPurchaseRateDto.date.toISOString().split('T')[0];
      const startDate = parseLocalDate(dateStr);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);

      query = query.andWhere(
        'transaction.createdAt >= :startDate AND transaction.createdAt < :endDate',
        { startDate, endDate },
      );
    }

    // Obtener las transacciones que coinciden con los filtros
    const transactions = await query.getMany();

    if (!transactions.length) {
      return {
        message: 'No se encontraron transacciones para actualizar',
        affected: 0,
      };
    }

    const ids = transactions.map((t) => t.id);

    // Actualizar por IDs usando el repositorio (evita problemas de alias en UPDATE)
    const updateResult = await this.transactionsRepository.update(
      { id: In(ids) },
      {
        purchaseRate: setPurchaseRateDto.purchaseRate,
        isPurchaseRateSet: true,
      },
    );

    // Crear entradas de historial para las transacciones actualizadas
    await Promise.all(
      transactions.map((transaction) =>
        this.createHistoryEntry(
          transaction.id,
          TransactionStatus.TASA_COMPRA_ESTABLECIDA,
          `Tasa de compra establecida en ${setPurchaseRateDto.purchaseRate} (actualización masiva) por ${user.name}`,
          user.id,
        ),
      ),
    );

    return {
      message: `Se actualizó la tasa de compra para ${updateResult.affected || 0} transacciones`,
      affected: updateResult.affected || 0,
    };
  }

  /**
   * Obtiene transacciones pendientes de tasa de compra
   */
  async getPendingPurchaseRateTransactions(
    query: { startDate?: string; endDate?: string; vendorId?: number },
    user: User,
  ): Promise<Transaction[]> {
    // Verificar permisos - solo admin de Venezuela puede ver esto
    if (user.role !== UserRole.ADMIN_VENEZUELA) {
      throw new ForbiddenException('No tiene permiso para ver estas transacciones');
    }

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.beneficiary', 'beneficiary')
      .where('transaction.isPurchaseRateSet = :isSet', { isSet: false })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO });

    // Filtrar por rango de fechas
    if (query.startDate) {
      const startDate = parseLocalDate(query.startDate);
      startDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate });
    }

    if (query.endDate) {
      const endDate = parseLocalDate(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate });
    }

    // Filtrar por vendedor si se especifica
    if (query.vendorId) {
      queryBuilder.andWhere('transaction.createdBy.id = :vendorId', {
        vendorId: query.vendorId,
      });
    }

    queryBuilder.orderBy('transaction.createdAt', 'ASC');

    return queryBuilder.getMany();
  }

  /**
   * Obtiene el detalle completo de la deuda de Admin Colombia con Admin Venezuela
   * Incluye desglose por transacción y pagos realizados
   */
  async getVenezuelaDebtDetail(query: any, user: User): Promise<VenezuelaDebtSummary> {
    // Verificar permisos
    if (user.role !== UserRole.ADMIN_COLOMBIA) {
      throw new ForbiddenException('Solo Admin Colombia puede ver la deuda con Venezuela');
    }

    const { startDate, endDate } = query;

    let dateFrom: Date;
    let dateTo: Date;

    if (startDate && endDate) {
      // Crear fechas en la zona horaria local del servidor
      dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      
      dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
    } else {
      // Default: desde el principio hasta hoy
      dateFrom = new Date(0);
      dateTo = new Date();
      dateTo.setHours(23, 59, 59, 999);
    }

    // Obtener transacciones completadas con tasa de compra establecida
    const transactions = await this.transactionsRepository.find({
      where: {
        status: TransactionStatus.COMPLETADO,
        isPurchaseRateSet: true,
        createdAt: Between(dateFrom, dateTo),
      },
      relations: ['createdBy', 'beneficiary'],
      order: { createdAt: 'ASC' },
    });

    let totalDebt = 0;
    const transactionDetails: TransactionDebtDetail[] = [];

    transactions.forEach((tx) => {
      const cop = Number(tx.amountCOP) || 0;
      const bs = Number(tx.amountBs) || 0;
      const saleRate = Number(tx.saleRate) || 0;
      const purchaseRate = Number(tx.purchaseRate) || 0;

      if (!saleRate || !purchaseRate) {
        return;
      }

      // Cálculos detallados
      const bolivares = bs;
      const inversion = bolivares * purchaseRate;
      const gananciaSistema = cop - inversion;
      const gananciaAdminColombia = gananciaSistema / 2;
      const gananciaAdminVenezuela = gananciaSistema / 2;
      const deudaConVenezuela = inversion + gananciaAdminVenezuela;

      totalDebt += deudaConVenezuela;

      transactionDetails.push({
        id: tx.id,
        createdAt: tx.createdAt,
        vendorName: tx.createdBy?.name || 'N/A',
        beneficiaryFullName: tx.beneficiaryFullName,
        amountCOP: cop,
        amountBs: bs,
        saleRate,
        purchaseRate,
        inversion,
        gananciaSistema,
        gananciaAdminColombia,
        gananciaAdminVenezuela,
        deudaConVenezuela,
      });
    });

    // Obtener pagos realizados en el período
    const payments = await this.venezuelaPaymentsRepository.find({
      where: {
        createdAt: Between(dateFrom, dateTo),
      },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const paymentDetails: VenezuelaPaymentDetail[] = payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      notes: p.notes || '',
      proofUrl: p.proofUrl || '',
      createdBy: p.createdBy?.name || 'N/A',
      createdAt: p.createdAt,
      paymentDate: p.paymentDate,
    }));

    return {
      totalDebt,
      totalPaid,
      pendingDebt: totalDebt - totalPaid,
      transactionDetails,
      payments: paymentDetails,
    };
  }

  /**
   * Registra un pago de Admin Colombia a Admin Venezuela
   */
  async createVenezuelaPayment(
    createPaymentDto: CreateVenezuelaPaymentDto,
    user: User,
  ): Promise<VenezuelaPayment> {
    // Verificar permisos
    if (user.role !== UserRole.ADMIN_COLOMBIA) {
      throw new ForbiddenException('Solo Admin Colombia puede registrar pagos a Venezuela');
    }

    const payment = this.venezuelaPaymentsRepository.create({
      amount: createPaymentDto.amount,
      notes: createPaymentDto.notes,
      proofUrl: createPaymentDto.proofUrl,
      paymentDate: parseLocalDate(createPaymentDto.paymentDate),
      createdBy: { id: user.id } as any,
    });

    return await this.venezuelaPaymentsRepository.save(payment);
  }

  /**
   * Obtiene el historial completo de pagos a Venezuela
   */
  async getVenezuelaPaymentHistory(user: User): Promise<VenezuelaPayment[]> {
    // Verificar permisos
    if (user.role !== UserRole.ADMIN_COLOMBIA && user.role !== UserRole.ADMIN_VENEZUELA) {
      throw new ForbiddenException('Solo administradores pueden ver el historial de pagos');
    }

    return await this.venezuelaPaymentsRepository.find({
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Elimina un pago de Venezuela (solo para correcciones)
   */
  async deleteVenezuelaPayment(id: number, user: User): Promise<void> {
    // Verificar permisos
    if (user.role !== UserRole.ADMIN_COLOMBIA) {
      throw new ForbiddenException('Solo Admin Colombia puede eliminar pagos');
    }

    const payment = await this.venezuelaPaymentsRepository.findOne({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    await this.venezuelaPaymentsRepository.remove(payment);
  }
}

