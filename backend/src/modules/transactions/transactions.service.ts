import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
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
import { StorageService } from '../../common/services/storage.service';
import { AccountsService } from '../accounts/accounts.service';

/**
 * Parsea una fecha en formato YYYY-MM-DD a un objeto Date en zona horaria local
 * Evita problemas de interpretación UTC
 */
function parseLocalDate(dateString: string): Date {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateString}`);
  }
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date values. Year: ${year}, Month: ${month}, Day: ${day}`);
  }
  // month - 1 porque los meses en Date son 0-indexados
  return new Date(year, month - 1, day);
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

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
    private storageService: StorageService,
    private accountsService: AccountsService,
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
    const hasCustomRate = !!createTransactionDto.customRate; // Bandera para tasa personalizada

    if (createTransactionDto.amountCOP) {
      amountCOP = createTransactionDto.amountCOP;
      amountBs = amountCOP / rateToUse;
    } else if (createTransactionDto.amountBs) {
      amountBs = createTransactionDto.amountBs;
      amountCOP = amountBs * rateToUse;
    } else {
      throw new Error('Debe proporcionar amountCOP o amountBs');
    }

    // Calcular la comisión para esta transacción
    let transactionCommission = user.commission || 2; // Default del usuario

    // Si es vendedor de admin_venezuela (adminId 2) y usa tasa personalizada
    if (user.adminId === 2 && hasCustomRate) {
      transactionCommission = 4; // Comisión reducida por usar tasa personalizada
    }

    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      amountCOP,
      amountBs,
      saleRate: rateToUse,
      hasCustomRate, // Agregar la bandera
      transactionCommission, // Guardar la comisión específica
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

  async createWithProof(createTransactionDto: any, file: Express.Multer.File, user: any): Promise<Transaction> {
    // Convertir los campos de string a number si vienen de FormData
    const parsedDto = {
      ...createTransactionDto,
      beneficiaryId: parseInt(createTransactionDto.beneficiaryId, 10),
      clientPresencialId: createTransactionDto.clientPresencialId ? parseInt(createTransactionDto.clientPresencialId, 10) : undefined,
      amountCOP: createTransactionDto.amountCOP ? parseFloat(createTransactionDto.amountCOP) : undefined,
      amountBs: createTransactionDto.amountBs ? parseFloat(createTransactionDto.amountBs) : undefined,
      customRate: createTransactionDto.customRate ? parseFloat(createTransactionDto.customRate) : undefined,
    };

    // Obtener tasa actual
    const currentRate = await this.ratesService.getCurrentRate();

    // Obtener Destinatario completo
    const beneficiary = await this.beneficiariesRepository.findOne({
      where: { id: parsedDto.beneficiaryId },
    });

    if (!beneficiary) {
      throw new NotFoundException('Destinatario no encontrado');
    }

    // Calcular montos según la tasa
    let amountCOP: number;
    let amountBs: number;
    const rateToUse = parsedDto.customRate || currentRate.saleRate;
    const hasCustomRate = !!parsedDto.customRate;

    if (parsedDto.amountCOP) {
      amountCOP = parsedDto.amountCOP;
      amountBs = amountCOP / rateToUse;
    } else if (parsedDto.amountBs) {
      amountBs = parsedDto.amountBs;
      amountCOP = amountBs * rateToUse;
    } else {
      throw new Error('Debe proporcionar amountCOP o amountBs');
    }

    // Calcular la comisión para esta transacción
    let transactionCommission = user.commission || 2; // Default del usuario

    // Si es vendedor de admin_venezuela (adminId 2) y usa tasa personalizada
    if (user.adminId === 2 && hasCustomRate) {
      transactionCommission = 4; // Comisión reducida por usar tasa personalizada
    }

    // Subir el comprobante de pago si se proporciona
    let vendorPaymentProof: string | null = null;
    if (file) {
      vendorPaymentProof = await this.storageService.uploadFile(file, 'temp', 'cliente');
    }

    const transaction: Transaction = this.transactionsRepository.create({
      ...parsedDto,
      amountCOP,
      amountBs,
      saleRate: rateToUse,
      hasCustomRate,
      transactionCommission, // Guardar la comisión específica
      vendorPaymentProof,
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

      lastEditedAt: new Date(),
    }) as Transaction;

    // Asociar cliente si es necesario
    if (user.role === UserRole.CLIENTE) {
      transaction.clientApp = { id: user.id } as any;
    } else if (parsedDto.clientPresencialId) {
      transaction.clientPresencial = { id: parsedDto.clientPresencialId } as any;
    }

    const savedTransaction = await this.transactionsRepository.save(transaction);

    // Actualizar la ruta del comprobante con el ID real de la transacción
    if (file && vendorPaymentProof) {
      const finalPath = await this.storageService.uploadFile(file, savedTransaction.id, 'cliente');
      savedTransaction.vendorPaymentProof = finalPath;
      await this.transactionsRepository.save(savedTransaction);
    }

    // Crear entrada en historial
    await this.createHistoryEntry(
      savedTransaction.id,
      TransactionStatus.PENDIENTE,
      'Transacción creada con comprobante de pago',
      user.id,
    );

    return savedTransaction;
  }

  async findAll(user: any, paginationDto: PaginationDto & { startDate?: string; endDate?: string }): Promise<Transaction[]> {
    const { limit, offset, startDate, endDate } = paginationDto;
    const where: any = {};

    // Filtrar según el rol
    if (user.role === UserRole.CLIENTE) {
      where.clientApp = { id: user.id };
    } else if (user.role === UserRole.VENDEDOR) {
      where.createdBy = { id: user.id };
    }

    // Agregar filtro de fecha si se proporciona
    if (startDate && endDate) {
      const dateFrom = parseLocalDate(startDate);
      dateFrom.setHours(0, 0, 0, 0);
      const dateTo = parseLocalDate(endDate);
      dateTo.setHours(23, 59, 59, 999);
      where.createdAt = Between(dateFrom, dateTo);
    }

    const transactions = await this.transactionsRepository.find({
      where,
      relations: ['createdBy', 'clientPresencial', 'clientApp', 'beneficiary'],
      withDeleted: true, // Importante para ver clientes/destinatarios eliminados en el historial
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
      withDeleted: true,
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
    if (!transactionId || isNaN(transactionId) || transactionId <= 0) {
      return [];
    }
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
    paymentMethod: string,
    user: User,
    proofPath?: string | null,
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
    const normalizedPaymentMethod = paymentMethod.toLowerCase();
    transactions.forEach(transaction => {
      transaction.isPaidByVendor = true;
      transaction.paidByVendorAt = now;
      transaction.vendorPaymentMethod = normalizedPaymentMethod as any;
      if (proofPath) {
        transaction.vendorPaymentProofUrl = proofPath;
      }
    });

    await this.transactionsRepository.save(transactions);
  }

  async markTransactionsByDateRangeAsPaid(
    startDate: string,
    endDate: string,
    paymentMethod: string,
    user: User,
    proofPath?: string | null,
  ): Promise<number> {
    if (user.role !== 'vendedor') {
      throw new ForbiddenException('Solo los vendedores pueden marcar transacciones como pagadas');
    }

    const start = parseLocalDate(startDate);
    start.setHours(0, 0, 0, 0);

    const end = parseLocalDate(endDate);
    end.setHours(23, 59, 59, 999);

    const normalizedPaymentMethod = paymentMethod.toLowerCase();
    const updateData: any = {
      isPaidByVendor: true,
      paidByVendorAt: new Date(),
      vendorPaymentMethod: normalizedPaymentMethod as any,
    };

    if (proofPath) {
      updateData.vendorPaymentProofUrl = proofPath;
    }

    const result = await this.transactionsRepository.update(
      {
        createdBy: { id: user.id },
        status: TransactionStatus.COMPLETADO,
        isPaidByVendor: false,
        createdAt: Between(start, end),
      },
      updateData,
    );

    return result.affected || 0;
  }

  async unmarkTransactionAsPaid(transactionId: number, user: User): Promise<Transaction> {
    if (user.role !== 'vendedor') {
      throw new ForbiddenException('Solo los vendedores pueden desmarcar transacciones');
    }

    const transaction = await this.transactionsRepository.findOne({
      where: {
        id: transactionId,
        createdBy: { id: user.id },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (!transaction.isPaidByVendor) {
      throw new BadRequestException('Esta transacción no está marcada como pagada');
    }

    // Revertir los campos de pago del vendedor
    transaction.isPaidByVendor = false;
    transaction.paidByVendorAt = null;
    transaction.vendorPaymentMethod = null;
    transaction.vendorPaymentProofUrl = null;

    return this.transactionsRepository.save(transaction);
  }

  async updateTransactionPayment(
    transactionId: number,
    user: User,
    paymentMethod?: string,
    proofPath?: string | null,
  ): Promise<Transaction> {
    if (user.role !== 'vendedor') {
      throw new ForbiddenException('Solo los vendedores pueden actualizar el pago');
    }

    const transaction = await this.transactionsRepository.findOne({
      where: {
        id: transactionId,
        createdBy: { id: user.id },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada');
    }

    if (!transaction.isPaidByVendor) {
      throw new BadRequestException('Esta transacción no está marcada como pagada');
    }

    if (paymentMethod) {
      transaction.vendorPaymentMethod = paymentMethod.toLowerCase() as any;
    }

    if (proofPath) {
      transaction.vendorPaymentProofUrl = proofPath;
    }

    return this.transactionsRepository.save(transaction);
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
      .withDeleted()
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

    // Generar URLs firmadas para los comprobantes de las transacciones pendientes
    const transactionsWithSignedUrls = await Promise.all(
      transactions.map(async (tx) => {
        if (tx.vendorPaymentProofUrl) {
          try {
            if (!tx.vendorPaymentProofUrl.startsWith('/uploads/')) {
              tx.vendorPaymentProofUrl = await this.storageService.getSignedUrl(tx.vendorPaymentProofUrl);
            }
          } catch (error) {
            console.error(`Error generating signed URL for transaction ${tx.id}:`, error);
          }
        }
        return tx;
      })
    );

    return {
      totalDebt: Number(totalDebt),
      paidAmount: Number(paidAmount),
      transactions: transactionsWithSignedUrls,
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
      .withDeleted()
      .where('transaction.createdBy.id = :userId', { userId })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPaidByVendor = :isPaid', { isPaid: isPaid === 'true' })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    // Generar URLs firmadas para los comprobantes de pago
    const transactionsWithSignedUrls = await Promise.all(
      data.map(async (tx) => {
        if (tx.vendorPaymentProofUrl) {
          try {
            if (!tx.vendorPaymentProofUrl.startsWith('/uploads/')) {
              tx.vendorPaymentProofUrl = await this.storageService.getSignedUrl(tx.vendorPaymentProofUrl);
            }
          } catch (error) {
            console.error(`Error generating signed URL for transaction ${tx.id}:`, error);
          }
        }
        return tx;
      })
    );

    return {
      data: transactionsWithSignedUrls,
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
    const transactions = await this.transactionsRepository.find({
      where: { status: TransactionStatus.PENDIENTE_VENEZUELA },
      relations: ['createdBy', 'clientPresencial', 'clientApp', 'beneficiary'],
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });

    // Generar URLs firmadas para los comprobantes
    const transactionsWithSignedUrls = await Promise.all(
      transactions.map(async (tx) => {
        // Generar URL firmada para comprobante del vendedor (vendorPaymentProof)
        if (tx.vendorPaymentProof) {
          try {
            if (!tx.vendorPaymentProof.startsWith('/uploads/')) {
              tx.vendorPaymentProof = await this.storageService.getSignedUrl(tx.vendorPaymentProof);
            }
          } catch (error) {
            console.error(`Error generating signed URL for vendorPaymentProof of transaction ${tx.id}:`, error);
          }
        }
        
        // Generar URL firmada para comprobante de Venezuela
        if (tx.comprobanteVenezuela) {
          try {
            if (!tx.comprobanteVenezuela.startsWith('/uploads/')) {
              tx.comprobanteVenezuela = await this.storageService.getSignedUrl(tx.comprobanteVenezuela);
            }
          } catch (error) {
            console.error(`Error generating signed URL for comprobanteVenezuela of transaction ${tx.id}:`, error);
          }
        }
        
        return tx;
      })
    );

    return transactionsWithSignedUrls;
  }

  async completeTransfer(id: number, voucherUrl: string, accountId: number | null, user: any): Promise<Transaction> {
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

    // Si se proporciona accountId, restar el saldo de la cuenta
    if (accountId) {
      const amountBs = parseFloat(transaction.amountBs.toString());
      try {
        await this.accountsService.withdrawBalance(accountId, amountBs, id, user.id);
        this.logger.log(`Saldo retirado de cuenta ${accountId}: ${amountBs} Bs para transacción #${id}`);
      } catch (error) {
        // Si falla el retiro, lanzar el error para que no se complete la transacción
        throw error;
      }
    }

    transaction.status = TransactionStatus.COMPLETADO;
    if (voucherUrl) {
      transaction.comprobanteVenezuela = voucherUrl;
    }

    const updated = await this.transactionsRepository.save(transaction);

    await this.createHistoryEntry(
      id,
      TransactionStatus.COMPLETADO,
      accountId 
        ? 'Transferencia completada por administrador Venezuela con retiro de cuenta'
        : 'Transferencia completada por administrador Venezuela',
      user.id,
    );

    return updated;
  }

  async updateVoucher(id: number, voucherUrl: string, user: any): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transacción con ID ${id} no encontrada`);
    }

    if (
      transaction.status !== TransactionStatus.COMPLETADO &&
      transaction.status !== TransactionStatus.RECHAZADO
    ) {
      throw new BadRequestException(
        'Solo se puede actualizar el comprobante en transacciones completadas o rechazadas',
      );
    }

    const oldVoucher = transaction.comprobanteVenezuela;
    transaction.comprobanteVenezuela = voucherUrl;

    const updated = await this.transactionsRepository.save(transaction);

    await this.createHistoryEntry(
      id,
      transaction.status,
      `Comprobante actualizado por administrador Venezuela${oldVoucher ? ' (reemplazó anterior)' : ''}`,
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
      .leftJoinAndSelect('transaction.clientApp', 'clientApp')
      .withDeleted();

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
   * Filtra solo transacciones de vendedores de Admin Colombia (adminId = 1)
   */
  async getAdminColombiaFinancialSummary(query: any): Promise<any> {
    const { startDate, endDate } = query;
    const ADMIN_COLOMBIA_ID = 1; // ID fijo del admin de Colombia

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

    // Para comisiones: TODAS las transacciones completadas de vendedores de Admin Colombia (no necesita tasa de compra)
    const allCompletedTransactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'user')
      .where('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('(user.adminId = :adminId OR (user.role = :role AND user.adminId IS NULL))', { 
        adminId: ADMIN_COLOMBIA_ID, 
        role: UserRole.VENDEDOR 
      })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();

    // Para ganancias/deudas: solo transacciones con tasa de compra definitiva de vendedores de Admin Colombia
    const transactionsWithPurchaseRate = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'user')
      .where('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPurchaseRateSet = :isPurchaseRateSet', { isPurchaseRateSet: true })
      .andWhere('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('(user.adminId = :adminId OR (user.role = :role AND user.adminId IS NULL))', { 
        adminId: ADMIN_COLOMBIA_ID, 
        role: UserRole.VENDEDOR 
      })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();

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

    // Calcular comisiones de TODAS las transacciones completadas
    allCompletedTransactions.forEach((tx) => {
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
      const commissionPercentage = (tx.createdBy?.commission || 2) / 100; // Usar comisión del usuario o default 2%
      const commission = cop * commissionPercentage;

      const vendorAgg = byVendor[vendorId];
      vendorAgg.totalCommission += commission;
      globalCommissionTotal += commission;

      if (tx.isCommissionPaidToVendor) {
        vendorAgg.commissionPaid += commission;
        globalCommissionPaid += commission;
      }
    });

    // Calcular ganancias y deudas solo de transacciones con tasa de compra definitiva
    transactionsWithPurchaseRate.forEach((tx) => {
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

      const vendorAgg = byVendor[vendorId];
      vendorAgg.adminColombiaEarnings += gananciaAdminColombia;
      vendorAgg.amountOwedToVenezuela += deudaColombiaConVenezuela;

      globalAdminColombiaEarnings += gananciaAdminColombia;
      globalAmountOwedToVenezuela += deudaColombiaConVenezuela;
    });

    // Calcular pendientes por vendedor
    Object.values(byVendor).forEach((agg) => {
      agg.commissionPending = agg.totalCommission - agg.commissionPaid;
    });

    // Detectar si hay transacciones completadas sin tasa de compra definitiva
    const transactionsWithoutPurchaseRate = allCompletedTransactions.filter(
      (tx) => !tx.isPurchaseRateSet || tx.purchaseRate === null,
    );
    const hasTransactionsWithoutPurchaseRate = transactionsWithoutPurchaseRate.length > 0;

    return {
      global: {
        totalCommission: globalCommissionTotal,
        commissionPaid: globalCommissionPaid,
        commissionPending: globalCommissionTotal - globalCommissionPaid,
        adminColombiaEarnings: globalAdminColombiaEarnings,
        amountOwedToVenezuela: globalAmountOwedToVenezuela,
        hasTransactionsWithoutPurchaseRate,
        transactionsWithoutPurchaseRateCount: transactionsWithoutPurchaseRate.length,
      },
      byVendor: Object.values(byVendor),
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  /**
   * Resumen financiero para Admin Venezuela: ganancias y deuda de Colombia + comisiones de sus vendedores.
   * Usa solo transacciones COMPLETADAS con tasa de compra establecida.
   * 
   * Ganancias = 50/50 de Admin Colombia + 5% de transacciones de sus vendedores
   */
  async getAdminVenezuelaFinancialSummary(query: any): Promise<any> {
    const { startDate, endDate } = query;
    const ADMIN_VENEZUELA_ID = 2; // ID fijo del admin de Venezuela

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

    // Para ganancias/deudas: solo transacciones con tasa de compra definitiva
    const transactionsWithPurchaseRate = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'user')
      .where('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPurchaseRateSet = :isPurchaseRateSet', { isPurchaseRateSet: true })
      .andWhere('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();

    // Detectar si hay transacciones completadas sin tasa de compra definitiva
    const allCompletedTransactions = await this.transactionsRepository.find({
      where: {
        status: TransactionStatus.COMPLETADO,
        createdAt: Between(dateFrom, dateTo),
      },
      relations: ['createdBy'],
    });
    const transactionsWithoutPurchaseRate = allCompletedTransactions.filter(
      (tx) => !tx.isPurchaseRateSet || tx.purchaseRate === null,
    );
    const hasTransactionsWithoutPurchaseRate = transactionsWithoutPurchaseRate.length > 0;

    let totalEarningsFromColombia = 0; // Ganancias 50/50 de Admin Colombia
    let totalEarningsFromOwnVendors = 0; // Ganancias 5% de sus vendedores
    let totalEarnings = 0; // Total
    let totalDebtFromColombia = 0; // Deuda de Admin Colombia con Venezuela (SOLO de sus vendedores)

    // Procesar transacciones para ganancias
    transactionsWithPurchaseRate.forEach((tx) => {
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
      const gananciaAdminVenezuela = gananciaSistema / 2; // La otra mitad de Admin Colombia
      const deudaColombiaConVenezuela = inversion + (gananciaSistema / 2); // Inversión + mitad de Colombia

      // IMPORTANTE: Solo contar ganancias y deuda de transacciones de vendedores de Admin Colombia
      // Las transacciones de vendedores de Admin Venezuela NO generan deuda de Colombia
      const isAdminColombiaVendor = !tx.createdBy?.adminId || tx.createdBy?.adminId === 1;
      
      if (isAdminColombiaVendor) {
        // Transacción de Admin Colombia: cuenta para deuda y ganancias 50/50
        totalEarningsFromColombia += gananciaAdminVenezuela;
        totalDebtFromColombia += deudaColombiaConVenezuela;
      }

      // Si la transacción es de sus propios vendedores, agregar comisión (usar transactionCommission)
      if (tx.createdBy?.adminId === ADMIN_VENEZUELA_ID) {
        const commissionRate = tx.transactionCommission || tx.createdBy?.commission || 5;
        const commissionOwnVendor = cop * (commissionRate / 100);
        totalEarningsFromOwnVendors += commissionOwnVendor;
      }
    });

    totalEarnings = totalEarningsFromColombia + totalEarningsFromOwnVendors;

    // Detalles de comisiones de vendedores propios
    const ownVendorsCommissionsDetail = transactionsWithPurchaseRate
      .filter((tx) => tx.createdBy?.adminId === ADMIN_VENEZUELA_ID)
      .map((tx) => {
        const cop = Number(tx.amountCOP) || 0;
        const commissionRate = tx.transactionCommission || tx.createdBy?.commission || 5;
        const commissionAmount = cop * (commissionRate / 100);

        return {
          id: tx.id,
          createdAt: tx.createdAt,
          vendorName: tx.createdBy?.name || 'N/A',
          beneficiaryFullName: tx.beneficiaryFullName,
          amountCOP: cop,
          commissionRate,
          commissionAmount,
          hasCustomRate: tx.hasCustomRate || false,
          isPaid: tx.isCommissionPaidToVendor,
        };
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

    // Calcular detalles de transacciones (SOLO de Admin Colombia)
    const transactionDetails = transactionsWithPurchaseRate
      .filter((tx) => !tx.createdBy?.adminId || tx.createdBy?.adminId === 1) // Solo de Admin Colombia
      .map((tx) => {
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

    // Generar URLs firmadas para los comprobantes de los pagos
    const paymentsWithSignedUrls = await Promise.all(
      payments.map(async (p) => {
        let proofUrl = '';
        if (p.proofUrl) {
          try {
            // Si es una ruta de Supabase (no local legacy), generar signed URL
            if (!p.proofUrl.startsWith('/uploads/')) {
              proofUrl = await this.storageService.getSignedUrl(p.proofUrl);
            } else {
              proofUrl = p.proofUrl;
            }
          } catch (error) {
            console.error(`Error generating signed URL for payment ${p.id}:`, error);
            proofUrl = p.proofUrl; // Fallback a la ruta original
          }
        }
        return {
          id: p.id,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
          paidBy: p.createdBy?.name,
          notes: p.notes,
          proofUrl,
        };
      })
    );

    return {
      totalEarnings, // Ganancias totales de Admin Venezuela (50/50 de Colombia + comisiones de sus vendedores)
      totalEarningsFromColombia, // Desglose: 50/50 de Admin Colombia
      totalEarningsFromOwnVendors, // Desglose: comisiones de sus vendedores (4% o 5%)
      totalDebtFromColombia, // Deuda total de Admin Colombia
      totalPaid, // Total pagado por Admin Colombia en este período
      pendingDebt: totalDebtFromColombia - totalPaid, // Deuda pendiente
      transactionCount: transactionsWithPurchaseRate.length,
      transactionDetails, // Detalles con cálculos
      ownVendorsCommissionsDetail, // Nuevo: Detalles de comisiones de vendedores propios
      payments: paymentsWithSignedUrls,
      dateRange: { from: dateFrom, to: dateTo },
      hasTransactionsWithoutPurchaseRate,
      transactionsWithoutPurchaseRateCount: transactionsWithoutPurchaseRate.length,
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

    // Aplicar filtros de fecha si existen y son válidos
    if (startDate && endDate && typeof startDate === 'string' && typeof endDate === 'string' && startDate.trim() && endDate.trim()) {
      try {
        const dateFrom = parseLocalDate(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        const dateTo = parseLocalDate(endDate);
        dateTo.setHours(23, 59, 59, 999);
        whereConditions.createdAt = Between(dateFrom, dateTo);
      } catch (error) {
        // Si hay error parseando fechas, ignorar el filtro de fecha
        console.warn('Error parsing dates in getVendorReports:', error);
      }
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

    // Ganancias del vendedor (usando transactionCommission específica)
    const vendorEarningsTotal = completedTransactions.reduce((sum, t) => {
      const copValue = parseFloat(t.amountCOP.toString());
      // Usar la comisión específica de la transacción, fallback al commission del usuario
      const commissionPercentage = (t.transactionCommission || user.commission || 2) / 100;
      return sum + copValue * commissionPercentage;
    }, 0);

    const vendorEarningsPaid = completedTransactions
      .filter(t => t.isCommissionPaidToVendor)
      .reduce((sum, t) => {
        const copValue = parseFloat(t.amountCOP.toString());
        // Usar la comisión específica de la transacción
        const commissionPercentage = (t.transactionCommission || user.commission || 2) / 100;
        return sum + copValue * commissionPercentage;
      }, 0);

    const vendorEarningsPending = vendorEarningsTotal - vendorEarningsPaid;

    // Detalle de comisiones por transacción
    const commissionsDetail = completedTransactions.map(t => ({
      id: t.id,
      date: t.createdAt,
      beneficiaryName: t.beneficiaryFullName,
      amountCOP: parseFloat(t.amountCOP.toString()),
      commissionRate: t.transactionCommission || user.commission || 2,
      commissionAmount: parseFloat(t.amountCOP.toString()) * ((t.transactionCommission || user.commission || 2) / 100),
      isPaid: t.isCommissionPaidToVendor,
      hasCustomRate: t.hasCustomRate || false,
    }));

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
      commissionsDetail, // Nuevo campo
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
    const ADMIN_COLOMBIA_ID = 1; // ID fijo del admin de Colombia
    const transactions = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.point', 'point')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp')
      .leftJoinAndSelect('transaction.beneficiary', 'beneficiary')
      .where('transaction.status = :status', { status: TransactionStatus.PENDIENTE_VENEZUELA })
      .andWhere('(createdBy.adminId = :adminId OR (createdBy.role = :role AND createdBy.adminId IS NULL))', { 
        adminId: ADMIN_COLOMBIA_ID, 
        role: UserRole.VENDEDOR 
      })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();

    // Generar URLs firmadas para los comprobantes
    const transactionsWithSignedUrls = await Promise.all(
      transactions.map(async (tx) => {
        // Generar URL firmada para comprobante del vendedor (vendorPaymentProof)
        if (tx.vendorPaymentProof) {
          try {
            if (!tx.vendorPaymentProof.startsWith('/uploads/')) {
              tx.vendorPaymentProof = await this.storageService.getSignedUrl(tx.vendorPaymentProof);
            }
          } catch (error) {
            console.error(`Error generating signed URL for vendorPaymentProof of transaction ${tx.id}:`, error);
          }
        }
        
        // Generar URL firmada para comprobante de Venezuela
        if (tx.comprobanteVenezuela) {
          try {
            if (!tx.comprobanteVenezuela.startsWith('/uploads/')) {
              tx.comprobanteVenezuela = await this.storageService.getSignedUrl(tx.comprobanteVenezuela);
            }
          } catch (error) {
            console.error(`Error generating signed URL for comprobanteVenezuela of transaction ${tx.id}:`, error);
          }
        }
        
        return tx;
      })
    );

    return transactionsWithSignedUrls;
  }

  async getHistoryAdminColombia(query: any): Promise<Transaction[]> {
    const { status, startDate, endDate, vendorId } = query;
    const ADMIN_COLOMBIA_ID = 1; // ID fijo del admin de Colombia

    console.log('🇨🇴 getHistoryAdminColombia called with:', { status, startDate, endDate, vendorId });

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.point', 'point')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp');

    // Filter by Admin Colombia's vendors only
    queryBuilder.andWhere('(createdBy.adminId = :adminId OR (createdBy.role = :role AND createdBy.adminId IS NULL))', { 
      adminId: ADMIN_COLOMBIA_ID, 
      role: UserRole.VENDEDOR 
    });

    // Filter by vendor if provided and valid
    if (vendorId !== undefined && vendorId !== null && vendorId !== '') {
      const vendorIdNum = typeof vendorId === 'string' ? parseInt(vendorId, 10) : Number(vendorId);
      if (!isNaN(vendorIdNum) && vendorIdNum > 0) {
        queryBuilder.andWhere('transaction.createdBy.id = :vendorId', { vendorId: vendorIdNum });
      }
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

    const transactions = await queryBuilder.getMany();

    console.log('🇨🇴 Found transactions:', transactions.length);
    if (transactions.length > 0) {
      console.log('🇨🇴 Sample transaction:', {
        id: transactions[0].id,
        status: transactions[0].status,
        amountCOP: transactions[0].amountCOP,
        createdBy: transactions[0].createdBy?.name,
        adminId: transactions[0].createdBy?.adminId,
        isCommissionPaidToVendor: transactions[0].isCommissionPaidToVendor,
        createdAt: transactions[0].createdAt,
      });
    }

    // Generar URLs firmadas para los comprobantes de pago
    const transactionsWithSignedUrls = await Promise.all(
      transactions.map(async (tx) => {
        if (tx.vendorPaymentProofUrl) {
          try {
            if (!tx.vendorPaymentProofUrl.startsWith('/uploads/')) {
              tx.vendorPaymentProofUrl = await this.storageService.getSignedUrl(tx.vendorPaymentProofUrl);
            }
          } catch (error) {
            console.error(`Error generating signed URL for transaction ${tx.id}:`, error);
          }
        }
        return tx;
      })
    );

    return transactionsWithSignedUrls;
  }

  async getReportsAdminColombia(query: any): Promise<any> {
    const { startDate, endDate, vendorId } = query;
    const ADMIN_COLOMBIA_ID = 1; // ID fijo del admin de Colombia

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
      .where('transaction.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('(createdBy.adminId = :adminId OR (createdBy.role = :role AND createdBy.adminId IS NULL))', { 
        adminId: ADMIN_COLOMBIA_ID, 
        role: UserRole.VENDEDOR 
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
    const ADMIN_COLOMBIA_ID = 1; // ID fijo del admin de Colombia

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
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('(createdBy.adminId = :adminId OR (createdBy.role = :role AND createdBy.adminId IS NULL))', { 
        adminId: ADMIN_COLOMBIA_ID, 
        role: UserRole.VENDEDOR 
      });

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
   * Obtiene estadísticas mensuales del año actual para gráficos de largo plazo
   */
  async getMonthlyStats(user: any): Promise<any[]> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const dateFrom = new Date(currentYear, 0, 1);
    const dateTo = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const transactions = await this.transactionsRepository.find({
      where: {
        createdAt: Between(dateFrom, dateTo),
        status: TransactionStatus.COMPLETADO,
      },
      order: { createdAt: 'ASC' },
    });

    const months = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];

    const stats = months.map((month, index) => ({
      name: month,
      monthIndex: index,
      amountCOP: 0,
      amountBs: 0,
      earnings: 0,
      count: 0
    }));

    transactions.forEach(tx => {
      const txDate = new Date(tx.createdAt);
      const txMonth = txDate.getMonth();
      const cop = Number(tx.amountCOP) || 0;
      const bs = Number(tx.amountBs) || 0;
      const purchaseRate = Number(tx.purchaseRate) || 0;

      stats[txMonth].count++;
      stats[txMonth].amountCOP += cop;
      stats[txMonth].amountBs += bs;

      // Ganancia para el administrador correspondiente (estimada si hay tasa de compra)
      if (tx.isPurchaseRateSet && purchaseRate > 0) {
        const inversion = bs * purchaseRate;
        const gananciaSistema = cop - inversion;
        // Se asume 50% para cada admin como en otros cálculos
        stats[txMonth].earnings += (gananciaSistema / 2);
      }
    });

    return stats;
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

    // Si se solicita eliminar la tasa de compra
    if (setPurchaseRateDto.removeRate) {
      transaction.purchaseRate = null;
      transaction.isPurchaseRateSet = false;
      await this.createHistoryEntry(
        transaction.id,
        TransactionStatus.COMPLETADO,
        `Tasa de compra eliminada por ${user.name}`,
        user.id,
      );
      return this.transactionsRepository.save(transaction);
    }

    // Si se proporciona una nueva tasa de compra, actualizarla
    if (setPurchaseRateDto.purchaseRate !== undefined && setPurchaseRateDto.purchaseRate !== null) {
      transaction.purchaseRate = setPurchaseRateDto.purchaseRate;
    }

    // Si se marca como final, actualizar el estado y el historial
    if (setPurchaseRateDto.isFinal) {
      transaction.isPurchaseRateSet = true;
      await this.createHistoryEntry(
        transaction.id,
        TransactionStatus.TASA_COMPRA_ESTABLECIDA,
        `Tasa de compra establecida en ${transaction.purchaseRate} (definitiva) por ${user.name}`,
        user.id,
      );
    } else if (setPurchaseRateDto.purchaseRate !== undefined && setPurchaseRateDto.purchaseRate !== null) {
      // Si solo se actualiza la tasa sin marcar como final, mantener isPurchaseRateSet en false
      transaction.isPurchaseRateSet = false;
      await this.createHistoryEntry(
        transaction.id,
        TransactionStatus.COMPLETADO,
        `Tasa de compra actualizada a ${transaction.purchaseRate} (no definitiva) por ${user.name}`,
        user.id,
      );
    }

    return this.transactionsRepository.save(transaction);
  }

  /**
   * Establece la tasa de compra para múltiples transacciones
   * También puede eliminar tasas o marcar como definitivas
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
      .where('transaction.status = :status', { status: TransactionStatus.COMPLETADO });

    // Si se solicita eliminar la tasa, buscar transacciones con tasa asignada
    // Si no, buscar transacciones sin tasa definitiva
    if (setPurchaseRateDto.removeRate) {
      query = query.andWhere('transaction.purchaseRate IS NOT NULL');
    } else {
      query = query.andWhere('transaction.isPurchaseRateSet = :isSet', { isSet: false });
    }

    // Filtrar por IDs específicos si se proporcionan
    if (setPurchaseRateDto.transactionIds?.length > 0) {
      query = query.andWhere('transaction.id IN (:...ids)', {
        ids: setPurchaseRateDto.transactionIds,
      });
    }

    // Filtrar por fecha si se proporciona
    if (setPurchaseRateDto.date) {
      // date es siempre string en formato YYYY-MM-DD según el DTO
      const startDate = parseLocalDate(setPurchaseRateDto.date);
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

    // Preparar los datos de actualización
    const updateData: any = {};

    // Si se solicita eliminar la tasa
    if (setPurchaseRateDto.removeRate) {
      updateData.purchaseRate = null;
      updateData.isPurchaseRateSet = false;
    } else {
      // Si se proporciona una nueva tasa de compra, actualizarla
      if (setPurchaseRateDto.purchaseRate !== undefined && setPurchaseRateDto.purchaseRate !== null) {
        updateData.purchaseRate = setPurchaseRateDto.purchaseRate;
      }
      // Si se marca como final
      if (setPurchaseRateDto.isFinal) {
        updateData.isPurchaseRateSet = true;
      } else if (setPurchaseRateDto.purchaseRate !== undefined && setPurchaseRateDto.purchaseRate !== null) {
        // Si solo se actualiza la tasa sin marcar como final
        updateData.isPurchaseRateSet = false;
      }
    }

    // Actualizar por IDs usando el repositorio (evita problemas de alias en UPDATE)
    const updateResult = await this.transactionsRepository.update(
      { id: In(ids) },
      updateData,
    );

    // Crear entradas de historial para las transacciones actualizadas
    await Promise.all(
      transactions.map((transaction) => {
        if (setPurchaseRateDto.removeRate) {
          return this.createHistoryEntry(
            transaction.id,
            TransactionStatus.COMPLETADO,
            `Tasa de compra eliminada (actualización masiva) por ${user.name}`,
            user.id,
          );
        } else if (setPurchaseRateDto.isFinal && setPurchaseRateDto.purchaseRate !== undefined) {
          return this.createHistoryEntry(
            transaction.id,
            TransactionStatus.TASA_COMPRA_ESTABLECIDA,
            `Tasa de compra establecida en ${setPurchaseRateDto.purchaseRate} (definitiva, actualización masiva) por ${user.name}`,
            user.id,
          );
        } else if (setPurchaseRateDto.purchaseRate !== undefined) {
          return this.createHistoryEntry(
            transaction.id,
            TransactionStatus.COMPLETADO,
            `Tasa de compra actualizada a ${setPurchaseRateDto.purchaseRate} (no definitiva, actualización masiva) por ${user.name}`,
            user.id,
          );
        }
        return Promise.resolve();
      }),
    );

    let message = '';
    if (setPurchaseRateDto.removeRate) {
      message = `Se eliminó la tasa de compra de ${updateResult.affected || 0} transacciones`;
    } else if (setPurchaseRateDto.isFinal) {
      message = `Se marcó como definitiva la tasa de compra para ${updateResult.affected || 0} transacciones`;
    } else if (setPurchaseRateDto.purchaseRate !== undefined) {
      message = `Se actualizó la tasa de compra para ${updateResult.affected || 0} transacciones`;
    }

    return {
      message,
      affected: updateResult.affected || 0,
    };
  }

  /**
   * Obtiene transacciones pendientes de tasa de compra
   * Excluye las que ya tienen una tasa asignada (aunque no esté marcada como definitiva)
   */
  async getPendingPurchaseRateTransactions(
    query: { startDate?: string; endDate?: string; vendorId?: number },
    user: User,
  ): Promise<Transaction[]> {
    let queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.beneficiary', 'beneficiary')
      .where('transaction.isPurchaseRateSet = :isSet', { isSet: false })
      .andWhere('transaction.purchaseRate IS NULL')
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO });

    // Filtrar por rango de fechas
    if (query.startDate) {
      const start = parseLocalDate(query.startDate);
      start.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: start });
    }
    if (query.endDate) {
      // Forzar final del día en zona horaria local
      const end = parseLocalDate(query.endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: end });
    }

    // Filtrar por vendedor si se proporciona
    if (query.vendorId) {
      queryBuilder.andWhere('createdBy.id = :vendorId', { vendorId: query.vendorId });
    }

    return queryBuilder.orderBy('transaction.createdAt', 'DESC').getMany();
  }

  /**
   * Obtiene transacciones con tasa de compra asignada pero NO marcadas como definitivas
   * Estas son las transacciones que el admin puede editar, marcar como definitivas, o eliminar la tasa
   */
  async getTransactionsWithPurchaseRate(
    query: { startDate?: string; endDate?: string; vendorId?: number },
    user: User,
  ): Promise<Transaction[]> {
    let queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.beneficiary', 'beneficiary')
      .leftJoinAndSelect('transaction.history', 'history')
      .where('transaction.purchaseRate IS NOT NULL')
      .andWhere('transaction.isPurchaseRateSet = :isSet', { isSet: false })
      .andWhere('transaction.status = :status', { status: TransactionStatus.COMPLETADO });

    // Filtrar por rango de fechas
    if (query.startDate) {
      const start = parseLocalDate(query.startDate);
      start.setHours(0, 0, 0, 0);
      queryBuilder = queryBuilder.andWhere('transaction.createdAt >= :startDate', { startDate: start });
    }
    if (query.endDate) {
      // Forzar final del día en zona horaria local
      const end = parseLocalDate(query.endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate: end });
    }

    // Filtrar por vendedor si se proporciona
    if (query.vendorId) {
      queryBuilder.andWhere('createdBy.id = :vendorId', { vendorId: query.vendorId });
    }

    return queryBuilder.orderBy('transaction.createdAt', 'DESC').getMany();
  }

  /**
   * Obtiene transacciones pendientes de tasa de compra
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

    // Obtener transacciones completadas con tasa de compra establecida de vendedores de este Admin Colombia
    const transactionsWithRate = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('transaction.beneficiary', 'beneficiary')
      .where('transaction.status = :status', { status: TransactionStatus.COMPLETADO })
      .andWhere('transaction.isPurchaseRateSet = :isPurchaseRateSet', { isPurchaseRateSet: true })
      .andWhere('createdBy.adminId = :adminId', { adminId: user.id })
      .andWhere('transaction.createdAt >= :dateFrom', { dateFrom })
      .andWhere('transaction.createdAt <= :dateTo', { dateTo })
      .orderBy('transaction.createdAt', 'ASC')
      .getMany();

    let totalDebt = 0;
    const transactionDetails: TransactionDebtDetail[] = [];

    transactionsWithRate.forEach((tx) => {
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

    const paymentDetails: VenezuelaPaymentDetail[] = await Promise.all(
      payments.map(async (p) => {
        let proofUrl = '';
        if (p.proofUrl) {
          try {
            // Si es una ruta de Supabase (no local legacy), generar signed URL
            if (!p.proofUrl.startsWith('/uploads/')) {
              proofUrl = await this.storageService.getSignedUrl(p.proofUrl);
            } else {
              proofUrl = p.proofUrl;
            }
          } catch (error) {
            console.error(`Error generating signed URL for payment ${p.id}:`, error);
            proofUrl = p.proofUrl; // Fallback a la ruta original
          }
        }
        return {
          id: p.id,
          amount: Number(p.amount),
          notes: p.notes || '',
          proofUrl,
          createdBy: p.createdBy?.name || 'N/A',
          createdAt: p.createdAt,
          paymentDate: p.paymentDate,
        };
      })
    );

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

  /**
   * Obtiene el historial de transacciones de Admin Venezuela (de sus vendedores)
   * Solo muestra transacciones completadas, rechazadas o canceladas
   */
  async getHistoryAdminVenezuela(query: any): Promise<Transaction[]> {
    const { status, startDate, endDate, vendorId } = query;
    const ADMIN_VENEZUELA_ID = 2; // ID fijo del admin de Venezuela

    console.log('🇻🇪 getHistoryAdminVenezuela called with:', { status, startDate, endDate, vendorId });

    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'createdBy')
      .leftJoinAndSelect('createdBy.point', 'point')
      .leftJoinAndSelect('transaction.clientPresencial', 'clientPresencial')
      .leftJoinAndSelect('transaction.clientApp', 'clientApp');

    // Filter by Admin Venezuela's vendors only (igual que Admin Colombia pero con ID 2)
    queryBuilder.andWhere('createdBy.adminId = :adminId', { 
      adminId: ADMIN_VENEZUELA_ID
    });

    // Filter by vendor if provided and valid
    if (vendorId !== undefined && vendorId !== null && vendorId !== '') {
      const vendorIdNum = typeof vendorId === 'string' ? parseInt(vendorId, 10) : Number(vendorId);
      if (!isNaN(vendorIdNum) && vendorIdNum > 0) {
        queryBuilder.andWhere('transaction.createdBy.id = :vendorId', { vendorId: vendorIdNum });
      }
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

    const transactions = await queryBuilder.getMany();

    console.log('🇻🇪 Found transactions:', transactions.length);
    if (transactions.length > 0) {
      console.log('🇻🇪 Sample transaction:', {
        id: transactions[0].id,
        status: transactions[0].status,
        amountCOP: transactions[0].amountCOP,
        createdBy: transactions[0].createdBy?.name,
        adminId: transactions[0].createdBy?.adminId,
        isCommissionPaidToVendor: transactions[0].isCommissionPaidToVendor,
        createdAt: transactions[0].createdAt,
      });
    }

    // Generar URLs firmadas para los comprobantes de pago
    const transactionsWithSignedUrls = await Promise.all(
      transactions.map(async (tx) => {
        if (tx.vendorPaymentProofUrl) {
          try {
            if (!tx.vendorPaymentProofUrl.startsWith('/uploads/')) {
              tx.vendorPaymentProofUrl = await this.storageService.getSignedUrl(tx.vendorPaymentProofUrl);
            }
          } catch (error) {
            console.error(`Error generating signed URL for transaction ${tx.id}:`, error);
          }
        }
        return tx;
      })
    );

    return transactionsWithSignedUrls;
  }

  /**
   * Marca la comisión (5%) como pagada al vendedor para un conjunto de transacciones
   * Solo Admin Venezuela puede ejecutar esta acción.
   */
  async markVendorCommissionAsPaidVenezuela(transactionIds: number[], user: User): Promise<{ affected: number }> {
    if (user.role !== UserRole.ADMIN_VENEZUELA) {
      throw new ForbiddenException('Solo Admin Venezuela puede marcar comisiones como pagadas');
    }

    if (!transactionIds || transactionIds.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos una transacción');
    }

    const ADMIN_VENEZUELA_ID = 2; // ID fijo del admin de Venezuela

    const transactions = await this.transactionsRepository.find({
      where: {
        id: In(transactionIds),
        status: TransactionStatus.COMPLETADO,
        createdBy: { adminId: ADMIN_VENEZUELA_ID },
      },
      relations: ['createdBy'],
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
}

