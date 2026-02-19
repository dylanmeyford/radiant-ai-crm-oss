# Intelligence & Activity Processing Outline

## Initiation

Current Activities Processed:
- CalendarActivity
- EmailActivity
- Activity

Collectively we refer to the above as 'Activities'

1. All new activities, once created (via webhook or user creation) call `intelligenceProcessor.ts` — specifically that `processActivity` method.
2. `intelligenceProcessor.processActivity` calls our `ActivityProcessingQueueService` with the enqueueActivity method.

**Our AI system MUST process activities in their chronological order, as the context for later activities, depends on what has happened in the past**

### ActivityProcessingQueueService
The purpose of the `ActivityProcessingQueueService` is to manage the processing queue (of Activities) per prospect, and ensure that activities are processed in the correct chronological order within each prospect.
It also provides database-backed debouncing for opportunity reprocessing to survive reboots.
It further works in tandem with the `OpportunityBatchProcessingService` to manage when we are processing activities, or instead skipping individual activities to process the entire opportunity.
`queueWorkerService` is our background worker service that processes both activities and opportunity reprocessing from the unified queue. 
It processes activities in chronological order per prospect and handles opportunity reprocessing with debouncing.

The `queueWorkerService` uses the `opportunityBatchProcessingService` to process opportunity tasks, and `HistoricalActivityService.processActivityWithHistoricalCheck` method to kick of processing of individual activities.

Expected operation:
1. When new "real time" activities arrive, they should be queued in chronological order. That is, if three activities come in (Activity1, Activity2, Activity3), they are expected to be processed in that same order (Activity1, Activity2, Activity3).
2. If a historical activity arrives (that is, an activity that didn't happen today, but happened for example 3 weeks ago), this should kick off a reprocessing of the entire opportunity (opportunityBatchProcessingService).
3. If an opportunity is currently being reprocessed, and a "real time" activity arrives, it should be added to the end of the batch queue of activities to be processed.
4. If an opportunity is currently being reprocessed, and another historical activity arrives, it should restart the opportunity reprocessing.
5. If the system crashes or turns off, upon reboot it should start processing here it left off.


### HistoricalActivityService.processActivityWithHistoricalCheck
This method should:
1. Determine if this activity is real time, or historical.
2. Determine if there is an opportunity batch already running.
3. If the activity is real time, and there is a batch already running, it should add the activity to the end of the list of activities the batch is processing.
4. If the activity is real time and there is no batch running, it should process the activity for intelligence (using `ContactIntelligenceService.processActivityForIntelligenceV2`).
5. If the activity is historical and there is no batch running, schedule the opportunity for reprocessing.
6. If the activity is historical and there is a batch running, re-start that batch processing.


### opportunityBatchProcessingService
This method should handle the opportunity reprocessing logic, allowing us to cancel scheduled processing, schedule processing, get the status of the processing, and trigger the processing of the entire opportunity by calling `HistoricalActivityService.reprocessEntireOpportunity`.

### HistoricalActivityService.reprocessEntireOpportunity
This method removes all the intelligence data from an opportunity, then calls `reprocessActivitiesChronologically`.

### HistoricalActivityService.reprocessActivitiesChronologically
This method removes all the intelligence data from the contacts, fetches all the actvities related to the opportunity, sorts them chronologically, and then call `ContactIntelligenceService.processActivityForIntelligenceV2` on them one at a time.

## Intelligence Processing
- `ContactIntelligenceService` houses all of the AI processing we perform on activities.
- The entry point for this service is the method `ContactIntelligenceService.processActivityForIntelligenceV2`
- Our intelligence system is 'contact first', meaning we build intelligence about each contact of an opportunity first
- For Opportunity (or Deal) level intelligence, we then amalgamate all the information on each person in the opportunity, into an overall deal understanding.

The contact intelligence system works like this:
1. `processActivityForIntelligenceV2` is called with an activityId.
2. First it calls summariseActivity on the activity - this adds the ai summary to the activity.
3. We fetch the activity, which now includes the AI summary.
4. We determine the 'real-time' date of the activity
5. We find the contacts to include on the processing. For EmailActivity and CalendarActivity, there are contacts on the activity themselves. For Activity, we fetch all the contacts on the prospect.
6. We run the next stage in parallel, processing each contact at the same time.
7. First we determine the opportunity we are connecting the activity to. This is always the most recent opportunity. If there are multiple opportunities, we focus on the most recent active one.
8. For each activity, we then check if it's already been processed for that opportunity.
9. Next we set up a collection of documents which we will use for bulk saving later.
10. We begin processing each of our contacts simultaneously via our 5 phase AI pipeline. This pipeline is designed to perform our potentially long term AI processing outside of a MONGODB transaction, and then only save all the updates with a transaction once everything has been completed sucessfully. All AI calls use mastra.
11. `processingPromises` operates as the orchestrator of all our AI calls through the phases.

### AI Pipeline: Phase 1
Phase 1 of our pipeline executes all contact model specific intelligence services in parallel, except for the relationship story, which depends on this other intelligence to run. It will return these updates instead of saving to the database.
We call the following
- `activityImpactAgent` = determines the impact of the activity on the contacts engagement score.
- `BehavioralSignalProcessor.processActivity` = determines behavioural signals of the contact based on the activity.
- `ResponsivenessService.analyzeContactResponsiveness` = determines a ruling on the contacts responsiveness to-date (based on this activity, and saved prior activities).
- `RoleAssignmentService.extractAndAssignContactRole` = determines the contacts role in the sales process on the prospects side.
- `patternService.analyzeCommunicationPatterns` = determines the contacts communication patterns

We call all of these methods simultaneously. They all use mastra to make their AI calls. We use aiAgentLimit to limit the number of simultaneously calls happening at once.

We then return all these results for consumption in phase2.

### AI Pipeline: Phase 2
1. The data from phase 1 is passed into phase 2.
2. Phase 2 fetches the required contact + opportunity records from the databse, which we will use to modify with other phase returns in memory, so they can operate without committing changes to the database.
3. we return the databse objects with the intelligence data for phase 3.

### AI Pipeline: Phase 3
1. Phase 3 APPLIES the intelligence from phase 1, to the objects from phase 2 **in memory.**
2. This creates 'up to date' objects to be committed later as part of a transaction when all the AI calls are complete.
3. With the contact object in memory up-to-date with the phase1 information, we then call `RelationshipStoryService.generateRelationshipStory` to generate the relationship story for the contact incorporating the current activities information.
4. We then return these objects for phase 3 part b.

### AI Pipeline: Phase 4
1. In phase 4, we execute deal level processing. We take all the information we've accumulated so far on the contacts, and use these in-memory objects to make the AI calls for the opportunity.
2. We calculate and update the MEDDPICC with the `meddpiccAgent.generate` AI call.
3. We calculate the dealHealthIndicators using `DealAggregationService.calculateDealHealthIndicators`
4. We calculate a deal summary using an AI call: `DealSummaryService.generateDealSummary`
5. We return the updated (in memory) opportunity.

### AI Pipeline: Phase 5
1. In phase 5, we use a mongoDB transaction to update all the objects in the database to match the objects in memory.
2. We also update the receipts

