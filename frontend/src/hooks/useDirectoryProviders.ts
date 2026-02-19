import { useQuery } from "@tanstack/react-query";
import { requestWithAuth } from "@/hooks/requestWithAuth";
import { queryKeys } from "@/hooks/queryKeys";
import { DirectoryProvider } from "@/types/directory";

const normalizeProviders = (data: any): DirectoryProvider[] => {
  if (Array.isArray(data)) return data as DirectoryProvider[];
  if (Array.isArray(data?.data)) return data.data as DirectoryProvider[];
  if (Array.isArray(data?.providers)) return data.providers as DirectoryProvider[];
  return [];
};

export function useDirectoryProviders() {
  const directoryQuery = useQuery({
    queryKey: queryKeys.directory.providers(),
    queryFn: async (): Promise<DirectoryProvider[]> => {
      const { data, error: apiError } = await requestWithAuth(
        "api/directory/providers",
        "GET",
        null
      );
      if (apiError) throw new Error(apiError);

      const providers = normalizeProviders(data);
      return providers.map((provider) => ({
        ...provider,
        tags: Array.isArray(provider.tags) ? provider.tags : [],
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    providers: directoryQuery.data ?? [],
    isLoading: directoryQuery.isLoading,
    error: directoryQuery.error,
    refetch: directoryQuery.refetch,
  };
}


