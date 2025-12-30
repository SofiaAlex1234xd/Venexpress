import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientsRepository: Repository<Client>,
    private beneficiariesService: BeneficiariesService,
  ) { }

  async create(createClientDto: CreateClientDto, vendedorId: number): Promise<Client> {
    // Verificar si ya existe un cliente con el mismo teléfono
    const existingClient = await this.clientsRepository.findOne({
      where: { phone: createClientDto.phone }
    });

    if (existingClient) {
      throw new ConflictException(`Ya existe un cliente registrado con el teléfono ${createClientDto.phone}`);
    }

    const client = this.clientsRepository.create({
      ...createClientDto,
      vendedor: { id: vendedorId } as any,
    });
    return this.clientsRepository.save(client);
  }

  async findAll(search?: string, userId?: number, userRole?: string): Promise<Client[]> {
    // Construir condiciones de búsqueda
    const whereConditions: any = {};

    // Si es vendedor, solo ver sus propios clientes
    if (userRole === 'vendedor') {
      whereConditions.vendedor = { id: userId };
    }

    // Agregar búsqueda si existe
    if (search) {
      return this.clientsRepository.find({
        where: [
          { ...whereConditions, name: Like(`%${search}%`) },
          { ...whereConditions, phone: Like(`%${search}%`) },
        ],
        relations: ['vendedor'],
        order: { createdAt: 'DESC' },
      });
    }

    return this.clientsRepository.find({
      where: whereConditions,
      relations: ['vendedor'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id },
      relations: ['vendedor'],
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    return client;
  }

  async update(id: number, updateClientDto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);
    Object.assign(client, updateClientDto);
    return this.clientsRepository.save(client);
  }

  async remove(id: number): Promise<void> {
    const client = await this.findOne(id);
    // Eliminar destinatarios asociados (soft delete cascada)
    await this.beneficiariesService.removeByClient(id);
    await this.clientsRepository.softRemove(client);
  }

  async countBeneficiaries(id: number): Promise<number> {
    return this.beneficiariesService.countByClient(id);
  }
}

