import { QueryClient } from "@tanstack/react-query";

export const queryDefaults = {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
};

export function createAppQueryClient() {
  return new QueryClient({ defaultOptions: queryDefaults });
}
