import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Beneficiary } from './entities/beneficiary.entity';
import { Client } from '../clients/entities/client.entity';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(Beneficiary)
    private beneficiariesRepository: Repository<Beneficiary>,
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
  ) { }

  async create(createBeneficiaryDto: CreateBeneficiaryDto, user: any): Promise<Beneficiary> {
    // 1. Verificar duplicados
    await this.validateDuplicate(createBeneficiaryDto);

    const beneficiary = this.beneficiariesRepository.create(createBeneficiaryDto);

    // Asociar al cliente o usuario según el rol
    if (user.role === UserRole.CLIENTE) {
      beneficiary.userApp = { id: user.id } as any;
    } else if (createBeneficiaryDto.clientColombiaId) {
      beneficiary.clientColombia = { id: createBeneficiaryDto.clientColombiaId } as any;
    }

    return this.beneficiariesRepository.save(beneficiary);
  }

  private async validateDuplicate(dto: CreateBeneficiaryDto | UpdateBeneficiaryDto, excludeId?: number) {
    const where: any = {
      documentId: dto.documentId,
      bankName: dto.bankName,
      isPagoMovil: dto.isPagoMovil,
    };

    if (dto.isPagoMovil) {
      where.phone = dto.phone;
    } else {
      where.accountNumber = dto.accountNumber;
    }

    const query = this.beneficiariesRepository.createQueryBuilder('b')
      .where(where);

    if (excludeId) {
      query.andWhere('b.id != :id', { id: excludeId });
    }

    const duplicate = await query.getOne();

    if (duplicate) {
      throw new ConflictException(`Ya existe un destinatario con el mismo documento y ${
        dto.isPagoMovil ? 'teléfono' : 'número de cuenta'
      } en este banco`);
    }
  }

  async findAll(user: any, search?: string, vendorId?: number): Promise<Beneficiary[]> {
    const where: any = {};

    // Filtrar según el rol
    if (user.role === UserRole.CLIENTE) {
      where.userApp = { id: user.id };
    } else if (user.role === UserRole.VENDEDOR) {
      // Mostrar Destinatarios de clientes del vendedor
      where.clientColombia = { vendedor: { id: user.id } };
    } else if (user.role === UserRole.ADMIN_COLOMBIA || user.role === UserRole.ADMIN_VENEZUELA) {
      // Admin solo ve destinatarios de sus vendedores
      where.clientColombia = { vendedor: { adminId: user.id } };
    }

    // Filtro opcional por vendedor (para administradores)
    if (vendorId) {
      where.clientColombia = { ...where.clientColombia, vendedor: { id: vendorId } };
    }

    if (search) {
      where.fullName = Like(`%${search}%`);
    }

    return this.beneficiariesRepository.find({
      where,
      relations: ['clientColombia', 'clientColombia.vendedor', 'userApp'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Beneficiary> {
    const beneficiary = await this.beneficiariesRepository.findOne({
      where: { id },
      relations: ['clientColombia', 'userApp'],
    });

    if (!beneficiary) {
      throw new NotFoundException(`Destinatario con ID ${id} no encontrado`);
    }

    return beneficiary;
  }

  async update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto): Promise<Beneficiary> {
    const beneficiary = await this.findOne(id);

    // No regenerar nombre en el backend, el frontend ya se encarga de enviarlo si es necesario

    // Validar duplicados excluyendo el actual
    await this.validateDuplicate({ ...beneficiary, ...updateBeneficiaryDto } as any, id);

    Object.assign(beneficiary, updateBeneficiaryDto);
    return this.beneficiariesRepository.save(beneficiary);
  }

  async remove(id: number): Promise<void> {
    const beneficiary = await this.findOne(id);
    await this.beneficiariesRepository.softRemove(beneficiary);
  }

  async countByClient(clientId: number): Promise<number> {
    return this.beneficiariesRepository.count({
      where: { clientColombia: { id: clientId } }
    });
  }

  async removeByClient(clientId: number): Promise<void> {
    const beneficiaries = await this.beneficiariesRepository.find({
      where: { clientColombia: { id: clientId } }
    });
    if (beneficiaries.length > 0) {
      await this.beneficiariesRepository.softRemove(beneficiaries);
    }
  }
}

