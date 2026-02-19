import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Thermometer, 
  X, 
  Plus, 
  CircleDollarSign,
  Crown,
  UserCheck,
  MousePointerClick,
  BriefcaseBusiness,
  OctagonX,
  Circle,
  Sparkles,
  UserPlus
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis } from 'recharts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OpportunityData } from '@/types/pipeline';
import { Contact } from '@/types/prospect';

interface OpportunitySidebarProps {
  opportunity: OpportunityData | null;
  isLoading?: boolean;
  onRemoveContact?: (contactId: string) => Promise<void>;
  onAddContact?: () => void;
  onContactClick?: (contact: any) => void;
  availableContacts?: Contact[];
  isLoadingAvailableContacts?: boolean;
  onQuickAddContact?: (contactId: string) => Promise<void>;
}

export const OpportunitySidebar: React.FC<OpportunitySidebarProps> = ({ 
  opportunity, 
  isLoading = false,
  onRemoveContact,
  onAddContact,
  onContactClick,
  availableContacts = [],
  isLoadingAvailableContacts = false,
  onQuickAddContact
}) => {
  const [contactToRemove, setContactToRemove] = useState<{id: string, name: string} | null>(null);
  const [hoveredAvailableContactId, setHoveredAvailableContactId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const handleRemoveContact = async () => {
    if (!contactToRemove || !onRemoveContact) return;
    
    // Close dialog immediately for better UX
    const contactId = contactToRemove.id;
    setContactToRemove(null);
    
    // Execute the removal in the background
    try {
      await onRemoveContact(contactId);
    } catch (error) {
      console.error('Failed to remove contact:', error);
    }
  };

  const getCurrentTemperature = () => {
    if (!opportunity?.dealTemperatureHistory || opportunity.dealTemperatureHistory.length === 0) {
      return null;
    }
    
    // Sort by date descending and get the most recent temperature
    const sortedHistory = [...opportunity.dealTemperatureHistory].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return sortedHistory[0]?.temperature;
  };

  const getChartData = () => {
    if (!opportunity?.dealTemperatureHistory || opportunity.dealTemperatureHistory.length === 0) {
      return [];
    }

    // Sort by date ascending for chart display and format for chart
    return [...opportunity.dealTemperatureHistory]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((entry) => ({
        date: new Date(entry.date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        temperature: entry.temperature,
        fullDate: entry.date,
      }));
  };

  const chartConfig = {
    temperature: {
      label: "Temperature",
      color: "var(--primary)",
    },
  };

  const getMeddpiccStatus = () => {
    if (!opportunity?.meddpicc) {
      return {
        M: { filled: false, data: [], label: "Metrics" },
        E: { filled: false, data: [], label: "Economic Buyer" },
        D1: { filled: false, data: [], label: "Decision Criteria" },
        D2: { filled: false, data: [], label: "Decision Process" },
        P: { filled: false, data: [], label: "Identified Pain" },
        I: { filled: false, data: [], label: "Implicate the Pain" },
        C1: { filled: false, data: [], label: "Champion" },
        C2: { filled: false, data: [], label: "Competition" },
      };
    }

    const { meddpicc } = opportunity;
    
    return {
      M: { 
        filled: meddpicc.metrics && meddpicc.metrics.length > 0, 
        data: meddpicc.metrics || [],
        label: "Metrics",
        description: "Quantifiable business impact and value metrics"
      },
      E: { 
        filled: meddpicc.economicBuyer && meddpicc.economicBuyer.length > 0, 
        data: meddpicc.economicBuyer || [],
        label: "Economic Buyer",
        description: "Person with budget authority and decision-making power"
      },
      D1: { 
        filled: meddpicc.decisionCriteria && meddpicc.decisionCriteria.length > 0, 
        data: meddpicc.decisionCriteria || [],
        label: "Decision Criteria",
        description: "Technical and business requirements for the decision"
      },
      D2: { 
        filled: meddpicc.decisionProcess && meddpicc.decisionProcess.length > 0, 
        data: meddpicc.decisionProcess || [],
        label: "Decision Process",
        description: "How the organization makes purchasing decisions"
      },
      P: { 
        filled: meddpicc.identifiedPain && meddpicc.identifiedPain.length > 0, 
        data: meddpicc.identifiedPain || [],
        label: "Pain",
        description: "Business problems and challenges identified"
      },
      I: { 
        filled: false, // Not present in the data structure
        data: [],
        label: "Implicate Pain",
        description: "Cost of not solving the identified problems"
      },
      C1: { 
        filled: meddpicc.champion && meddpicc.champion.length > 0, 
        data: meddpicc.champion || [],
        label: "Champion",
        description: "Internal advocate who supports our solution"
      },
      C2: { 
        filled: meddpicc.competition && meddpicc.competition.length > 0, 
        data: meddpicc.competition || [],
        label: "Competition",
        description: "Competitive landscape and alternatives"
      },
    };
  };

  const getHealthTrendIcon = (trend: string) => {
    switch (trend?.toLowerCase()) {
      case 'improving':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'declining':
        return <TrendingDown className="h-5 w-5 text-red-600" />;
      case 'stable':
      default:
        return <Minus className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getMomentumIcon = (momentum: string) => {
    switch (momentum?.toLowerCase()) {
      case 'accelerating':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'decelerating':
        return <TrendingDown className="h-5 w-5 text-red-600" />;
      case 'stable':
      default:
        return <Minus className="h-5 w-5 text-blue-600" />;
    }
  };

  const getTemperatureColor = (temperature: number) => {
    if (temperature >= 80) return 'text-red-600';
    if (temperature >= 60) return 'text-orange-600';
    if (temperature >= 40) return 'text-yellow-600';
    if (temperature >= 20) return 'text-blue-600';
    return 'text-gray-600';
  };

  const getCurrentRole = (contact: any, opportunityId: string): string | null => {
    if (!contact.opportunityIntelligence || !Array.isArray(contact.opportunityIntelligence)) {
      return null;
    }

    // Find intelligence data for this specific opportunity
    const oppIntel = contact.opportunityIntelligence.find(
      (intel: any) => intel.opportunity === opportunityId
    );

    if (!oppIntel || !oppIntel.roleAssignments || !Array.isArray(oppIntel.roleAssignments)) {
      return null;
    }

    // Get the most recent role assignment by sorting by assignedAt date
    const sortedRoles = [...oppIntel.roleAssignments].sort(
      (a: any, b: any) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
    );

    // Return the most recent role
    return sortedRoles.length > 0 ? sortedRoles[0].role : null;
  };

  const getRoleIcon = (role: string | null) => {
    if (!role) return null;

    const iconProps = { className: "h-3 w-3" };

    switch (role.toLowerCase()) {
      case 'economic buyer':
        return <CircleDollarSign {...iconProps} className="h-3 w-3 text-green-600" />;
      case 'champion':
        return <Crown {...iconProps} className="h-3 w-3 text-yellow-600" />;
      case 'influencer':
        return <UserCheck {...iconProps} className="h-3 w-3 text-blue-600" />;
      case 'user':
        return <MousePointerClick {...iconProps} className="h-3 w-3 text-purple-600" />;
      case 'decision maker':
        return <BriefcaseBusiness {...iconProps} className="h-3 w-3 text-indigo-600" />;
      case 'blocker':
        return <OctagonX {...iconProps} className="h-3 w-3 text-red-600" />;
      default:
        return <Circle {...iconProps} className="h-3 w-3 text-gray-500" />;
    }
  };

  const hasContactResearch = (contact: any): boolean => {
    return !!(contact.contactResearch && contact.contactResearch.personalSummary);
  };

  if (isLoading) {
    return (
      <div className={`bg-white flex flex-col ${
        isMobile 
          ? 'w-full border-b border-gray-200' 
          : 'w-80 border-r border-gray-200'
      }`}>
        <div className="p-4 border-b border-gray-200">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-8" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-5 w-6 rounded" />
              <Skeleton className="h-3 w-6" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className={`w-full ${isMobile ? 'h-24' : 'h-32'}`} />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex items-center gap-1">
              {Array.from({ length: isMobile ? 6 : 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
          </div>
          <Separator className="my-4" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className={`bg-white p-4 ${
        isMobile 
          ? 'w-full border-b border-gray-200' 
          : 'w-80 border-r border-gray-200'
      }`}>
        <div className="text-center text-gray-500 text-sm">
          No opportunity data available
        </div>
      </div>
    );
  }

  const currentTemperature = getCurrentTemperature();
  const chartData = getChartData();
  const meddpiccStatus = getMeddpiccStatus();
  const assignedContactIds = new Set((opportunity.contacts || []).map((contact) => contact._id));
  const availableContactsToShow = availableContacts.filter(
    (contact) => !assignedContactIds.has(contact._id)
  );

  return (
    <div className={`bg-white flex flex-col ${
      isMobile 
        ? 'w-full border-b border-gray-200' 
        : 'w-80 border-r border-gray-200'
    }`}>

      {/* Content */}
      <div className={`space-y-4 ${isMobile ? 'p-3' : 'p-4'}`}>
        {/* At a Glance Indicators */}
        <div className={`flex items-center justify-between ${isMobile ? 'pb-4 border-b border-gray-100' : ''}`}>
          {/* Health */}
          <div className="flex flex-col items-center gap-2">
            {getHealthTrendIcon(opportunity.dealHealthTrend || 'stable')}
            <span className="text-xs text-muted-foreground">Health</span>
          </div>

          {/* Temperature */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center">
              {currentTemperature !== null ? (
                <span className={`text-lg font-semibold ${getTemperatureColor(currentTemperature)}`}>
                  {currentTemperature}
                </span>
              ) : (
                <Thermometer className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">Temp</span>
          </div>

          {/* Momentum */}
          <div className="flex flex-col items-center gap-2">
            {getMomentumIcon(opportunity.momentumDirection || 'stable')}
            <span className="text-xs text-muted-foreground">Momentum</span>
          </div>
        </div>

        {/* Temperature Chart */}
        {chartData.length > 0 && (
          <div className={`space-y-3 ${isMobile ? 'pt-4 pb-12 border-b border-gray-100' : ''}`}>
            <h3 className="text-sm font-medium text-gray-900">Temperature History</h3>
            <div className={isMobile ? 'h-28 mb-2' : 'h-32'}>
              <ChartContainer config={chartConfig}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: isMobile ? 15 : 5 }}>
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    height={isMobile ? 20 : 15}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    width={25}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value, payload) => {
                          if (payload && payload[0]) {
                            return new Date(payload[0].payload.fullDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            });
                          }
                          return value;
                        }}
                        formatter={(value) => [`${value}`, "Temperature"]}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        )}

        {/* MEDDPICC Section */}
        <div className={`space-y-3 ${isMobile ? 'pt-6' : 'py-4'}`}>
          <h3 className="text-sm font-medium text-gray-900">MEDDPICC</h3>
          <TooltipProvider>
            <div className={`flex items-center ${isMobile ? 'gap-2 flex-wrap' : 'gap-1'}`}>
              {Object.entries(meddpiccStatus).map(([letter, status]) => (
                <Tooltip key={letter}>
                  <TooltipTrigger asChild>
                    <button
                      className={`
                        ${isMobile ? 'h-10 w-10' : 'h-8 w-8'} rounded-full flex items-center justify-center text-xs font-semibold text-white
                        transition-colors hover:opacity-80
                        ${status.filled 
                          ? 'bg-primary hover:bg-green-600' 
                          : 'bg-gray-400 hover:bg-gray-500'
                        }
                      `}
                    >
                      {letter.replace(/\d/, '')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-2">
                      <div className="font-semibold">{status.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {status.description}
                      </div>
                      {status.filled && status.data.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Current entries:</div>
                          {status.data.slice(0, 3).map((item: any, index: number) => (
                            <div key={index} className="text-xs">
                              {item.name || item.metric || item.criteria || item.process || item.pain || 'Entry'}
                              {item.confidence && (
                                <span className="text-muted-foreground ml-1">
                                  ({item.confidence} confidence)
                                </span>
                              )}
                            </div>
                          ))}
                          {status.data.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{status.data.length - 3} more
                            </div>
                          )}
                        </div>
                      )}
                      {!status.filled && (
                        <div className="text-xs text-muted-foreground">
                          Not yet completed
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>

        {/* Separator */}
        <Separator className={isMobile ? 'my-5' : 'my-4'} />

        {/* Contacts Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Contacts</h3>
            {onAddContact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddContact}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          {opportunity.contacts && opportunity.contacts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {opportunity.contacts.map((contact) => (
                <div
                  key={contact._id}
                  className="group relative"
                >
                  <Badge
                    variant="secondary"
                    className={`text-xs px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                      onContactClick ? 'cursor-pointer hover:bg-gray-200' : ''
                    }`}
                    onClick={() => onContactClick?.(contact)}
                  >
                    {/* Role icon - hidden on hover when delete is available */}
                    {(() => {
                      const currentRole = getCurrentRole(contact, opportunity._id);
                      const roleIcon = getRoleIcon(currentRole);
                      
                      if (roleIcon) {
                        return (
                          <div className={`transition-opacity ${
                            onRemoveContact ? 'group-hover:opacity-0' : ''
                          }`}>
                            {roleIcon}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* Delete X - appears in place of role icon on hover */}
                    {onRemoveContact && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent contact click when deleting
                          setContactToRemove({
                            id: contact._id,
                            name: `${contact.firstName} ${contact.lastName}`
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive absolute left-3 top-1/2 transform -translate-y-1/2 z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {contact.firstName} {contact.lastName}
                    {contact.isPrimary && (
                      <span className="ml-1 text-[10px] opacity-70">•</span>
                    )}
                    {/* AI Research indicator */}
                    {hasContactResearch(contact) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="ml-1">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <div className="text-xs">
                            AI research available
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No contacts assigned
            </div>
          )}
        </div>

        {/* Available Contacts Section */}
        <div className="space-y-3">
          {isLoadingAvailableContacts ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          ) : availableContactsToShow.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableContactsToShow.map((contact) => {
                const isHovered = hoveredAvailableContactId === contact._id;
                return (
                  <Badge
                    key={contact._id}
                    variant="secondary"
                    onMouseEnter={() => setHoveredAvailableContactId(contact._id)}
                    onMouseLeave={() => setHoveredAvailableContactId(null)}
                    onClick={() => onQuickAddContact?.(contact._id)}
                    className={`text-xs px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                      onQuickAddContact ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isHovered
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-dashed border-green-200'
                        : 'bg-gray-50 text-gray-400 border border-dashed border-gray-200'
                    }`}
                  >
                    {isHovered ? (
                      <>
                        <UserPlus className="h-3 w-3" />
                        <span>Add contact?</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" />
                        <span>
                          {contact.firstName} {contact.lastName}
                        </span>
                      </>
                    )}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No other contacts available
            </div>
          )}
        </div>

        {/* Confirmation Dialog */}
        <Dialog open={!!contactToRemove} onOpenChange={() => setContactToRemove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Contact</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove {contactToRemove?.name} from this opportunity? 
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setContactToRemove(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveContact}
              >
                Remove Contact
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
