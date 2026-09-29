import { Barang, MinimumStockSettings } from '../types';

export const DEFAULT_MINIMUM_STOCK_SETTINGS: MinimumStockSettings = {
  defaultMinimum: 10,
  categoryMinimums: {},
};

export function getMinimumStockForItem(item: Barang, settings: MinimumStockSettings): number {
  const categoryMinimum = settings.categoryMinimums[item.jenis];
  return Number.isInteger(categoryMinimum) ? categoryMinimum : settings.defaultMinimum;
}