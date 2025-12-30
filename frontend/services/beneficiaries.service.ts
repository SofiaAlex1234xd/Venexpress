import api from './api';
import { Beneficiary, CreateBeneficiaryDto, UpdateBeneficiaryDto } from '@/types/beneficiary';

export const beneficiariesService = {
    async getBeneficiaries(search?: string): Promise<Beneficiary[]> {
        const params = search ? { search } : {};
        const response = await api.get<Beneficiary[]>('/beneficiaries', { params });
        return response.data;
    },

    async getBeneficiary(id: number): Promise<Beneficiary> {
        const response = await api.get<Beneficiary>(`/beneficiaries/${id}`);
        return response.data;
    },

    async createBeneficiary(data: CreateBeneficiaryDto): Promise<Beneficiary> {
        const response = await api.post<Beneficiary>('/beneficiaries', data);
        return response.data;
    },

    async updateBeneficiary(id: number, data: UpdateBeneficiaryDto): Promise<Beneficiary> {
        const response = await api.patch<Beneficiary>(`/beneficiaries/${id}`, data);
        return response.data;
    },

    async deleteBeneficiary(id: number): Promise<void> {
        await api.delete(`/beneficiaries/${id}`);
    },
};
