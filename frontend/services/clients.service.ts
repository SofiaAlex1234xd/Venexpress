import api from './api';
import { Client, CreateClientDto, UpdateClientDto } from '@/types/client';

export const clientsService = {
    async getClients(search?: string): Promise<Client[]> {
        const params = search ? { search } : {};
        const response = await api.get<Client[]>('/clients', { params });
        return response.data;
    },

    async getClient(id: number): Promise<Client> {
        const response = await api.get<Client>(`/clients/${id}`);
        return response.data;
    },

    async createClient(data: CreateClientDto): Promise<Client> {
        const response = await api.post<Client>('/clients', data);
        return response.data;
    },

    async updateClient(id: number, data: UpdateClientDto): Promise<Client> {
        const response = await api.patch<Client>(`/clients/${id}`, data);
        return response.data;
    },

    async deleteClient(id: number): Promise<void> {
        await api.delete(`/clients/${id}`);
    },
};
