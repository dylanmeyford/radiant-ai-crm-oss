export interface ApiKey {
  _id: string;
  name: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyResponse {
  success: true;
  data: ApiKey;
  apiKey: string; // Full key shown once on creation
}

export interface ListApiKeysResponse {
  success: true;
  data: ApiKey[];
}

export interface UpdateApiKeyResponse {
  success: true;
  data: ApiKey;
}

