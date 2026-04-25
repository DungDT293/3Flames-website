import { api } from "./client";
import type { AuthResponse, PaginatedResponse, Transaction, User } from "@/types/api";

export interface RegisterResponse {
  message: string;
  success: boolean;
  requiresOtp: boolean;
  email: string;
  devOtp?: string;
}

export interface ResendOtpResponse {
  message: string;
  success: boolean;
  requiresOtp: boolean;
  email: string;
  devOtp?: string;
}

export async function registerUser(data: {
  email: string;
  username: string;
  phone?: string;
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

export async function lookupAccount(data: {
  identifier: string;
}): Promise<{ account: Pick<User, "email" | "username"> & { phone?: string | null; isEmailVerified: boolean } }> {
  const res = await api.post<{ account: Pick<User, "email" | "username"> & { phone?: string | null; isEmailVerified: boolean } }>("/auth/lookup-account", data);
  return res.data;
}

export async function forgotPassword(data: {
  email: string;
}): Promise<{ message: string; success: boolean; email: string; devOtp?: string }> {
  const res = await api.post<{ message: string; success: boolean; email: string; devOtp?: string }>("/auth/forgot-password", data);
  return res.data;
}

export async function resetPassword(data: {
  email: string;
  otp: string;
  password: string;
}): Promise<{ message: string; success: boolean; email: string }> {
  const res = await api.post<{ message: string; success: boolean; email: string }>("/auth/reset-password", data);
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
  phone?: string;
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
