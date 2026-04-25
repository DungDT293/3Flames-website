import { api } from "./client";
import type { AuthResponse, PaginatedResponse, Transaction, User } from "@/types/api";

export interface RegisterResponse {
  message: string;
  success: boolean;
  requiresOtp: boolean;
  email: string;
}

export interface ResendOtpResponse {
  message: string;
  success: boolean;
  requiresOtp: boolean;
  email: string;
}

export async function registerUser(data: {
  email: string;
  username: string;
  password: string;
  accept_tos: boolean;
}): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>("/auth/register", data);
  return res.data;
}

export async function verifyEmail(data: {
  email: string;
  otp: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/verify-email", data);
  return res.data;
}

export async function resendOtp(data: {
  email: string;
}): Promise<ResendOtpResponse> {
  const res = await api.post<ResendOtpResponse>("/auth/resend-otp", data);
  return res.data;
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/login", data);
  return res.data;
}

export interface ProfileResponse extends User {
  balance: string;
  totalOrders: number;
}

export async function fetchProfile(): Promise<ProfileResponse> {
  const res = await api.get<ProfileResponse>("/users/me");
  return res.data;
}

export async function updateProfile(data: {
  email: string;
  username: string;
}): Promise<ProfileResponse> {
  const res = await api.patch<ProfileResponse>("/users/me", data);
  return res.data;
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/users/me/change-password", data);
  return res.data;
}

export async function fetchTransactions(
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedResponse<Transaction>> {
  const res = await api.get<PaginatedResponse<Transaction>>("/users/me/transactions", {
    params: { page, limit },
  });
  return res.data;
}
