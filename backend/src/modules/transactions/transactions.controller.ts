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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SetPurchaseRateDto } from './dto/set-purchase-rate.dto';
import { StorageService } from '../../common/services/storage.service';
import { CreateVenezuelaPaymentDto } from './dto/create-venezuela-payment.dto';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly storageService: StorageService,
  ) { }

  @Post()
  create(
    @Body() createTransactionDto: CreateTransactionDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.create(createTransactionDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: any, @Query() paginationDto: PaginationDto & { startDate?: string; endDate?: string }) {
    return this.transactionsService.findAll(user, paginationDto);
  }

  @Get('debt')
  @Roles(UserRole.VENDEDOR)
  getDebt(@CurrentUser() user: any, @Query() query: any) {
    return this.transactionsService.getDebt(user, query);
  }

  @Get('vendor-history')
  @Roles(UserRole.VENDEDOR)
  getVendorHistory(@CurrentUser() user: any, @Query() query: any) {
    return this.transactionsService.getVendorTransactions(user.id, query);
  }

  @Get('vendor-reports')
  @Roles(UserRole.VENDEDOR)
  getVendorReports(@CurrentUser() user: any, @Query() query: any) {
    return this.transactionsService.getVendorReports(user, query);
  }

  @Post('mark-as-paid')
  @Roles(UserRole.VENDEDOR)
  markAsPaid(
    @Body('transactionIds') transactionIds: number[],
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.markTransactionsAsPaid(transactionIds, user);
  }

  @Post('mark-date-range-as-paid')
  @Roles(UserRole.VENDEDOR)
  markDateRangeAsPaid(
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.markTransactionsByDateRangeAsPaid(startDate, endDate, user);
  }

  // Admin Colombia endpoints
  @Get('admin-colombia/pending')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getPendingAdminColombia() {
    return this.transactionsService.getPendingForAdminColombia();
  }

  @Get('admin-colombia/history')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getHistoryAdminColombia(@Query() query: any) {
    return this.transactionsService.getHistoryAdminColombia(query);
  }

  @Get('admin-colombia/reports')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getReportsAdminColombia(@Query() query: any) {
    return this.transactionsService.getReportsAdminColombia(query);
  }

  @Get('admin-colombia/reports/csv')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getReportsAdminColombiaCSV(@Query() query: any) {
    return this.transactionsService.getReportsAdminColombiaCSV(query);
  }

  @Post('admin-colombia/commission/mark-paid')
  @Roles(UserRole.ADMIN_COLOMBIA)
  markVendorCommissionAsPaid(
    @Body('transactionIds') transactionIds: number[],
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.markVendorCommissionAsPaid(transactionIds, user);
  }

  @Get('admin-colombia/financial-summary')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getAdminColombiaFinancialSummary(@Query() query: any) {
    return this.transactionsService.getAdminColombiaFinancialSummary(query);
  }

  @Get('admin-venezuela/financial-summary')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getAdminVenezuelaFinancialSummary(@Query() query: any) {
    return this.transactionsService.getAdminVenezuelaFinancialSummary(query);
  }

  // Admin Venezuela endpoints
  @Get('pending-venezuela')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getPendingVenezuela() {
    return this.transactionsService.getPendingVenezuela();
  }

  @Get('history-admin')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getHistoryAdmin(@Query() query: any) {
    return this.transactionsService.getHistoryAdmin(query);
  }

  @Get('reports')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getReports(@Query() query: any) {
    return this.transactionsService.getReports(query);
  }

  @Get('reports/csv')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getReportsCSV(@Query() query: any) {
    return this.transactionsService.getReportsCSV(query);
  }

  /**
   * Completa una transferencia con comprobante opcional
   * El archivo se sube a Supabase Storage
   */
  @Post(':id/complete')
  @Roles(UserRole.ADMIN_VENEZUELA)
  @UseInterceptors(
    FileInterceptor('voucher', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        if (file && !file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
          return cb(new BadRequestException('Solo se permiten imágenes y PDFs'), false);
        }
        cb(null, true);
      },
    }),
  )
  async completeTransfer(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    let voucherPath: string | null = null;

    // Si hay archivo, subirlo a Supabase Storage
    if (file) {
      voucherPath = await this.storageService.uploadFile(file, id, 'venezuela');
    }

    return this.transactionsService.completeTransfer(+id, voucherPath, user);
  }

  /**
   * Rechaza una transferencia con motivo y comprobante opcional
   * El archivo se sube a Supabase Storage
   */
  @Post(':id/reject')
  @Roles(UserRole.ADMIN_VENEZUELA)
  @UseInterceptors(
    FileInterceptor('voucher', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        if (file && !file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
          return cb(new BadRequestException('Solo se permiten imágenes y PDFs'), false);
        }
        cb(null, true);
      },
    }),
  )
  async rejectTransfer(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    const reason = body.reason;
    if (!reason) {
      throw new BadRequestException('El motivo del rechazo es requerido');
    }

    let voucherPath: string | null = null;

    // Si hay archivo, subirlo a Supabase Storage
    if (file) {
      voucherPath = await this.storageService.uploadFile(file, id, 'rejection');
    }

    return this.transactionsService.rejectTransfer(+id, reason, voucherPath, user);
  }

  @Post(':id/cancel-admin')
  @Roles(UserRole.ADMIN_VENEZUELA)
  cancelByAdmin(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.cancelByAdmin(+id, reason, user);
  }

  /**
   * Establece la tasa de compra para una transacción específica
   */
  @Patch(':id/purchase-rate')
  @Roles(UserRole.ADMIN_VENEZUELA)
  setPurchaseRate(
    @Param('id') id: string,
    @Body() setPurchaseRateDto: SetPurchaseRateDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.setPurchaseRate(+id, setPurchaseRateDto, user);
  }

  /**
   * Establece la tasa de compra para múltiples transacciones
   */
  @Post('bulk/purchase-rate')
  @Roles(UserRole.ADMIN_VENEZUELA)
  bulkSetPurchaseRate(
    @Body() setPurchaseRateDto: SetPurchaseRateDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.bulkSetPurchaseRate(setPurchaseRateDto, user);
  }

  /**
   * Obtiene transacciones pendientes de tasa de compra
   */
  @Get('pending-purchase-rate')
  @Roles(UserRole.ADMIN_VENEZUELA)
  getPendingPurchaseRateTransactions(
    @Query() query: { startDate?: string; endDate?: string; vendorId?: number },
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.getPendingPurchaseRateTransactions(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transactionsService.findOne(+id, user);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.transactionsService.getHistory(+id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDEDOR, UserRole.CLIENTE)
  update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.update(+id, updateTransactionDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN_COLOMBIA, UserRole.ADMIN_VENEZUELA)
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTransactionStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.updateStatus(+id, updateStatusDto, user);
  }

  @Post(':id/enter-edit')
  @Roles(UserRole.VENDEDOR, UserRole.CLIENTE)
  enterEditMode(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transactionsService.enterEditMode(+id, user);
  }

  @Post(':id/cancel')
  @Roles(UserRole.VENDEDOR, UserRole.CLIENTE)
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transactionsService.cancel(+id, user);
  }

  @Post(':id/resend')
  @Roles(UserRole.VENDEDOR)
  resendRejected(
    @Param('id') id: string,
    @Body() updateData: any,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.resendRejectedTransaction(+id, updateData, user);
  }

  /**
   * Obtiene URLs firmadas para los comprobantes de una transacción
   */
  @Get(':id/proofs')
  async getTransactionProofs(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    // Primero obtener la transacción para verificar permisos
    const transaction = await this.transactionsService.findOne(+id, user);

    const result: { comprobanteCliente?: string; comprobanteVenezuela?: string } = {};

    // Generar signed URLs para cada comprobante que exista
    if (transaction.comprobanteCliente) {
      // Si es una ruta de Supabase (no local legacy)
      if (!transaction.comprobanteCliente.startsWith('/uploads/')) {
        result.comprobanteCliente = await this.storageService.getSignedUrl(transaction.comprobanteCliente);
      } else {
        result.comprobanteCliente = transaction.comprobanteCliente;
      }
    }

    if (transaction.comprobanteVenezuela) {
      if (!transaction.comprobanteVenezuela.startsWith('/uploads/')) {
        result.comprobanteVenezuela = await this.storageService.getSignedUrl(transaction.comprobanteVenezuela);
      } else {
        result.comprobanteVenezuela = transaction.comprobanteVenezuela;
      }
    }

    return result;
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN_COLOMBIA)
  remove(@Param('id') id: string) {
    return this.transactionsService.remove(+id);
  }

  // Venezuela Payment endpoints
  /**
   * Obtiene el detalle completo de la deuda con Admin Venezuela
   * Incluye desglose por transacción con todos los cálculos
   */
  @Get('venezuela-debt/detail')
  @Roles(UserRole.ADMIN_COLOMBIA)
  getVenezuelaDebtDetail(@Query() query: any, @CurrentUser() user: any) {
    return this.transactionsService.getVenezuelaDebtDetail(query, user);
  }

  /**
   * Registra un pago de Admin Colombia a Admin Venezuela
   */
  @Post('venezuela-debt/payment')
  @Roles(UserRole.ADMIN_COLOMBIA)
  createVenezuelaPayment(
    @Body() createPaymentDto: CreateVenezuelaPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.createVenezuelaPayment(createPaymentDto, user);
  }

  /**
   * Obtiene el historial de pagos a Venezuela
   */
  @Get('venezuela-debt/payments')
  @Roles(UserRole.ADMIN_COLOMBIA, UserRole.ADMIN_VENEZUELA)
  getVenezuelaPaymentHistory(@CurrentUser() user: any) {
    return this.transactionsService.getVenezuelaPaymentHistory(user);
  }

  /**
   * Elimina un pago (solo para correcciones)
   */
  @Delete('venezuela-debt/payment/:id')
  @Roles(UserRole.ADMIN_COLOMBIA)
  deleteVenezuelaPayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transactionsService.deleteVenezuelaPayment(+id, user);
  }
}
