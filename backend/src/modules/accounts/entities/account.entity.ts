import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AccountTransaction } from './account-transaction.entity';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // Nombre de la cuenta (ej: Bancolombia, Davivienda)

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  balance: number; // Saldo en bolívares

  @ManyToOne(() => User)
  owner: User; // Admin Venezuela que posee esta cuenta

  @OneToMany(() => AccountTransaction, transaction => transaction.account)
  transactions: AccountTransaction[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

