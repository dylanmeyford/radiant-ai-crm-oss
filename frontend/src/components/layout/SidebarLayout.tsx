import React from "react"
import { Outlet, useLocation, Link } from "react-router-dom"

import { AppSidebar } from "@/components/sidebar/app-sidebar"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { OfflineIndicator } from "@/components/ui/offline-indicator"
import { Button } from "@/components/ui/button"
import { usePageActions, PageActionsProvider } from "@/context/PageActionsContext"
import { Loader2, MoreHorizontal } from "lucide-react"
import { ExpiredGrantBanner } from "@/components/layout/ExpiredGrantBanner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queryKeys"
import { requestWithAuth } from "@/hooks/requestWithAuth"
import { usePlaybookOperations } from "@/hooks/usePlaybookOperations"
import { usePipelines } from "@/hooks/usePipelines"
import { useIsMobile } from "@/hooks/use-mobile"

function SidebarLayoutContent() {
  const location = useLocation();
  const { actions, actionGroups } = usePageActions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  // Helper to truncate long labels on mobile
  const truncateLabel = (label: string, maxLength: number = 20) => {
    if (!isMobile || label.length <= maxLength) return label;
    return label.substring(0, maxLength) + '...';
  };
  
  // Check if we navigated from the Today page
  const fromToday = (location.state as any)?.from === 'today';
  
  // Extract pipelineId from URL if we're on any pipeline route
  const pipelineId = location.pathname.match(/\/pipeline\/([^\/]+)/)?.[1];
  
  // Extract opportunityId from URL if we're on opportunity view page (now includes pipelineId)
  const opportunityId = location.pathname.match(/\/pipeline\/[^\/]+\/opportunity\/([^\/]+)/)?.[1];
  
  // Extract playbookItemId from URL if we're on playbook item view page
  const playbookItemId = location.pathname.match(/\/ai\/playbook\/([^\/]+)/)?.[1];
  
  // Get playbook operations hook
  const { getPlaybookItemQuery } = usePlaybookOperations();
  
  // Get pipelines for breadcrumb
  const { pipelines } = usePipelines();
  const currentPipeline = pipelines.find(p => p._id === pipelineId);
  
  // Try to get opportunity from the opportunities list cache first
  const opportunitiesFromCache = queryClient.getQueryData(queryKeys.opportunities.list()) as any[];
  const opportunityFromCache = opportunitiesFromCache?.find((opp: any) => opp._id === opportunityId);
  
  // Try to get playbook item from the playbook items cache first
  const playbookItemsFromCache = queryClient.getQueryData(queryKeys.playbook.items(null)) as any[];
  const playbookItemFromCache = playbookItemsFromCache?.find((item: any) => item._id === playbookItemId);
  
  // Fetch opportunity data for breadcrumb if we're on opportunity view page and not in cache
  const { data: opportunity, isLoading: isLoadingOpportunity } = useQuery({
    queryKey: queryKeys.opportunities.detail(opportunityId || ''),
    queryFn: async () => {
      if (!opportunityId) return null;
      const { data, error: apiError } = await requestWithAuth(`api/opportunities/${opportunityId}`, "GET", null);
      if (apiError) throw new Error(apiError);
      
      // Handle nested data structure - API might return { data: { _id, name, ... } }
      if (data && data.data && data.data._id) {
        return data.data;
      }
      // Or it might return the opportunity directly
      if (data && data._id) {
        return data;
      }
      return data;
    },
    enabled: !!opportunityId && !opportunityFromCache, // Only fetch if not in cache
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Get playbook item data for breadcrumb - use centralized hook
  const playbookItemQuery = getPlaybookItemQuery(playbookItemId || null);
  const playbookItem = playbookItemFromCache || playbookItemQuery.data;
  const isLoadingPlaybookItem = !playbookItemFromCache && playbookItemQuery.isLoading;
  
  // Get breadcrumb items based on the current path
  const getBreadcrumbItems = () => {
    const path = location.pathname;
    const items = [];

    if (path === '/today') {
      items.push({
        label: 'Today',
        href: '/today',
        isLink: false
      });
    } else if (path === '/directory') {
      items.push({
        label: 'Directory',
        href: '/directory',
        isLink: false
      });
    } else if (path === '/pipeline') {
      // Redirect page - shouldn't display but handle gracefully
      items.push({
        label: 'Pipeline',
        href: '/pipeline',
        isLink: false
      });
    } else if (path.match(/^\/pipeline\/[^\/]+$/)) {
      // Pipeline view: /pipeline/:pipelineId
      const pipelineName = currentPipeline?.name || 'Pipeline';
      items.push({
        label: pipelineName,
        href: path,
        isLink: false
      });
    } else if (path.match(/^\/pipeline\/[^\/]+\/new-opportunity$/)) {
      // New opportunity: /pipeline/:pipelineId/new-opportunity
      const pipelineName = currentPipeline?.name || 'Pipeline';
      items.push({
        label: pipelineName,
        href: `/pipeline/${pipelineId}`,
        isLink: true
      });
      items.push({
        label: 'New Opportunity',
        href: path,
        isLink: false
      });
    } else if (path === '/ai') {
      items.push({
        label: 'AI',
        href: '/ai',
        isLink: false
      });
    } else if (path.startsWith('/ai/playbook/')) {
      items.push({
        label: 'AI',
        href: '/ai',
        isLink: true
      });
      // Use cached playbook item first, then API result, then fallback
      const playbookItemTitle = playbookItemFromCache?.title || playbookItem?.title || 'Playbook Item';
      const showLoading = !playbookItemFromCache && isLoadingPlaybookItem;
      
      items.push({
        label: showLoading ? 'Loading...' : playbookItemTitle,
        href: path,
        isLink: false
      });
    } else if (path.startsWith('/settings')) {
      items.push({
        label: 'Settings',
        href: '/settings',
        isLink: path !== '/settings/accounts' // Make it a link unless we're on accounts (default)
      });
      
      // Add specific settings page
      if (path === '/settings/accounts') {
        items.push({
          label: 'Accounts',
          href: '/settings/accounts',
          isLink: false
        });
      } else if (path === '/settings/signature') {
        items.push({
          label: 'Signature',
          href: '/settings/signature',
          isLink: false
        });
      }
    } else if (path.match(/\/pipeline\/[^\/]+\/opportunity\//)) {
      // Opportunity routes: /pipeline/:pipelineId/opportunity/:opportunityId/*
      // Determine parent page based on navigation state
      const pipelineName = currentPipeline?.name || 'Pipeline';
      const parentLabel = fromToday ? 'Today' : pipelineName;
      const parentHref = fromToday ? '/today' : `/pipeline/${pipelineId}`;
      
      items.push({
        label: parentLabel,
        href: parentHref,
        isLink: true
      });
      // Use cached opportunity first, then API result, then fallback
      const opportunityName = opportunityFromCache?.name || opportunity?.name || 'Opportunity';
      const showLoading = !opportunityFromCache && isLoadingOpportunity;
      
      if (path.endsWith('/add-contact')) {
        // Manage contacts page: [Parent] > Opportunity > Manage Contacts
        items.push({
          label: showLoading ? 'Loading...' : opportunityName,
          href: `/pipeline/${pipelineId}/opportunity/${opportunityId}`,
          isLink: true
        });
        items.push({
          label: 'Manage Contacts',
          href: path,
          isLink: false
        });
      } else if (path.endsWith('/add-activity')) {
        // Add activity page: [Parent] > Opportunity > Add Activity
        items.push({
          label: showLoading ? 'Loading...' : opportunityName,
          href: `/pipeline/${pipelineId}/opportunity/${opportunityId}`,
          isLink: true
        });
        items.push({
          label: 'Add Activity',
          href: path,
          isLink: false
        });
      } else if (path.match(/\/edit-contact\/[^\/]+$/)) {
        // Edit contact page: [Parent] > Opportunity > Edit Contact
        items.push({
          label: showLoading ? 'Loading...' : opportunityName,
          href: `/pipeline/${pipelineId}/opportunity/${opportunityId}`,
          isLink: true
        });
        items.push({
          label: 'Edit Contact',
          href: path,
          isLink: false
        });
      } else {
        // Regular opportunity view page
        items.push({
          label: showLoading ? 'Loading...' : opportunityName,
          href: path,
          isLink: false
        });
      }
    } else {
      // Default fallback to Today Page
      items.push({
        label: 'Today',
        href: '/today',
        isLink: false
      });
    }

    return items;
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden min-h-0">
        <header className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 ${isMobile ? 'h-12' : 'h-14'}`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <SidebarTrigger className="shrink-0" />
            <Separator orientation="vertical" className={`h-6 ${isMobile ? 'mr-1' : 'mr-2'}`} />
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                {getBreadcrumbItems().map((item, index) => (
                  <React.Fragment key={item.href}>
                    <BreadcrumbItem className="min-w-0">
                      {item.isLink ? (
                        <BreadcrumbLink asChild className="truncate">
                          <Link to={item.href}>{truncateLabel(item.label)}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage className="truncate max-w-[150px] sm:max-w-none">
                          {truncateLabel(item.label)}
                        </BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {index < getBreadcrumbItems().length - 1 && (
                      <BreadcrumbSeparator className="shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          
          {/* Dynamic Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Individual actions */}
            {actions.map((action) => {
              const IconComponent = action.icon;
              const showLabel = !isMobile && action.size !== 'icon';
              return (
                <Button
                  key={action.id}
                  variant={action.variant || 'default'}
                  size={isMobile ? 'icon' : (action.size || 'sm')}
                  onClick={action.onClick}
                  disabled={action.disabled || action.loading}
                  className={`flex items-center ${showLabel ? 'gap-2' : ''}`}
                  title={isMobile ? action.label : undefined}
                >
                  {action.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    IconComponent && <IconComponent className="h-4 w-4" />
                  )}
                  {showLabel && action.label}
                </Button>
              );
            })}
            
            {/* Action groups as dropdown menus */}
            {actionGroups.map((group) => (
              <DropdownMenu key={group.id}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {group.actions.map((action) => {
                    const IconComponent = action.icon;
                    return (
                      <DropdownMenuItem
                        key={action.id}
                        onClick={action.onClick}
                        disabled={action.disabled || action.loading}
                        variant={action.id === 'delete-opportunity' ? 'destructive' : 'default'}
                      >
                        {action.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          IconComponent && <IconComponent className="h-4 w-4" />
                        )}
                        {action.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        </header>
        <ExpiredGrantBanner />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <Outlet />
        </div>
      </SidebarInset>
      <OfflineIndicator />
    </SidebarProvider>
  );
}

export default function SidebarLayout() {
  return (
    <PageActionsProvider>
      <SidebarLayoutContent />
    </PageActionsProvider>
  );
}


