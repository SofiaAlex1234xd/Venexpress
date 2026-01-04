export type UserRole = 'admin_colombia' | 'admin_venezuela' | 'vendedor' | 'cliente';

export interface User {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: UserRole;
    pointId?: number;
    adminId?: number;
    commission?: number;
    createdAt: string;
    updatedAt: string;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface RegisterData {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: UserRole;
}

export interface AuthResponse {
    user: User;
    access_token: string;
}
