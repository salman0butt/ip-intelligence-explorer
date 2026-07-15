import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { ApiError } from "../../../shared/api/apiClient";
import { ipIntelligenceService } from "../services/ipIntelligenceService";
import type { LookupResponse } from "../types/ipIntelligence";

interface LookupVariables {
  readonly ip: string;
  readonly signal: AbortSignal;
}

export function useIpLookup() {
  const active = useRef<AbortController | null>(null);
  const mutation = useMutation<
    LookupResponse,
    ApiError | DOMException,
    LookupVariables
  >({
    mutationKey: ["ip-lookup"],
    mutationFn: (variables) => ipIntelligenceService.lookupIp(variables),
    retry: false,
  });

  const lookup = useCallback((ip: string) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    mutation.mutate(
      { ip, signal: controller.signal },
      {
        onSettled: () => {
          if (active.current === controller) active.current = null;
        },
      },
    );
  }, [mutation]);

  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    mutation.reset();
  }, [mutation]);

  useEffect(() => () => active.current?.abort(), []);

  const safeError = mutation.error instanceof ApiError ? mutation.error : null;

  return {
    data: mutation.data,
    error: safeError,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    lookup,
    reset,
  } as const;
}
