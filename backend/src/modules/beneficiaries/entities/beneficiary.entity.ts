import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';

@Entity('beneficiaries')
export class Beneficiary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fullName: string;

  @Index()
  @Column()
  documentId: string;

  @Column()
  bankName: string; // Nombre del banco o código de banco (para pago móvil)

  @Column({ nullable: true })
  accountNumber: string; // Null si es pago móvil

  @Column({ nullable: true })
  accountType: string; // ahorro, corriente - Null si es pago móvil

  @Column({ nullable: true })
  phone: string; // Requerido para pago móvil

  @Column({ default: false })
  isPagoMovil: boolean; // Indica si es pago móvil o transferencia bancaria

  @ManyToOne(() => Client, { nullable: true })
  clientColombia: Client;

  @ManyToOne(() => User, { nullable: true })
  userApp: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}

