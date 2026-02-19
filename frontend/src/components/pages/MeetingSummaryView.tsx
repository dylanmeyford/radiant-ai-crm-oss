import { 
  Users, 
  MessageSquare, 
  ThumbsUp, 
  ThumbsDown, 
  Target,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface MeetingSummaryViewProps {
  summaryData: string;
  generatedDate?: Date | string;
}

export function MeetingSummaryView({ summaryData, generatedDate }: MeetingSummaryViewProps) {
  // Try to parse the JSON, fallback to plain text if it fails
  let parsedData: any;
  let isJSON = false;
  
  try {
    parsedData = JSON.parse(summaryData);
    isJSON = true;
  } catch (error) {
    // Not JSON, display as plain text
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="prose prose-sm max-w-none">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {summaryData}
          </p>
        </div>
        {generatedDate && (
          <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
            Generated on {new Date(generatedDate).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  if (!isJSON) return null;

  const getSentimentColor = (sentiment: string) => {
    if (!sentiment) return 'gray';
    const lower = sentiment.toLowerCase();
    if (lower.includes('positive')) return 'green';
    if (lower.includes('negative')) return 'red';
    if (lower.includes('neutral')) return 'gray';
    return 'gray';
  };

  const getStrengthBadge = (strength: string) => {
    const lower = strength?.toLowerCase() || '';
    if (lower === 'high') return 'bg-red-50 text-red-700 border-red-200';
    if (lower === 'medium') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (lower === 'low') return 'bg-green-50 text-green-700 border-green-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-4">
      {/* Overall Summary */}
      {parsedData.overallSummary && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Executive Summary</h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {parsedData.overallSummary}
          </p>
        </div>
      )}

      {/* Key Message */}
      {parsedData.keyMessage && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Key Takeaway</h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {parsedData.keyMessage}
          </p>
        </div>
      )}

      {/* Meeting Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Meeting Overview</h3>
        <div className="space-y-2">
          {parsedData.meetingPurpose && (
            <div>
              <p className="text-xs text-gray-500 font-medium">Purpose</p>
              <p className="text-sm text-gray-900">{parsedData.meetingPurpose}</p>
            </div>
          )}
          {parsedData.salesCycleStage && (
            <div>
              <p className="text-xs text-gray-500 font-medium">Sales Stage</p>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {parsedData.salesCycleStage}
              </span>
            </div>
          )}
          {parsedData.sentimentAnalysis && (
            <div>
              <p className="text-xs text-gray-500 font-medium">Sentiment</p>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                getSentimentColor(parsedData.sentimentAnalysis) === 'green' 
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : getSentimentColor(parsedData.sentimentAnalysis) === 'red'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}>
                {parsedData.sentimentAnalysis.split('—')[0].trim()}
              </span>
              {parsedData.sentimentAnalysis.includes('—') && (
                <p className="text-sm text-gray-700 mt-1">
                  {parsedData.sentimentAnalysis.split('—')[1].trim()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Meeting Attendees */}
      {parsedData.meetingAttendees && parsedData.meetingAttendees.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Attendees</h3>
          </div>
          <div className="space-y-3">
            {parsedData.meetingAttendees.map((attendee: any, idx: number) => (
              <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-gray-900">{attendee.name}</p>
                <p className="text-xs text-gray-600 mt-0.5">{attendee.role}</p>
                <p className="text-xs text-gray-500 mt-0.5">{attendee.organization}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Discussion Points */}
      {parsedData.keyDiscussionPoints && parsedData.keyDiscussionPoints.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Key Discussion Points</h3>
          </div>
          <ul className="space-y-2">
            {parsedData.keyDiscussionPoints.map((point: string, idx: number) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-gray-400 mt-1">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions Asked by Prospect */}
      {parsedData.questionsAskedByProspect && parsedData.questionsAskedByProspect.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900">Questions from Prospect</h3>
          </div>
          <div className="space-y-3">
            {parsedData.questionsAskedByProspect.map((q: any, idx: number) => (
              <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-gray-900">{q.question}</p>
                <p className="text-xs text-gray-600 mt-1">{q.context}</p>
                <p className="text-xs text-gray-500 mt-1">— {q.person}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Questions Asked by Sales Team */}
      {parsedData.questionsAskedBySalesTeam && parsedData.questionsAskedBySalesTeam.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Discovery Questions</h3>
          </div>
          <div className="space-y-3">
            {parsedData.questionsAskedBySalesTeam.map((q: any, idx: number) => (
              <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-gray-900">{q.question}</p>
                <p className="text-xs text-gray-600 mt-1">{q.context}</p>
                <p className="text-xs text-gray-500 mt-1">— {q.person}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators of Interest */}
      {parsedData.indicatorsOfInterest && parsedData.indicatorsOfInterest.length > 0 && (
        <div className="bg-white rounded-lg border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="h-4 w-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-900">Indicators of Interest</h3>
          </div>
          <div className="space-y-3">
            {parsedData.indicatorsOfInterest.map((indicator: any, idx: number) => (
              <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 flex-1">{indicator.indicator}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${getStrengthBadge(indicator.strength)}`}>
                    {indicator.strength}
                  </span>
                </div>
                {indicator.quoteOrContext && (
                  <p className="text-xs text-gray-600 italic mt-1 pl-3 border-l-2 border-gray-300">
                    "{indicator.quoteOrContext}"
                  </p>
                )}
                {indicator.person && (
                  <p className="text-xs text-gray-500 mt-1">— {indicator.person}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators of Disinterest */}
      {parsedData.indicatorsOfDisinterest && parsedData.indicatorsOfDisinterest.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsDown className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900">Concerns & Risks</h3>
          </div>
          <div className="space-y-3">
            {parsedData.indicatorsOfDisinterest.map((indicator: any, idx: number) => (
              <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 flex-1">{indicator.indicator}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${getStrengthBadge(indicator.strength)}`}>
                    {indicator.strength}
                  </span>
                </div>
                {indicator.quoteOrContext && (
                  <p className="text-xs text-gray-600 italic mt-1 pl-3 border-l-2 border-gray-300">
                    "{indicator.quoteOrContext}"
                  </p>
                )}
                {indicator.person && (
                  <p className="text-xs text-gray-500 mt-1">— {indicator.person}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MEDDPICC Analysis */}
      {parsedData.MEDDPICC && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">MEDDPICC Analysis</h3>
          </div>
          <div className="space-y-4">
            {/* Metrics */}
            {parsedData.MEDDPICC.Metrics && parsedData.MEDDPICC.Metrics.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Metrics</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC.Metrics.map((metric: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <p className="text-gray-900 font-medium">{metric.metric}</p>
                      <p className="text-gray-600 mt-0.5">{metric.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Economic Buyer */}
            {parsedData.MEDDPICC['Economic Buyer'] && parsedData.MEDDPICC['Economic Buyer'].length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Economic Buyer</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC['Economic Buyer'].map((buyer: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <p className="text-gray-900 font-medium">{buyer.name}</p>
                      <p className="text-gray-600 mt-0.5">{buyer.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decision Criteria */}
            {parsedData.MEDDPICC['Decision Criteria'] && parsedData.MEDDPICC['Decision Criteria'].length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Decision Criteria</h4>
                <ul className="space-y-1">
                  {parsedData.MEDDPICC['Decision Criteria'].map((criteria: any, idx: number) => (
                    <li key={idx} className="text-xs text-gray-700 flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{criteria.criteria}</span>
                        {criteria.reason && (
                          <p className="text-gray-600 mt-0.5">{criteria.reason}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decision Process */}
            {parsedData.MEDDPICC['Decision Process'] && parsedData.MEDDPICC['Decision Process'].length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Decision Process</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC['Decision Process'].map((process: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <p className="text-gray-900">{process.process}</p>
                      <p className="text-gray-600 mt-0.5">{process.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Identified Pain */}
            {parsedData.MEDDPICC['Identified Pain'] && parsedData.MEDDPICC['Identified Pain'].length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Identified Pain Points</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC['Identified Pain'].map((pain: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-900 font-medium">{pain.pain}</p>
                          <p className="text-gray-600 mt-0.5">{pain.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Champion */}
            {parsedData.MEDDPICC.Champion && parsedData.MEDDPICC.Champion.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Champion</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC.Champion.map((champion: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <p className="text-gray-900 font-medium">{champion.name}</p>
                      <p className="text-gray-600 mt-0.5">{champion.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competition */}
            {parsedData.MEDDPICC.Competition && parsedData.MEDDPICC.Competition.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Competition</h4>
                <div className="space-y-2">
                  {parsedData.MEDDPICC.Competition.map((comp: any, idx: number) => (
                    <div key={idx} className="text-xs">
                      <p className="text-gray-900 font-medium">{comp.competition}</p>
                      <p className="text-gray-600 mt-0.5">{comp.reason}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs mt-1 border ${
                        comp.relevance?.toLowerCase() === 'high' 
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : comp.relevance?.toLowerCase() === 'medium'
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {comp.relevance} relevance
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context & Notes */}
      {parsedData.context && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Context & Notes</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {parsedData.context}
          </p>
        </div>
      )}

      {/* Debug Info (if present) */}
      {parsedData.debug && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Analysis Notes</h3>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {parsedData.debug}
          </p>
        </div>
      )}

      {/* Generated Date */}
      {generatedDate && (
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Generated on {new Date(generatedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </div>
      )}
    </div>
  );
}

