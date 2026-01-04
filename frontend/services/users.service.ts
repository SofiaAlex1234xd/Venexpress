import api from './api';

export interface Vendor {
    id: number;
    name: string;
    email: string;
    phone: string;
    pointId?: number;
    point?: any;
    debt: number;
    paidAmount: number;
    isBanned: boolean;
    createdAt: Date;
}

export interface CreateVendorDto {
    name: string;
    email: string;
    phone: string;
    password: string;
    pointId?: number;
    initialDebt?: number;
}

export const usersService = {
    // Get all vendors (Admin Colombia)
    async getVendors(): Promise<Vendor[]> {
        const response = await api.get('/users/vendors');
        return response.data;
    },

    // Get all vendors (Admin Venezuela)
    async getVendorsVenezuela(): Promise<Vendor[]> {
        const response = await api.get('/users/venezuela/vendors');
        return response.data;
    },

    // Create new vendor (Admin Colombia)
    async createVendor(data: CreateVendorDto): Promise<Vendor> {
        const response = await api.post('/users/vendors', data);
        return response.data;
    },

    // Create new vendor (Admin Venezuela)
    async createVendorVenezuela(data: CreateVendorDto): Promise<Vendor> {
        const response = await api.post('/users/venezuela/vendors', data);
        return response.data;
    },

    // Update vendor (Admin Colombia)
    async updateVendor(vendorId: number, data: { email?: string; password?: string }): Promise<Vendor> {
        const response = await api.patch(`/users/vendors/${vendorId}`, data);
        return response.data;
    },

    // Update vendor (Admin Venezuela)
    async updateVendorVenezuela(vendorId: number, data: { email?: string; password?: string }): Promise<Vendor> {
        const response = await api.patch(`/users/venezuela/vendors/${vendorId}`, data);
        return response.data;
    },

    // Get all users
    async getAllUsers(): Promise<any[]> {
        const response = await api.get('/users');
        return response.data;
    },

    // Change user role
    async changeUserRole(userId: number, role: string): Promise<any> {
        const response = await api.patch(`/users/${userId}/role`, { role });
        return response.data;
    },

    // Toggle ban user
    async toggleBanUser(userId: number, isBanned: boolean): Promise<any> {
        const response = await api.patch(`/users/${userId}/ban`, { isBanned });
        return response.data;
    },

    // Get vendor debt details
    async getVendorDebtDetails(vendorId: number, params?: any): Promise<any> {
        const response = await api.get(`/users/${vendorId}/debt-details`, { params });
        return response.data;
    },

    async getVendorTransactions(vendorId: number, params: any): Promise<any> {
        const response = await api.get(`/users/${vendorId}/transactions`, { params });
        return response.data;
    },
};
