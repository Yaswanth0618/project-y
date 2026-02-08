# Agent Copilot — Quick Reference Guide

## 🚀 Quick Start

Type these phrases to interact with the agent:

### View & Query
- "show me all actions"
- "what's in the queue?"
- "what needs attention?"
- "give me a status report"

### Filter & Refine
- "only kitchen tasks"
- "high risk only"
- "actions for chicken breast"
- "just show proposed ones"

### Execute & Manage
- "execute high risk actions"
- "execute those"
- "do it"
- "run action abc123"

### Approve & Reject
- "approve action abc123"
- "reject all surplus actions"
- "cancel those"

### Create Actions
- "order 50 units of chicken"
- "draft a PO for lettuce"
- "create a kitchen task for inventory check"

### Reset & Refresh
- "start over"
- "reset the queue"
- "generate action plan"

## 💡 Pro Tips

### 1. Chain Refinements
```
You: "show all actions"
Agent: [Shows 15 actions]

You: "only kitchen tasks"
Agent: [Narrows to 6 actions]

You: "high risk only"
Agent: [Narrows to 2 actions]

You: "execute those"
Agent: [Executes the 2 filtered actions]
```

### 2. Use Pronouns
After filtering, you can say:
- "execute those"
- "approve them"
- "show me details about it"

### 3. Get Context-Aware Help
The agent remembers what you just asked and adjusts responses accordingly.

## 📊 Understanding the Display

### Conversation Area
- Shows your messages
- Shows agent's thinking process (tool calls)
- Shows execution results
- Provides suggestions for next steps

### Action Queue Section (Below)
- Shows the **filtered/relevant** actions based on your query
- Updates automatically after operations
- Click rows for details
- Use filters to narrow further

### Agent Stats (Top)
- **Tool Calls**: How many tools the agent used
- **Actions Created**: New actions proposed
- **Turns**: Conversation back-and-forth count
- **Active Alerts**: Current risk alerts

## 🎯 Intent Types

| Intent | What It Means | Example |
|--------|---------------|---------|
| **VIEW** | Show all actions | "show me everything" |
| **FILTER** | Narrow results | "only kitchen tasks" |
| **ADD** | Create new actions | "order chicken" |
| **MODIFY** | Change status | "approve action abc" |
| **EXECUTE** | Run actions | "execute those" |
| **REMOVE** | Reject actions | "cancel surplus tasks" |
| **RESET** | Regenerate queue | "start over" |

## 🔍 Filter Options

### By Owner
- Kitchen
- Purchasing  
- VendorOps

### By Status
- Proposed (pending)
- Approved (ready)
- Executed (done)
- Rejected (cancelled)

### By Risk Level
- Low
- Medium
- High
- Critical

### By Action Type
- Draft PO (Purchase Order)
- Kitchen Task
- Par Adjustment
- ETA Update

### By Ingredient
- Any ingredient name (e.g., "chicken", "lettuce")

## ⚡ Keyboard Shortcuts

- **Enter**: Send message
- **Shift+Enter**: New line in message

## 🛠️ Common Workflows

### Daily Triage
```
1. "what needs attention?"
2. "show high risk actions"
3. "execute those"
```

### Ordering Workflow
```
1. "check inventory"
2. "draft PO for low stock items"
3. "show me the POs"
4. "approve all POs"
5. "execute approved POs"
```

### Kitchen Management
```
1. "show kitchen tasks"
2. "what about high priority ones?"
3. "create a task for chicken rotation"
4. "execute all task assignments"
```

### Cleanup
```
1. "show rejected actions"
2. "show old proposed actions"
3. "reject outdated ones"
```

## ❓ Troubleshooting

**Q: Agent doesn't understand my refinement?**
A: Use clear continuation words: "only", "just", "also show"

**Q: Queue not showing my filter?**
A: Scroll down — the conversation shows summaries, queue shows details

**Q: Execution failed?**
A: Check if action needs approval first. High-risk items require human sign-off.

**Q: Lost conversation context?**
A: Click "New Session" to start fresh if things get confusing

**Q: Want to see all actions again?**
A: Say "show all actions" or "reset filters"

## 📝 Example Conversations

### Example 1: Complete Workflow
```
You: show me all actions
Agent: Loaded 12 actions. [Shows queue]

You: only high risk
Agent: Narrowed from 12 to 4. [Updates queue]

You: what ingredients?
Agent: High risk items: Chicken Breast, Lettuce, Tomatoes, Milk

You: execute the chicken and lettuce ones
Agent: Looking for actions with those ingredients... Found 2. Executing...
      ✅ Executed 2/2 successfully

You: what's left?
Agent: 2 high risk actions remain (Tomatoes, Milk)
```

### Example 2: Creating Actions
```
You: check inventory for lettuce
Agent: Lettuce: 15 units on hand, 3.5 days of supply, stockout risk in 4 days

You: draft a PO for 100 units
Agent: Draft PO created! Order 100 units of Lettuce. Action ID: a1b2c3d4

You: approve it
Agent: Action a1b2c3d4 approved. Ready to execute.

You: execute it
Agent: ✅ Executed! PO sent to purchasing department.
```

### Example 3: Bulk Operations
```
You: show all proposed actions
Agent: 8 proposed actions loaded.

You: execute all low risk ones
Agent: Found 3 low risk proposed actions. Executing...
      ✅ 3/3 executed successfully

You: what's left?
Agent: 5 proposed actions remain (3 medium risk, 2 high risk)
```

---

**Remember**: The agent is smart and conversational. Just ask naturally, and it will figure out what you need!
