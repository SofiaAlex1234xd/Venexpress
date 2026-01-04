import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Client } from '../../clients/entities/client.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { TransactionHistory } from './transaction-history.entity';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { VendorPaymentMethod } from '../../../common/enums/vendor-payment-method.enum';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  createdBy: User; // vendedor o usuario app

  @ManyToOne(() => Client, { nullable: true })
  clientPresencial: Client;

  @ManyToOne(() => User, { nullable: true })
  clientApp: User;

  @ManyToOne(() => Beneficiary, { nullable: true })
  beneficiary: Beneficiary;

  @OneToMany(() => TransactionHistory, history => history.transaction)
  history: TransactionHistory[];

  // Snapshot de datos del Destinatario (inmutables)
  @Column({ nullable: true })
  beneficiaryFullName: string;

  @Column({ nullable: true })
  beneficiaryDocumentId: string;

  @Column({ nullable: true })
  beneficiaryBankName: string;

  @Column({ nullable: true })
  beneficiaryAccountNumber: string;

  @Column({ nullable: true })
  beneficiaryAccountType: string;

  @Column({ nullable: true })
  beneficiaryPhone: string;

  @Column({ nullable: true, default: false })
  beneficiaryIsPagoMovil: boolean;

  @Column('decimal', { precision: 12, scale: 2 })
  amountCOP: number;

  @Column('decimal', { precision: 12, scale: 4 })
  amountBs: number;

  @Column('decimal', { precision: 10, scale: 4, name: 'sale_rate' })
  saleRate: number; // Tasa de venta usada

  @Column('decimal', { precision: 10, scale: 4, name: 'purchase_rate', nullable: true })
  purchaseRate: number; // Tasa de compra (se establece después)

  @Column({ name: 'is_purchase_rate_set', default: false })
  isPurchaseRateSet: boolean; // Indica si ya se estableció la tasa de compra

  @Index()
  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDIENTE,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  comprobanteCliente: string; // URL del comprobante del cliente

  @Column({ nullable: true })
  comprobanteVenezuela: string; // URL del comprobante de Venezuela

  @Column({ nullable: true, name: 'vendor_payment_proof' })
  vendorPaymentProof: string; // URL del comprobante de pago inicial del vendedor (para vendedores de Venezuela)

  @Column('text', { nullable: true })
  notes: string;

  @Column('text', { nullable: true })
  rejectionReason: string; // Motivo del rechazo (separado de notes)

  @Index()
  @Column({ type: 'boolean', default: false })
  isPaidByVendor: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  paidByVendorAt: Date;

  @Column({
    type: 'enum',
    enum: VendorPaymentMethod,
    nullable: true,
    name: 'vendor_payment_method',
  })
  vendorPaymentMethod: VendorPaymentMethod; // Método de pago usado por el vendedor

  @Column({ nullable: true, name: 'vendor_payment_proof_url' })
  vendorPaymentProofUrl: string; // URL del comprobante de pago del vendedor

  // Comisión (2% de la transferencia) pagada por Admin Colombia al vendedor
  @Index()
  @Column({ type: 'boolean', default: false })
  isCommissionPaidToVendor: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  commissionPaidAt: Date;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastEditedAt: Date;

  @Column({ type: 'boolean', default: false, name: 'has_custom_rate' })
  hasCustomRate: boolean; // Indica si el vendedor usó una tasa personalizada

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, name: 'transaction_commission' })
  transactionCommission: number; // Comisión específica de esta transacción (2%, 4%, 5%, etc.)
}

