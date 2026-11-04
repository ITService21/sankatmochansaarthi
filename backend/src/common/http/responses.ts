import { Response } from "express";

export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/** Builds pagination metadata returned next to every list response. */
export function buildPagination(page: number, pageSize: number, totalItems: number): Pagination {
  return { page, page_size: pageSize, total_items: totalItems, total_pages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}

/** Standard success envelope: `{ data }`. */
export const sendData = (res: Response, data: unknown, status = 200) => res.status(status).json({ data });

/** Standard list envelope: `{ data: [...], pagination }`. */
export const sendList = (res: Response, data: unknown[], pagination: Pagination) => res.status(200).json({ data, pagination });
