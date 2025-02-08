import axios from "axios";
import { UseQueryOptions } from "@tanstack/react-query";

export const BASE_API_URL =
  import.meta.env.VITE_BASE_API_URL || "http://127.0.0.1:8000/api";

const axiosInstance = axios.create({
  baseURL: BASE_API_URL,
});

// axiosInstance.defaults.withCredentials = true;
export type QueryConfig<TQueryFnData, TData = TQueryFnData> = Omit<
  UseQueryOptions<
    TQueryFnData,
    Error,
    TData,
    [string, Record<string, unknown>, ...string[]]
  >,
  "queryKey" | "queryFn"
>;

export default axiosInstance;
