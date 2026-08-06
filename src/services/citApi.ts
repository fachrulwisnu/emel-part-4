// src/services/citApi.ts

const BASE_URL = '/api/cit';

export interface Currency {
  id: number | string;
  code?: string;
  currency_code?: string;
  name?: string;
  MoneyCode?: string;
  MoneyName?: string | null;
}

export interface EntityMasterDetail {
  EntityCode: string;
  EntityName: string | null;
  Type: string | null;
  ManagingGroupCode: string | null;
  GroupCode: string | null;
  BranchCode: number | null;
  BranchName: string | null;
  VaultBranchCode: number | null;
  IsClientBI: number | null;
  DefaultCountMethod: string | null;
  DefaultUnloadType: string | null;
  PricingType: string | null;
  IdWayPoint: string | null;
  StartRequestDeliveryAdHoc: string | null;
  EndRequestDeliveryAdHoc: string | null;
}

export interface EntityMasterPage {
  total_data: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  data: EntityMasterDetail[];
}

// Compatibility shape used by the older CIT modal.
export interface BranchEntity {
  id: number;
  name?: string;
  branch_name?: string;
}

// The live vault-trips endpoint returns option strings, not operational trip rows.
// This interface remains exported so the older dashboard can render an empty state safely.
export interface VaultTrip {
  id?: number;
  order_id: string;
  ticket_id: string;
  branch_name: string;
  location: string;
  status: string;
}

/**
 * Custom fetch wrapper that provides detailed error logging on failures.
 */
async function fetchWithLogging(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      let responseText = '';
      try {
        responseText = await response.clone().text();
      } catch (_) {
        responseText = '(Failed to read response text)';
      }
      console.error(`[CIT API ERROR]
- Full URL: ${url}
- Status Code: ${response.status}
- Response Data: ${responseText}`);
    }
    return response;
  } catch (error: any) {
    console.error(`[CIT API NETWORK ERROR]
- Full URL: ${url}
- Error: ${error.message || String(error)}`);
    throw error;
  }
}

export const citApi = {
  getCurrencies: async (): Promise<Currency[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/currencies`);
    const result = await response.json();
    const data = result.data || result || [];
    return Array.isArray(data)
      ? data.map((item: Currency) => ({
          ...item,
          id: item.id || item.MoneyCode || '',
          code: item.code || item.MoneyCode,
          currency_code: item.currency_code || item.MoneyCode,
          name: item.name || item.MoneyName || item.MoneyCode
        }))
      : [];
  },
  getScItems: async (): Promise<any[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/scitems`);
    const result = await response.json();
    return result.data || result || [];
  },
  getEntityMasterPage: async (params?: {
    branch_code?: number;
    entity_code?: string;
    entity_name?: string;
    page?: number;
    size?: number;
  }): Promise<EntityMasterPage | null> => {
    const query = new URLSearchParams();
    if (params?.branch_code !== undefined) query.set('branch_code', String(params.branch_code));
    if (params?.entity_code) query.set('entity_code', params.entity_code);
    if (params?.entity_name) query.set('entity_name', params.entity_name);
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.size !== undefined) query.set('size', String(params.size));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const response = await fetchWithLogging(`${BASE_URL}/entity-master-details${suffix}`);
    const result = await response.json();
    return result?.data && Array.isArray(result.data.data) ? result.data : null;
  },
  getEntityMasterDetails: async (): Promise<BranchEntity[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/entity-master-details?page=1&size=20000`);
    const result = await response.json();
    const entities: EntityMasterDetail[] = Array.isArray(result?.data?.data) ? result.data.data : [];
    return Array.from(
      new Map<number, BranchEntity>(
        entities
          .filter(entity => entity.Type === 'ENT' && entity.BranchCode !== null && Boolean(entity.BranchName))
          .map(entity => [
            Number(entity.BranchCode),
            { id: Number(entity.BranchCode), name: String(entity.BranchName), branch_name: String(entity.BranchName) }
          ])
      ).values()
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },
  getVaultTripOptions: async (): Promise<string[]> => {
    const response = await fetchWithLogging(`${BASE_URL}/vault-trips`);
    const result = await response.json();
    return Array.isArray(result.data) ? result.data.filter((item: unknown): item is string => typeof item === 'string') : [];
  },
  getVaultTrips: async (): Promise<VaultTrip[]> => {
    await citApi.getVaultTripOptions();
    return [];
  },
  createDelivery: async (payload: {
    currency_id: number;
    branch_id: number;
    amount: number;
    order_date: string;
    source_reference: string;
    ticket_subject: string;
  }): Promise<{ success: boolean; data?: { id: number }; message?: string }> => {
    const response = await fetchWithLogging(`${BASE_URL}/create-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.json();
  },
  createDeliveryDetail: async (payload: {
    delivery_id: number;
    currency_id: number;
    amount: number;
    item_name: string;
    quantity: number;
  }): Promise<{ success: boolean; message?: string }> => {
    const response = await fetchWithLogging(`${BASE_URL}/create-delivery-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.json();
  },
  testConnection: async (): Promise<{ success: boolean; message: string; steps: string[] }> => {
    const response = await fetchWithLogging(`${BASE_URL}/test-connection`);
    return response.json();
  }
};

