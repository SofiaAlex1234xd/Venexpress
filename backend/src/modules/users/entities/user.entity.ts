import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Point } from '../../points/entities/point.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CLIENTE,
  })
  role: UserRole;

  @Column({ nullable: true })
  pointId: number;

  @ManyToOne(() => Point, (point) => point.vendedores, { nullable: true })
  @JoinColumn({ name: 'pointId' })
  point: Point;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debt: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ default: false })
  isBanned: boolean;

  @Column({ type: 'int', nullable: true, comment: 'Comisión: 2 o 5%' })
  commission: number;

  @Column({ type: 'int', nullable: true, comment: 'ID del Admin a quien pertenece este vendedor' })
  adminId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

