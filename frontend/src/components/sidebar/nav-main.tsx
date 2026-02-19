"use client"

import { useState } from "react"
import { ChevronRight, Plus, Loader2, type LucideIcon } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePipelines } from "@/hooks/usePipelines"

interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  items?: {
    title: string
    url: string
  }[]
}

// Pipeline-specific navigation item with submenu and create functionality
function PipelineNavItem({ item }: { item: NavItem }) {
  const location = useLocation()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState("")
  
  const {
    pipelines,
    defaultPipeline,
    isLoadingPipelines,
    createPipeline,
    isCreating,
  } = usePipelines()

  const hasMultiplePipelines = pipelines.length > 1
  
  // Check if we're on any pipeline route
  const active = location.pathname.startsWith('/pipeline')
  
  // Determine the URL for the main pipeline link
  const mainUrl = defaultPipeline 
    ? `/pipeline/${defaultPipeline._id}` 
    : '/pipeline'

  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim()) return
    
    const result = await createPipeline({ name: newPipelineName.trim() })
    if (result.success) {
      setNewPipelineName("")
      setPopoverOpen(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreatePipeline()
    }
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
        <NavLink to={mainUrl}>
          <item.icon />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
      
      {/* Create Pipeline Popover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <SidebarMenuAction 
            className="text-gray-400 hover:text-gray-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Create Pipeline</span>
          </SidebarMenuAction>
        </PopoverTrigger>
        <PopoverContent 
          side="right" 
          align="start" 
          className="w-64 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-900">
              New Pipeline
            </div>
            <Input
              placeholder="Pipeline name"
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm"
              autoFocus
            />
            <Button 
              size="sm" 
              className="w-full h-8"
              onClick={handleCreatePipeline}
              disabled={!newPipelineName.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Submenu for multiple pipelines - always expanded */}
      {hasMultiplePipelines && (
        <SidebarMenuSub>
          {isLoadingPipelines ? (
            // Loading skeleton
            <>
              <SidebarMenuSubItem>
                <Skeleton className="h-6 w-full" />
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <Skeleton className="h-6 w-full" />
              </SidebarMenuSubItem>
            </>
          ) : (
            pipelines.map((pipeline) => {
              const pipelineUrl = `/pipeline/${pipeline._id}`
              const pipelineActive = location.pathname === pipelineUrl ||
                location.pathname.startsWith(`${pipelineUrl}/`)
              
              return (
                <SidebarMenuSubItem key={pipeline._id}>
                  <SidebarMenuSubButton asChild isActive={pipelineActive}>
                    <NavLink to={pipelineUrl}>
                      <span className="truncate">{pipeline.name}</span>
                      {pipeline.isDefault && (
                        <span className="ml-auto text-[10px] text-gray-400 uppercase tracking-wide">
                          Default
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })
          )}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

// Standard navigation item
function StandardNavItem({ item }: { item: NavItem }) {
  const location = useLocation()
  const active =
    location.pathname === item.url ||
    location.pathname.startsWith(`${item.url}/`)

  return (
    <Collapsible asChild defaultOpen={active}>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
          <NavLink to={item.url}>
            <item.icon />
            <span>{item.title}</span>
          </NavLink>
        </SidebarMenuButton>
        {item.items?.length ? (
          <>
            <CollapsibleTrigger asChild>
              <SidebarMenuAction className="data-[state=open]:rotate-90">
                <ChevronRight />
                <span className="sr-only">Toggle</span>
              </SidebarMenuAction>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.items?.map((subItem) => {
                  const subActive =
                    location.pathname === subItem.url ||
                    location.pathname.startsWith(`${subItem.url}/`)
                  return (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton asChild isActive={subActive}>
                        <NavLink to={subItem.url}>
                          <span>{subItem.title}</span>
                        </NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          </>
        ) : null}
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavMain({
  items,
}: {
  items: NavItem[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          // Use special component for Pipeline item
          if (item.title === "Pipeline") {
            return <PipelineNavItem key={item.title} item={item} />
          }
          
          return <StandardNavItem key={item.title} item={item} />
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
