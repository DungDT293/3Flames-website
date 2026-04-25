export type UserRole = "USER" | "SUPPORT" | "ADMIN" | "SUPER_ADMIN";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  balance?: string;
  createdAt?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, string>;
  field?: string;
  requiresOtp?: boolean;
  email?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Service {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sellingPrice: string;
  minQuantity: number;
  maxQuantity: number;
  type: string;
}

export interface Order {
  id: string;
  link: string;
  quantity: number;
  charge: string;
  status: string;
  startCount: number | null;
  remains: number | null;
  createdAt: string;
  service: {
    id: string;
    name: string;
    category: string;
  };
}

export interface Transaction {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  orderId: string | null;
  description: string;
  createdAt: string;
}
