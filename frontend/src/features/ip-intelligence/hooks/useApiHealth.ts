import { useQuery } from "@tanstack/react-query";
import { ipIntelligenceService } from "../services/ipIntelligenceService";

export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: ({ signal }) => ipIntelligenceService.getHealth(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
