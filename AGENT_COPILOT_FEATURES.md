# SpellStock Agent Copilot — Feature Documentation

## Overview

The SpellStock Agent Copilot is an AI-powered autonomous agent that understands natural language and translates it into executable operations on an Action Queue for restaurant inventory management.

## Key Features

### 1. **Dynamic Intent Detection**

The agent automatically detects what you want to do:

- **VIEW** — Show all actions in the queue
  - Example: "show me all actions", "what's in the queue?"
- **FILTER** — Narrow down existing results
  - Example: "only kitchen tasks", "show high risk actions", "actions for chicken"
- **ADD** — Create new actions
  - Example: "order chicken breast", "draft a PO for lettuce", "create a task for kitchen staff"
- **MODIFY** — Change action status
  - Example: "approve action abc123", "update status"
- **EXECUTE** — Trigger actions to run
  - Example: "execute all POs", "run action abc123", "do it"
- **REMOVE** — Reject/discard actions
  - Example: "reject the lettuce task", "cancel surplus actions"
- **RESET** — Rebuild the entire action queue
  - Example: "start over", "reset", "regenerate action plan"

### 2. **Conversation Memory & Context Awareness**

The agent remembers your previous requests within a session:

#### Refinement vs. New Requests

**Refinement** (building on previous query):

- "show me all actions" → "only the high risk ones"
- The agent knows you're filtering the previous result

**New Request** (starting fresh):

- "show me all actions" → "now check inventory for lettuce"
- The agent understands this is a completely new inquiry

#### Context Signals

**Continuation phrases** (refining):

- "only show", "just the", "narrow it down"
- "what about", "also show", "include"
- "except", "without", "not"
- Pronouns: "those", "these", "them", "it"

**New request phrases**:

- "now", "next", "instead", "switch to"
- New ingredient/topic mentioned
- "check", "analyze" with new subject

### 3. **Smart Queue Filtering**

When you refine results, the agent:

- **Accumulates filters** unless you say "only" or "just"
- **Shows narrowing context**: "Narrowed from 10 to 3 actions"
- **Maintains filter state** across conversation turns

Examples:

```
User: "show me all actions"
Agent: Loaded 15 actions into the queue.

User: "only kitchen tasks"
Agent: Narrowed from 15 to 6 actions. Filters: owner=Kitchen

User: "high risk only"
Agent: Narrowed from 6 to 2 actions. Filters: owner=Kitchen, risk_level=high
```

### 4. **Execution with Callbacks**

The agent provides detailed feedback after executing actions:

```
User: "execute high risk actions"
Agent:
  ✅ Executed 3/3 actions successfully
  📦 Affected: Chicken Breast, Lettuce, Tomatoes

  Execution Results:
  ✅ a1b2c3d4  Chicken Breast  executed
  ✅ e5f6g7h8  Lettuce         executed
  ✅ i9j0k1l2  Tomatoes        executed
```

### 5. **Pronoun Understanding**

The agent understands contextual pronouns:

```
User: "show kitchen tasks"
Agent: Showing 5 kitchen tasks.

User: "execute those"
Agent: Executing 5 actions (owner=Kitchen)... ✅ Done!
```

### 6. **Suggested Next Steps**

After each operation, the agent suggests what you can do next:

```
After VIEW:
  🎯 Try: "execute high risk actions"
  🔍 Or: "show only kitchen tasks"

After FILTER:
  ⚡ Try: "execute those"
  🔍 Or: "only show high risk"

After EXECUTE:
  ✅ Check the Action Queue below for updated status
```

## How It Works

### Conversation Flow

1. **User sends a message**
2. **Agent analyzes**:
   - Reviews conversation history
   - Determines if it's a refinement or new request
   - Identifies intent (VIEW, FILTER, ADD, etc.)
3. **Agent calls tools**:
   - `get_action_queue` — Fetch current actions
   - `query_actions` — Filter with specific criteria
   - `execute_action` — Trigger execution
   - `bulk_action` — Execute multiple actions
   - And many more...
4. **Agent responds**:
   - Shows what changed in the queue
   - Provides execution results
   - Suggests next actions

### Action Queue Display

The action queue shows **only the results relevant to your query**:

- After "show all actions" → All actions visible
- After "only kitchen tasks" → Only Kitchen owner actions
- After "execute high risk" → Queue updates with new status

### Session Management

- Each browser session has a unique ID
- Click "New Session" to restart with fresh context
- Previous conversations are cleared but actions remain

## Best Practices

### ✅ Do This

- **Be conversational**: "show me what needs attention"
- **Use refinements**: "show all" → "only high risk" → "execute those"
- **Reference context**: "execute those", "approve them"
- **Ask for specifics**: "what POs are pending for chicken?"

### ❌ Avoid This

- Don't mix refinement with new topics in one message
- Don't expect the agent to remember across sessions
- Don't use vague pronouns without context

### Example Workflows

#### Workflow 1: Triage and Execute

```
1. "show me all actions"
2. "only high risk ones"
3. "execute those"
4. "what's left?"
```

#### Workflow 2: Create and Verify

```
1. "check inventory"
2. "draft a PO for chicken breast"
3. "show me what I created"
4. "approve action abc123"
5. "execute it"
```

#### Workflow 3: Filter and Review

```
1. "show all actions"
2. "only kitchen tasks"
3. "what about purchasing?"
4. "show everything again"
```

## Technical Details

### Tool Functions Available

- `check_inventory` — Look up stock levels
- `get_alerts` — Retrieve ML risk alerts
- `get_historical_data` — Pull usage/waste data
- `draft_purchase_order` — Create draft PO
- `create_kitchen_task` — Assign task
- `adjust_par_level` — Change par levels
- `analyze_trend` — Analyze usage patterns
- `get_action_queue` — View all actions
- `query_actions` — Filter actions
- `execute_action` — Execute one action
- `approve_action` — Approve one action
- `reject_action` — Reject one action
- `rollback_action` — Undo executed action
- `bulk_action` — Execute/approve/reject multiple
- `generate_action_plan` — Auto-create actions from alerts

### Response Structure

Every agent response includes:

```json
{
  "intent": "FILTER",
  "queue_operation": "NONE",
  "filters_applied": {
    "owner": "Kitchen",
    "risk_level": "high"
  },
  "actions_queue": [...],
  "executions_triggered": ["a1b2c3d4", "e5f6g7h8"],
  "execution_details": [
    {
      "action_id": "a1b2c3d4",
      "operation": "execute",
      "ingredient": "Chicken Breast",
      "status": "executed",
      "success": true
    }
  ],
  "notes": "Narrowed from 10 to 2 high risk kitchen actions."
}
```

## Troubleshooting

### Agent not understanding refinements?

- Make sure you're in the same session
- Use clearer continuation phrases: "only show", "just the"
- Check if "New Session" was clicked recently

### Queue not updating?

- Scroll down to the "Action Queue" section
- The conversation shows summaries; the queue shows full details
- Use "show all actions" to refresh

### Execution not working?

- Some actions require approval first
- High-risk actions may need human approval
- Check the execution results in the conversation for errors

## Advanced Usage

### Bulk Operations

```
"execute all kitchen tasks"
"approve all POs"
"reject all low priority actions"
```

### Complex Filtering

```
"show actions for chicken from purchasing"
"high risk stockout alerts only"
"pending POs that haven't been approved"
```

### Auto-Planning

```
"generate action plan"
→ Creates actions from all active ML alerts

"reset the queue"
→ Clears and regenerates from scratch
```

---

**Note**: The agent is designed to be conversational and context-aware. Don't overthink it — just ask naturally and let the AI figure out what you need!
