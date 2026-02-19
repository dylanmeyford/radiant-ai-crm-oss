import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  TrendingUp, 
  Clock, 
  MessageCircle,
  ArrowLeft,
  Sparkles,
  Briefcase,
  Star,
  Lightbulb,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Contact } from '@/types/prospect';
import { useIsMobile } from '@/hooks/use-mobile';

interface ContactOverviewProps {
  contact: Contact | null;
  opportunityId: string;
  isLoading?: boolean;
  onBack: () => void;
}

export const ContactOverview: React.FC<ContactOverviewProps> = ({ 
  contact, 
  opportunityId,
  isLoading = false,
  onBack
}) => {
  const [isResearchExpanded, setIsResearchExpanded] = useState(false);
  const [isRelationshipStoryExpanded, setIsRelationshipStoryExpanded] = useState(false);
  const isMobile = useIsMobile();

  const getContactIntelligence = () => {
    if (!contact?.opportunityIntelligence) return null;
    
    return contact.opportunityIntelligence.find(
      intel => intel.opportunity === opportunityId
    );
  };

  const getEngagementChartData = () => {
    const intelligence = getContactIntelligence();
    if (!intelligence?.scoreHistory || intelligence.scoreHistory.length === 0) {
      return [];
    }

    // Sort by date ascending for chart display
    return [...intelligence.scoreHistory]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((entry) => ({
        date: new Date(entry.date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        score: entry.score,
        fullDate: entry.date,
        reasoning: entry.reasoning
      }));
  };

  const getChartDomain = () => {
    const chartData = getEngagementChartData();
    if (chartData.length === 0) return [0, 100];
    
    const scores = chartData.map(d => d.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    // Add some padding to the domain for better visualization
    const padding = Math.max(5, (maxScore - minScore) * 0.1);
    const domainMin = Math.max(0, minScore - padding);
    const domainMax = Math.min(100, maxScore + padding);
    
    return [Math.floor(domainMin), Math.ceil(domainMax)];
  };

  const getCurrentEngagementScore = () => {
    const intelligence = getContactIntelligence();
    return intelligence?.engagementScore || 0;
  };

  const getMostRecentResponsiveness = () => {
    const intelligence = getContactIntelligence();
    if (!intelligence?.responsiveness || intelligence.responsiveness.length === 0) {
      return null;
    }

    // Get the most recent responsiveness analysis
    return [...intelligence.responsiveness]
      .sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime())[0];
  };

  const getResponsivenessStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'engaged':
        return 'bg-green-100 text-green-800';
      case 'delayed':
        return 'bg-yellow-100 text-yellow-800';
      case 'ghosting':
        return 'bg-red-100 text-red-800';
      case 'ooo':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const chartConfig = {
    score: {
      label: "Engagement Score",
      color: "var(--primary)",
    },
  };

  if (isLoading) {
    return (
      <div className={`flex-1 flex flex-col p-4 ${isMobile ? '' : 'overflow-hidden'}`}>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className={`flex-1 space-y-6 ${isMobile ? '' : 'overflow-y-auto'}`}>
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <User className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-sm font-medium text-gray-900 mb-2">No Contact Selected</h3>
        <p className="text-xs text-gray-500 text-center">
          Select a contact from the sidebar to view their details and engagement history.
        </p>
      </div>
    );
  }

  const intelligence = getContactIntelligence();
  const chartData = getEngagementChartData();
  const currentScore = getCurrentEngagementScore();
  const recentResponsiveness = getMostRecentResponsiveness();
  const chartDomain = getChartDomain();

  return (
    <div className={`flex-1 flex flex-col ${isMobile ? '' : 'overflow-hidden'}`}>
      <div className="p-4 pb-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {contact.firstName} {contact.lastName}
            </h2>
            {contact.isPrimary && (
              <Badge variant="secondary" className="text-xs">
                Primary
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-1 p-4 space-y-6 ${isMobile ? '' : 'overflow-y-auto'}`}>
        {/* Top Section: Contact Details and Engagement Score Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contact Details */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-medium text-gray-900">Contact Information</h3>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Email Addresses
                  </label>
                  <div className="mt-1 space-y-2">
                    {contact.emails.map((email, index) => (
                      <div key={email._id || `email-${index}`} className="flex items-center justify-between">
                        <span className="text-sm text-gray-900">{email.address}</span>
                        <div className="flex items-center gap-2">
                          {email.category && (
                            <Badge 
                              variant="outline" 
                              className="text-xs"
                            >
                              {email.category}
                            </Badge>
                          )}
                          {email.isPrimary && (
                            <Badge variant="secondary" className="text-xs">
                              Primary
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Engagement Score Card */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-600" />
                    <h3 className="text-sm font-medium text-gray-900">Engagement Score</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">{currentScore}</div>
                    <div className="text-xs text-gray-500">Current</div>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="h-32 w-full">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <LineChart 
                      data={chartData}
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={chartDomain}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10 }}
                        width={30}
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
                            formatter={(value, _name, props) => {
                              const reasoning = props?.payload?.reasoning;
                              return [
                                <div key="score" className="space-y-1">
                                  <div>{`${value} - Engagement Score`}</div>
                                  {reasoning && (
                                    <div className="text-xs text-gray-600 max-w-xs">
                                      {reasoning.length > 100 
                                        ? `${reasoning.substring(0, 100)}...`
                                        : reasoning
                                      }
                                    </div>
                                  )}
                                </div>
                              ];
                            }}
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Current Responsiveness */}
        {recentResponsiveness && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Current Responsiveness</h3>
                </div>
                <Badge 
                  className={`text-xs ${getResponsivenessStatusColor(recentResponsiveness.status)}`}
                >
                  {recentResponsiveness.status}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Latest analysis from {new Date(recentResponsiveness.analyzedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <div className="text-sm text-gray-900">
                  {recentResponsiveness.summary}
                </div>
                {recentResponsiveness.isAwaitingResponse && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-md">
                    <Clock className="h-3 w-3" />
                    <span>Awaiting response from contact</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI-Generated Contact Research (Collapsible) */}
        {contact.contactResearch && contact.contactResearch.personalSummary && (
          <div className="bg-white rounded-lg border border-gray-200">
            <button
              onClick={() => setIsResearchExpanded(!isResearchExpanded)}
              className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-medium text-gray-900">AI Contact Research</h3>
                  {contact.contactResearch.contactScore !== undefined && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-sm font-semibold text-gray-900">
                        {contact.contactResearch.contactScore}/10
                      </span>
                    </div>
                  )}
                </div>
                {isResearchExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 text-left">
                Researched on {contact.contactResearch.researchedAt 
                  ? new Date(contact.contactResearch.researchedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'recently'}
              </p>
            </button>
            {isResearchExpanded && (
              <div className="p-4 space-y-4">
                {/* Personal Summary */}
                {contact.contactResearch.personalSummary && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-3 w-3 text-gray-600" />
                      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Summary
                      </h4>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {contact.contactResearch.personalSummary}
                    </p>
                  </div>
                )}

                {/* Role at Company */}
                {contact.contactResearch.roleAtCompany && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-3 w-3 text-gray-600" />
                      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Role
                      </h4>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {contact.contactResearch.roleAtCompany}
                    </p>
                  </div>
                )}

                {/* Background Information */}
                {contact.contactResearch.backgroundInfo && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageCircle className="h-3 w-3 text-gray-600" />
                      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Background
                      </h4>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {contact.contactResearch.backgroundInfo}
                    </p>
                  </div>
                )}

                {/* Connection Opportunities */}
                {contact.contactResearch.connectionOpportunities && 
                 contact.contactResearch.connectionOpportunities.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="h-3 w-3 text-amber-600" />
                      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Conversation Starters
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {contact.contactResearch.connectionOpportunities.map((opportunity, index) => (
                        <div 
                          key={index}
                          className="flex items-start gap-2 p-3 bg-amber-50 rounded-md border border-amber-100"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="h-5 w-5 rounded-full bg-amber-200 flex items-center justify-center">
                              <span className="text-xs font-medium text-amber-800">
                                {index + 1}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-900 leading-relaxed flex-1">
                            {opportunity}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LinkedIn Profile Link */}
                {contact.contactResearch.linkedInProfile && 
                 contact.contactResearch.linkedInProfile !== "_null_" && (
                  <div className="pt-2 border-t border-gray-200">
                    <a 
                      href={contact.contactResearch.linkedInProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View LinkedIn Profile →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Relationship Story (Collapsible) */}
        {intelligence?.relationshipStory && (
          <div className="bg-white rounded-lg border border-gray-200">
            <button
              onClick={() => setIsRelationshipStoryExpanded(!isRelationshipStoryExpanded)}
              className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-gray-600" />
                  <h3 className="text-sm font-medium text-gray-900">Relationship Story</h3>
                </div>
                {isRelationshipStoryExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 text-left">
                AI-generated narrative of the relationship progression
              </p>
            </button>
            {isRelationshipStoryExpanded && (
              <div className="p-4">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                  {intelligence.relationshipStory}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
