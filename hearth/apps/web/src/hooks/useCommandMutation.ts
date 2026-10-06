import { useMutation, type UseMutationOptions, type MutateOptions } from '@tanstack/react-query';
import { useRef } from 'react';

import { createRequestId, HearthApiError } from '../api/core';

/** An unanswered command is one immutable intent, not a new write on each click. */
export function useCommandMutation<TData, TVariables>(
  prefix: string,
  options: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> & {
    mutationFn: (variables: TVariables, requestId: string) => Promise<TData>;
  },
) {
  const pending = useRef<{
    input: TVariables;
    fingerprint: string;
    requestId: string;
    ambiguous: boolean;
  } | null>(null);
  const retryOptions = useRef<MutateOptions<TData, Error, TVariables> | undefined>(undefined);
  const mutation = useMutation<TData, Error, TVariables>({
    ...options,
    retry: false,
    mutationFn: async (input) => {
      const fingerprint = JSON.stringify(input);
      if (pending.current !== null && pending.current.fingerprint !== fingerprint) {
        throw new Error('Try the previous change again before making a new one.');
      }
      pending.current ??= {
        input: structuredClone(input),
        fingerprint,
        requestId: createRequestId(prefix),
        ambiguous: false,
      };
      const command = pending.current;
      try {
        const result = await options.mutationFn(command.input, command.requestId);
        pending.current = null;
        return result;
      } catch (error) {
        // A rejected command is known not to have succeeded; a lost reply is ambiguous.
        if (
          !command.ambiguous &&
          error instanceof HearthApiError &&
          [
            'VALIDATION_ERROR',
            'UNAUTHENTICATED',
            'FORBIDDEN',
            'NOT_FOUND',
            'DUPLICATE_ITEM',
            'CONFLICT',
          ].includes(error.payload.error.code)
        ) {
          pending.current = null;
        } else command.ambiguous = true;
        throw error;
      }
    },
  });
  return {
    ...mutation,
    mutate: (input: TVariables, callbacks?: MutateOptions<TData, Error, TVariables>) => {
      if (pending.current === null) retryOptions.current = callbacks;
      mutation.mutate(input, callbacks);
    },
    retryCommand: () => {
      if (pending.current !== null) mutation.mutate(pending.current.input, retryOptions.current);
      else if (mutation.variables !== undefined)
        mutation.mutate(mutation.variables, retryOptions.current);
    },
  };
}
