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
    // 1. Obtener el nombre del cliente para la lógica de Pago Móvil
    let clientName = '';
    const clientId = createBeneficiaryDto.clientColombiaId;
    if (clientId) {
      const client = await this.clientsRepository.findOne({ where: { id: clientId } });
      if (client) clientName = client.name;
    }

    // 2. Lógica de nombre para Pago Móvil
    if (createBeneficiaryDto.isPagoMovil) {
      const lastFourDoc = createBeneficiaryDto.documentId.slice(-4);
      createBeneficiaryDto.fullName = `Pago Movil (${clientName}) ${lastFourDoc}`;
    }

    // 3. Verificar duplicados
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
      fullName: dto.fullName,
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
      throw new ConflictException(`Ya existe un destinatario registrado con estos mismos datos (${dto.fullName})`);
    }
  }

  async findAll(user: any, search?: string): Promise<Beneficiary[]> {
    const where: any = {};

    // Filtrar según el rol
    if (user.role === UserRole.CLIENTE) {
      where.userApp = { id: user.id };
    } else if (user.role === UserRole.VENDEDOR) {
      // Mostrar Destinatarios de clientes del vendedor
      where.clientColombia = { vendedor: { id: user.id } };
    }

    if (search) {
      where.fullName = Like(`%${search}%`);
    }

    return this.beneficiariesRepository.find({
      where,
      relations: ['clientColombia', 'userApp'],
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

    // Si se cambia a Pago Móvil o se cambia el documento/cliente, regenerar nombre
    if (updateBeneficiaryDto.isPagoMovil || (beneficiary.isPagoMovil && (updateBeneficiaryDto.documentId || updateBeneficiaryDto.clientColombiaId))) {
      let clientName = beneficiary.clientColombia?.name || '';
      if (updateBeneficiaryDto.clientColombiaId) {
        const client = await this.clientsRepository.findOne({ where: { id: updateBeneficiaryDto.clientColombiaId } });
        if (client) clientName = client.name;
      }

      const doc = updateBeneficiaryDto.documentId || beneficiary.documentId;
      const lastFourDoc = doc.slice(-4);
      updateBeneficiaryDto.fullName = `Pago Movil (${clientName}) ${lastFourDoc}`;
    }

    // Validar duplicados excluyendo el actual
    await this.validateDuplicate({ ...beneficiary, ...updateBeneficiaryDto } as any, id);

    Object.assign(beneficiary, updateBeneficiaryDto);
    return this.beneficiariesRepository.save(beneficiary);
  }

  async remove(id: number): Promise<void> {
    const beneficiary = await this.findOne(id);
    await this.beneficiariesRepository.softRemove(beneficiary);
  }
}

