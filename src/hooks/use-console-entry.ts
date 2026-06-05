import useSWR from 'swr';

import { personalAccessTokenAuthFetcher } from '@/lib/fetch-utils';
import { ConsoleEntry, Organization, Workspace } from '@/types/console-entry';
import { useConsoleAuth } from '@/components/providers/console-auth-provider';
import { useMemo } from 'react';

type WorkspaceMap = Record<string, Workspace>;
type OrganizationMap = Record<string, Organization>;

export function useConsoleEntry(): Partial<ConsoleEntry> & {
  workspaces?: Array<Workspace & { org?: Organization }>;

  workspacesMap: WorkspaceMap;
  orgsMap: OrganizationMap;

  isLoading: boolean;
  isError: boolean;
} {
  const { token } = useConsoleAuth();

  const { data, error, isLoading } = useSWR<ConsoleEntry>(
    token ? ['/console-self', token] : null,
    ([url]) => personalAccessTokenAuthFetcher<ConsoleEntry>(url),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );

  const orgIds = useMemo(
    () => data?.orgs?.map((o) => o.id) ?? [],
    [data?.orgs],
  );

  const { data: allWorkspaces, isLoading: workspacesLoading } = useSWR(
    token && orgIds.length > 0
      ? ['org-workspaces', token, orgIds.join(',')]
      : null,
    async () => {
      const results = await Promise.all(
        orgIds.map((orgId) =>
          personalAccessTokenAuthFetcher<{ items: Workspace[] }>(
            `/org-workspaces?orgId=${orgId}&limit=100`,
          ),
        ),
      );
      return results.flatMap((r) => r.items ?? []);
    },
  );

  const resolvedWorkspaces = useMemo(() => {
    if (allWorkspaces) return allWorkspaces;
    if (data?.workspace) return [data.workspace];
    return [];
  }, [allWorkspaces, data?.workspace]);

  const workspacesMap = useMemo(() => {
    return resolvedWorkspaces.reduce<WorkspaceMap>((acc, workspace) => {
      acc[workspace.id] = workspace;
      return acc;
    }, {});
  }, [resolvedWorkspaces]);

  const orgsMap = useMemo(() => {
    return (
      data?.orgs?.reduce<OrganizationMap>((acc, org) => {
        acc[org.id] = org;
        return acc;
      }, {}) ?? {}
    );
  }, [data?.orgs]);

  const workspacesWithOrgs = useMemo(() => {
    return resolvedWorkspaces.map<Workspace & { org?: Organization }>(
      (workspace) => {
        return { ...workspace, org: orgsMap[workspace.orgId] };
      },
    );
  }, [resolvedWorkspaces, orgsMap]);

  return {
    workspaces: workspacesWithOrgs,
    orgs: data?.orgs,

    workspacesMap,
    orgsMap,

    isLoading: isLoading || workspacesLoading,
    isError: !!error,
  };
}
