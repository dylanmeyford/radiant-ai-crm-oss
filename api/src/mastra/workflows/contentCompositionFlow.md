# Content Composition Flow

The ultimate content writing prompt follows this structure:

1. Developer Instructions - @enhancedContentAgent.ts
2. User message - contentCompositionWorkflow.ts line 938
3. Original request prompt - embedded at contentCompositionWorkflow.ts line 952. Originates from content file of possibleAction (for example, possibleActions > EMAIL > content.ts)

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTENT COMPOSITION PROMPT STRUCTURE                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  1. DEVELOPER INSTRUCTIONS                                              │
│     Source: enhancedContentAgent.ts (lines 6-72)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. USER MESSAGE / CONTEXT                                              │
│     Source: contentCompositionWorkflow.ts (line 938)                    │
│     ─────────────────────────────────────────────────────               │
│     • Context: "You are an expert B2B AE"                               │
│     • Selected playbooks (JSON)                                         │
│     • Instructions wrapper                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. ORIGINAL REQUEST PROMPT                                             │
│     Source: contentCompositionWorkflow.ts (line 952)                    │
│     ─────────────────────────────────────────────────────               │
│     Originates from:                                                    │
│     ┌─────────────────────────────────────────────────┐                │
│     │ possibleActions/                                 │                │
│     │   └── EMAIL/                                     │                │
│     │       └── content.ts                             │                │
│     │           └── buildEmailContentPrompt()          │                │
│     │               • Role definition                  │                │
│     │               • Opportunity context              │                │
│     │               • Contact information              │                │
│     │               • Email-specific requirements     │                │
│     └─────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FINAL PROMPT TO LLM                                  │
│  ────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  <developer_instructions>                                               │
│    [From enhancedContentAgent.ts]                                       │
│  </developer_instructions>                                              │
│                                                                          │
│  <context>                                                               │
│    [User message from workflow line 938]                                │
│  </context>                                                              │
│                                                                          │
│  <selected_playbooks>                                                    │
│    [JSON playbooks data]                                                │
│  </selected_playbooks>                                                   │
│                                                                          │
│  <instructions>                                                          │
│    <request_prompt>                                                      │
│      [Original request from content.ts]                                 │
│    </request_prompt>                                                     │
│  </instructions>                                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │  LLM Response  │
                          │  (Generated    │
                          │   Content)     │
                          └─────────────────┘
```

## Flow Summary

```
enhancedContentAgent.ts (Developer Instructions)
         │
         ├─► Defines agent capabilities and behavior
         │
contentCompositionWorkflow.ts (line 938)
         │
         ├─► Wraps context and playbooks
         │
         └─► Embeds original request (line 952)
                 │
                 └─► Originates from possibleActions/
                         │
                         └─► EMAIL/content.ts
                                 │
                                 └─► buildEmailContentPrompt()
                                         │
                                         └─► Generates action-specific prompt
```