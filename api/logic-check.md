# Intricate Application Logic (not just crud)

## Prospect
[x] [t] When we create a prospect (includes domains), we automatically call searchAndPopulateContacts and get all the contacts on those domains
[x] [t] For each of those contacts we create automatically, we automatically fetch all of their emails
[x] [t] For each of those contacts we create automatically, we also automatically fetch all of their events
[t] [t] If a domain is removed from a prospect, it removes those contacts/email addresses of contacts including that domain

## Nylas Webhook
[x] [t] When a new contact is included on a thread, we automatically add that domain to the prospect
[x] [t] When a new contact is included on a thread, we automatically add that domain to the opportunity

## Nylas Service
[x] [t] When we add a new nylas connection, we recheck all contacts for emails/calendar from that new service

## Opportunity
[x] [t] When we create an opportunity, we add all existing contacts to it
[x] [t] When we have an opportunity, we can add/remove contacts to it
[x] [t] If a contact is removed from the opportunity, we recalculate
[x] [t] If a contact is added to the opportunity, we recalculate

## Intelligence Processor
[x] [t] We default adding intelligence to an active opportunity (not closed won or lost).
[x] [t] If an opportunity is closed, we continue adding information to it, until a new opportunity is created.

## Activity
[x] [t] If a historical activity is added, we recalculate
[x] [t] To prevent duplication, we have a timeout before recalculating 
[x] [ ] When a new contact accesses the dataroom, we create a contact on that prospect and add them to the opportunity
[x] [ ] Activities for an opportunity only process from opportunityStartDate to ensure only relevant info.

[x] [ ] If a contact is added to the opportunity, and only if there's historical knowledge, should we recalculate? - If a contact is added to a prospect via webhook, can we reasonably assume that they are only just entering the conversation now? Do we need to know their history, or is from now onwward fine? I think so. Where as proactively adding a new contact to an opportunity might signal history? All we care about is their interactions in respect to the opportunity. 

[x] [t] If new activities arrive, and there is already a batch running, they should be added to the end of the batch
[x] [t] If an opportunity processing batch is running, and another reprocess is triggered, it restarts the process


[ ] We include prior opportunity information on new opportunity prompts
[ ] We should alert the user they are adding historical information, and let them alert us when it's done
[ ] Add filter to summarisation agent the filters emails for non-sales related stuff