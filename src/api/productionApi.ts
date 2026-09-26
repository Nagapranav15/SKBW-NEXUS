import api from './axios';
import { ProductionOrder } from '../types/production';

export interface ProductionOrderFilters {
  companyId?: string;
  status?: string;
  itemType?: string;
  department?: string;
  search?: string;
}

export const getProductionOrders = async (params: ProductionOrderFilters): Promise<ProductionOrder[]> => {
  const response = await api.get('/production-orders', { params });
  return response.data;
};

export const getProductionOrderById = async (id: string): Promise<ProductionOrder> => {
  const response = await api.get(`/production-orders/${id}`);
  return response.data;
};

export const getNextProductionOrderNumber = async (companyId?: string): Promise<string> => {
  const response = await api.get('/production-orders/next-number', { params: { companyId } });
  return response.data.nextNumber;
};

export const createProductionOrder = async (orderData: Partial<ProductionOrder>): Promise<ProductionOrder> => {
  const response = await api.post('/production-orders', orderData);
  return response.data;
};

export const updateProductionOrder = async (id: string, orderData: Partial<ProductionOrder>): Promise<ProductionOrder> => {
  const response = await api.put(`/production-orders/${id}`, orderData);
  return response.data;
};

export const recordProductionEntry = async (
  orderId: string, 
  entryData: {
    producedQty: number;
    producedUom: string;
    shift: string;
    date: string;
    remarks?: string;
    createdBy?: string;
  }
): Promise<ProductionOrder> => {
  const response = await api.post(`/production-orders/${orderId}/entries`, entryData);
  return response.data;
};

export const completeProductionOrder = async (orderId: string, completedBy?: string): Promise<ProductionOrder> => {
  const response = await api.patch(`/production-orders/${orderId}/complete`, { completedBy });
  return response.data;
};

export const deleteProductionOrder = async (id: string): Promise<{ msg: string; id: string }> => {
  const response = await api.delete(`/production-orders/${id}`);
  return response.data;
};
