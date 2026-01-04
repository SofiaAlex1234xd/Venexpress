import api from './api';
import { Account, AccountSummary, CreateAccountDto, AddBalanceDto, AccountTransaction } from '@/types/account';

export const accountsService = {
  async create(data: CreateAccountDto): Promise<Account> {
    const response = await api.post<Account>('/accounts', data);
    return response.data;
  },

  async findAll(): Promise<Account[]> {
    const response = await api.get<Account[]>('/accounts');
    return response.data;
  },

  async getSummary(): Promise<AccountSummary> {
    const response = await api.get<AccountSummary>('/accounts/summary');
    return response.data;
  },

  async findOne(id: number): Promise<Account> {
    const response = await api.get<Account>(`/accounts/${id}`);
    return response.data;
  },

  async getHistory(id: number): Promise<AccountTransaction[]> {
    const response = await api.get<AccountTransaction[]>(`/accounts/${id}/history`);
    return response.data;
  },

  async addBalance(id: number, data: AddBalanceDto): Promise<Account> {
    const response = await api.patch<Account>(`/accounts/${id}/add-balance`, data);
    return response.data;
  },

  async updateBalance(id: number, data: { balance: number }): Promise<Account> {
    const response = await api.patch<Account>(`/accounts/${id}/update-balance`, data);
    return response.data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/accounts/${id}`);
  },
};

