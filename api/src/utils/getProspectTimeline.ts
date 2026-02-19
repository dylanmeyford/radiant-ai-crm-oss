import Prospect from "../models/Prospect";
import mongoose from 'mongoose'; // Import mongoose for Types.ObjectId
import { DigitalSalesRoom, DocumentAccess, LinkAccess, IDocument, ILink, IDocumentAccess, ILinkAccess, IVisitor, IDigitalSalesRoom } from '../models/DigitalSalesRoom';

// Define interfaces for populated documents to help with type checking
interface PopulatedDocAccessType extends Omit<IDocumentAccess, 'document'> { 
  _id: mongoose.Types.ObjectId; // Ensure _id is correctly typed
  document?: Pick<IDocument, 'name'>; 
}

interface PopulatedLinkAccessType extends Omit<ILinkAccess, 'link'> {
  _id: mongoose.Types.ObjectId; // Ensure _id is correctly typed
  link?: Pick<ILink, 'name' | 'url'>;
}

// Define an interface for DigitalSalesRoom with populated visitors
interface PopulatedDigitalSalesRoom extends Omit<IDigitalSalesRoom, 'visitors'> {
  visitors: IVisitor[];
}

// This function creates a timeline of activities for a prospect sorted from past to present
export const getProspectTimeline = async (prospectId: string) => {
    const prospect = await Prospect.findById(prospectId).populate({
      path: 'contacts', 
      populate: [
        {
          path: 'emailActivities',
        },
        {
          path: 'calendarActivities',
        }
      ]
    })
    .populate('opportunities')
    .populate('activities');
  
    if (!prospect) {
      throw new Error('Prospect not found');
    }
  
    // Extract all activities from contacts and prospect
    const contactEmailActivities = prospect.contacts.flatMap((contact: any) => 
      contact.emailActivities.map((activity: any) => ({
        ...activity.toObject(),
        type: 'email'
      }))
    );
    
    const contactCalendarActivities = prospect.contacts.flatMap((contact: any) => 
      contact.calendarActivities.map((activity: any) => ({
        ...activity.toObject(),
        type: 'calendar',
        date: activity.startTime, // Ensure calendar activities have a date for sorting
      }))
    );
    
    const prospectActivities = prospect.activities.map((activity: any) => activity.toObject());

    // Initialize array for DSR activities
    let dsrTimelineActivities: any[] = [];

    if (prospect.opportunities && prospect.opportunities.length > 0) {
      const opportunityIds = prospect.opportunities.map((op: any) => op._id);
      
      const digitalSalesRooms = await DigitalSalesRoom.find({ opportunity: { $in: opportunityIds } })
        .populate('visitors') 
        .exec() as unknown as PopulatedDigitalSalesRoom[]; // Force cast after populate

      for (const dsr of digitalSalesRooms) {
        const documentIds = dsr.documents.map((doc: any) => doc._id);
        const linkIds = dsr.links.map((link: any) => link._id);

        if (documentIds.length > 0) {
          const docAccesses = await DocumentAccess.find({ document: { $in: documentIds } })
            .populate<{ document: Pick<IDocument, 'name'> }>({ path: 'document', select: 'name' });

          for (const access of docAccesses as PopulatedDocAccessType[]) {
            dsrTimelineActivities.push({
              _id: access._id.toString(),
              type: 'dsr_document_view',
              date: access.accessedAt,
              details: {
                visitorEmail: access.visitorEmail,
                documentName: access.document?.name || 'Unknown Document',
                durationMs: access.durationMs,
                pageViews: access.pageViews,
                roomName: dsr.name,
              },
            });
          }
        }

        if (linkIds.length > 0) {
          const linkAccesses = await LinkAccess.find({ link: { $in: linkIds } })
            .populate<{ link: Pick<ILink, 'name' | 'url'> }>({ path: 'link', select: 'name url' });

          for (const access of linkAccesses as PopulatedLinkAccessType[]) {
            dsrTimelineActivities.push({
              _id: access._id.toString(),
              type: 'dsr_link_click',
              date: access.accessedAt,
              details: {
                visitorEmail: access.visitorEmail,
                linkName: access.link?.name || 'Unknown Link',
                linkUrl: access.link?.url,
                durationMs: access.durationMs,
                referrer: access.referrer,
                roomName: dsr.name,
              },
            });
          }
        }

        // Add visitor information to timeline
        if (dsr.visitors && dsr.visitors.length > 0) {
          for (const item of dsr.visitors) { 
            const visitor = item as IVisitor; // Explicitly cast item to IVisitor
            dsrTimelineActivities.push({
              _id: (visitor._id as mongoose.Types.ObjectId).toString(),
              type: 'dsr_visitor_info',
              date: visitor.lastVisitedAt,
              details: {
                visitorEmail: visitor.email,
                lastVisitedAt: visitor.lastVisitedAt,
                totalVisits: visitor.totalVisits,
                roomName: dsr.name,
              },
            });
          }
        }
      }
    }
    
    // Combine all activities into a single array
    let allActivities = [...contactEmailActivities, ...contactCalendarActivities, ...prospectActivities, ...dsrTimelineActivities];
    
    // Deduplicate activities based on _id
    const uniqueActivitiesMap = new Map();
    allActivities.forEach(activity => {
      const activityIdString = activity._id ? activity._id.toString() : Date.now().toString() + Math.random().toString();
      if (!uniqueActivitiesMap.has(activityIdString)) {
        uniqueActivitiesMap.set(activityIdString, activity);
      } 
    });
    allActivities = Array.from(uniqueActivitiesMap.values());
    
    // Sort activities by date from past to present
    const sortedActivities = allActivities.sort((a, b) => {
      const dateA = new Date(a.date || a.startTime);
      const dateB = new Date(b.date || b.startTime);

      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      
      return dateA.getTime() - dateB.getTime();
    });
    
    // Create a timeline of activities
    const timeline = sortedActivities.map((activity: any) => {
      const baseEvent = {
        type: activity.type,
        id: activity._id ? activity._id.toString() : undefined, 
        date: activity.date || activity.startTime,
      };

      if (activity.type && activity.type.startsWith('dsr_')) {
        return {
          ...baseEvent,
          details: activity.details,
        };
      } else {
        return {
          ...baseEvent,
          summary: activity.aiSummary?.summary || '',
        };
      }
    });
    
    return timeline;
  };