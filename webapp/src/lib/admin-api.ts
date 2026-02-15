import { api } from "./api";

// Types for admin API
export interface AdminUser {
  id: string;
  username: string;
}

export interface AdminStats {
  totalSpaces: number;
  activeSpaces: number;
  blockedSpaces: number;
  totalItems: number;
  totalFeatureRequests: number;
  recentActivity: ActivityItem[];
  topSpaces: TopRoom[];
  featureStats: Record<string, number>;
}

export interface ActivityItem {
  id: string;
  type: string;
  spaceSlug: string;
  createdAt: string;
  details?: string;
}

export interface TopRoom {
  slug: string;
  itemCount: number;
  status: "active" | "blocked";
  createdAt: string;
}

export interface Space {
  id: string;
  slug: string;
  itemCount: number;
  status: "active" | "blocked";
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceDetails extends Space {
  items: CanvasItem[];
}

export interface CanvasItem {
  id: string;
  type: string;
  content?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: "pending" | "reviewed" | "planned" | "completed" | "rejected";
  email?: string;
  spaceSlug?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
}

// Admin API functions
export const adminApi = {
  // Auth
  login: (username: string, password: string) =>
    api.post<{ success: boolean; username: string }>("/api/admin/login", { username, password }),

  logout: () => api.post<{ success: boolean }>("/api/admin/logout"),

  me: () => api.get<AuthStatus>("/api/admin/me"),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>("/api/admin/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>("/api/admin/reset-password", { token, newPassword }),

  // Dashboard
  getStats: () => api.get<AdminStats>("/api/admin/stats"),

  // Spaces
  getSpaces: (params: { page?: number; limit?: number; search?: string; filter?: string }) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.search) searchParams.set("search", params.search);
    if (params.filter) searchParams.set("filter", params.filter);
    return api.get<PaginatedResponse<Space>>(`/api/admin/spaces?${searchParams.toString()}`);
  },

  getSpace: (slug: string) => api.get<SpaceDetails>(`/api/admin/spaces/${slug}`),

  blockSpace: (slug: string, blocked: boolean, reason?: string) =>
    api.post<Space>(`/api/admin/spaces/${slug}/block`, { blocked, reason }),

  deleteSpace: (slug: string) => api.delete<void>(`/api/admin/spaces/${slug}`),

  // Feature Requests
  getFeatures: (params: { page?: number; limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.status) searchParams.set("status", params.status);
    return api.get<PaginatedResponse<FeatureRequest>>(`/api/admin/features?${searchParams.toString()}`);
  },

  updateFeatureStatus: (id: string, status: string) =>
    api.patch<FeatureRequest>(`/api/admin/features/${id}`, { status }),

  deleteFeature: (id: string) => api.delete<void>(`/api/admin/features/${id}`),
};
