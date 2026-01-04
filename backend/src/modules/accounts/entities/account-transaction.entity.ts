import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

export enum AccountTransactionType {
  DEPOSIT = 'deposit',     // Agregar saldo
  WITHDRAWAL = 'withdrawal', // Restar saldo (por una transacción)
}

@Entity('account_transactions')
export class AccountTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Account, account => account.transactions)
  account: Account;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number; // Monto en bolívares

  @Column({
    type: 'enum',
    enum: AccountTransactionType,
  })
  type: AccountTransactionType; // 'deposit' o 'withdrawal'

  @ManyToOne(() => Transaction, { nullable: true })
  transaction: Transaction; // Transacción relacionada (si es withdrawal)

  @Column({ nullable: true })
  description: string; // Descripción (especialmente para deposits)

  @Column('decimal', { precision: 12, scale: 2 })
  balanceBefore: number; // Saldo antes de esta operación

  @Column('decimal', { precision: 12, scale: 2 })
  balanceAfter: number; // Saldo después de esta operación

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

