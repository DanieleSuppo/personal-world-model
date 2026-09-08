# Candidate AI Adapter Capability Baseline

**Issue:** [#3](https://github.com/DanieleSuppo/personal-world-model/issues/3)  
**Researched:** 2026-09-08  
**Scope:** Public, first-party documentation for the consumer products ChatGPT, Claude, and Gemini Apps, and their documented developer integration surfaces. This is a capability baseline, not a product or architecture decision.

## Reading the Results

- **Verified** means the cited first-party documentation explicitly describes the mechanism or restriction.
- **Unknown** means this review did not find first-party documentation that verifies the capability. It is not a claim that the capability is impossible or unavailable under a private, enterprise, preview, or future agreement.
- A vendor's API conversation state is distinct from that vendor's consumer-chat history. The former is state created by an API caller; it is not evidence of access to the user's existing ChatGPT, Claude, or Gemini Apps conversations.

## Capability Matrix

| Capability | ChatGPT / OpenAI | Claude / Anthropic | Gemini / Google |
| --- | --- | --- | --- |
| Historical consumer-chat access | **Verified: user export.** Eligible personal ChatGPT accounts can request an export through settings or the Privacy Portal; the ZIP includes chat history. Business, Enterprise, and Healthcare workspaces do not have self-service export. [O1] | **Verified: user export.** Claude provides a user data-export route in account management. The reviewed documentation does not state an integration API or export schema. [A1] | **Verified: user export.** Google Takeout lets a signed-in user create an archive of selected Google-product data; Gemini Apps directs users to Takeout to export information. The reviewed documentation does not identify the Gemini archive schema. [G1] [G2] |
| Programmatic read of an existing consumer-chat history | **Unknown.** No reviewed OpenAI document describes a third-party API or OAuth scope for reading a user's pre-existing ChatGPT chats. The documented Conversations API stores API-created items. [O2] | **Unknown.** No reviewed Anthropic document describes a third-party API or OAuth scope for reading a user's existing Claude.ai chats. The Messages API is a stateless request API whose caller supplies prior messages. [A2] | **Unknown.** No reviewed Google document describes a third-party API or OAuth scope for reading a user's existing Gemini Apps chats. Gemini Apps Activity is user-manageable, and export is directed through Takeout. [G2] |
| Live interaction context | **Verified for API-owned sessions.** Responses can carry prior input explicitly or use an API Conversation / previous response ID. That state belongs to the API integration. **Verified for ChatGPT tools.** ChatGPT can invoke an MCP server during a tool interaction. [O2] [O3] | **Verified for API-owned sessions.** Messages accepts the caller's structured prior turns; the API is described as stateless for multi-turn conversations. **Verified for tools.** Claude returns a `tool_use` block for application-run tools. [A2] [A3] | **Verified for Gemini Apps connected-app use.** Google says Gemini Apps may exchange chat, device/preference, location, and connected-app data to complete a task. **Unknown for a generic third-party live-transcript callback.** [G2] |
| Raw transcript, faithful excerpt, or consumer-generated summary as a source input | **Verified for API-owned interactions.** The caller can submit full prior `user` and `assistant` messages, so it can choose to send raw turns or selected excerpts. **Unknown** whether ChatGPT exposes its own transcript to an arbitrary third-party connector. Consumer-generated summaries are ordinary tool input, not a separately documented provenance class. [O2] [O4] | **Verified for API-owned interactions.** The caller supplies `messages`, including alternating user and assistant turns; it can therefore send raw turns or selected excerpts. **Unknown** whether Claude.ai exposes its own transcript to an arbitrary third-party connector. Consumer-generated summaries are ordinary tool input, not a separately documented provenance class. [A2] [A3] | **Verified for consumer data categories.** Gemini Apps retains prompts, generated content including chat summaries, and Live transcripts as product data. **Unknown** whether a third-party connector receives raw turns, excerpts, or summaries from Gemini Apps. [G2] |
| OAuth / explicit user approval | **Verified for ChatGPT MCP.** Authenticated MCP servers use OAuth 2.1 authorization-code flow with PKCE; ChatGPT launches the flow when the user first invokes the protected tool, authenticates, and consents to requested scopes. [O3] | **Verified, integration-managed.** The Claude API MCP connector accepts an OAuth bearer token, but the API consumer must obtain and refresh it before the API request. It does not perform the end-user OAuth flow. [A4] | **Verified at product level.** Gemini Apps lets the user connect and disconnect Connected Apps, and Gemini Apps processes data from connected third-party MCP server tools. **Unknown** whether every connection uses OAuth or which OAuth scopes Gemini Apps supports for a generic third-party integration. [G2] |
| Background access | **Unknown for consumer-chat history.** The documented ChatGPT history path is a user-requested export. The documented tool/OAuth flow is initiated when a user invokes a tool. [O1] [O3] | **Unknown for consumer-chat history.** The reviewed Claude export is a user account action; Messages and MCP documentation describes per-request calls, not an ongoing consumer-history feed. [A1] [A2] [A4] | **Unknown for consumer-chat history.** Gemini Apps points to export and user-managed Connected Apps. Google Takeout can create scheduled archives every two months for one year, but the documentation does not establish that Gemini Apps data is eligible for that schedule. [G1] [G2] |
| Write operations to the adapter's external service | **Verified.** OpenAI function calling lets the integration execute application-side actions, and the Apps SDK explicitly permits authenticated MCP servers to expose user-specific data and write actions. ChatGPT's OAuth guide illustrates a `create_doc` tool with `docs.write`. [O3] [O4] | **Verified.** Client tools run in the API consumer's application; the consumer executes the operation after Claude returns `tool_use`. The API MCP connector can enable or disable individual remote-server tools, including write/destructive tools. [A3] [A4] | **Verified at product level; exact protocol unknown.** Google says Gemini Apps can use Connected Apps to help complete tasks and can share necessary data with others on the user's behalf. It warns that task features can make purchases or share data. This verifies that writes may occur through product features, not a generic third-party write API or consent model. [G2] |

## Provider Notes and Restrictions

### ChatGPT / OpenAI

- ChatGPT account export is a user-operated bootstrap path, not a documented synchronization API. An export can take up to seven days, the download link expires after 24 hours, and deleted chats cannot be restored by an export. Workspace policy also restricts self-service export for Business, Enterprise, and Healthcare. [O1]
- OpenAI's API state mechanisms are explicitly separate API resources: Responses are independently created, and Conversations persist API messages, tool calls, and tool outputs. They cannot be treated as access to a user's ChatGPT account history without separate evidence. [O2]
- A ChatGPT consumer integration can call an MCP adapter while a conversation is active. For protected actions or user-specific data, the adapter is responsible for OAuth metadata, token validation, scopes, and authorization. ChatGPT does not support machine-to-machine grants, service accounts, or customer-provided API keys for this flow. [O3]
- Function calling returns an action request to the host application; the host executes it and returns a result. A tool call is therefore not proof that OpenAI itself performed the write or independently approved its side effect. [O4]

### Claude / Anthropic

- Claude's documented export route is account-level. The reviewed Help Center page establishes that users can export data but does not document an external import/synchronization endpoint or a stable export format. [A1]
- The Messages API requires the caller to supply the conversation turns and is documented as usable for stateless multi-turn conversations. It therefore supports passing raw text or excerpts that the caller already possesses, but does not establish access to Claude.ai history. [A2]
- With client tools, Claude emits structured tool requests and the application executes them. With the beta MCP connector, only tool calls are supported; the remote server must be public HTTP, and the API consumer supplies any OAuth bearer token. [A3] [A4]
- The MCP connector is beta and is not eligible for Anthropic's zero-data-retention arrangement; data exchanged with MCP servers is retained under Anthropic's standard retention policy. [A4]

### Gemini / Google

- Gemini Apps' privacy documentation identifies prompts, generated content (including chat summaries), and Live transcripts as product data. It also says that users can review/delete activity and export information through Google Takeout. [G2]
- Google Takeout is user-account controlled. Its general documentation notes that archives can omit changes made between request and creation, may be delayed, and can be user-selected by product. This is a bootstrap/export mechanism, not evidence of an app-to-app history API. [G1]
- Gemini Apps can work with Google and third-party Connected Apps, including third-party MCP server tools. The user can manage those connections. Google documents potentially consequential actions and instructs users to supervise tasks closely, so any write capability must be treated as user-facing and connector-specific. [G2]

## Cross-Provider Baseline

The following capability classes are supported by verified evidence without assuming a provider-specific consumer-history API:

| Capability class | Verified basis |
| --- | --- |
| User-mediated historical bootstrap | All three vendors document an account/user export path. Formats, entitlement, timing, and workspace restrictions differ. [O1] [A1] [G1] [G2] |
| Request-scoped live signal supplied by an integration | OpenAI and Anthropic document application/API-owned conversation state and tool calls. Gemini Apps documents exchange of Gemini and Connected App data for a task, but not a generic transcript callback. [O2] [O4] [A2] [A3] [G2] |
| Explicit adapter-supplied payloads with declared fidelity | API-owned integrations can supply raw turns or selected excerpts; summary payloads can also be supplied as ordinary tool/context input. The vendor docs do not certify the fidelity or provenance of a summary. [O2] [A2] |
| User-authorized, scoped access to an external adapter | ChatGPT supports OAuth 2.1 and scopes for MCP. Anthropic's API connector accepts a token obtained by the API consumer. Gemini Apps supports user-managed Connected Apps, while generic OAuth details remain unknown. [O3] [A4] [G2] |
| Adapter-owned write execution | OpenAI and Anthropic tools request actions that the application or MCP server executes. Gemini Apps documents task completion through connected services but does not document a generic third-party write contract. [O3] [O4] [A3] [A4] [G2] |

No capability above establishes continuous, provider-authorized background access to a user's existing consumer-chat history. That remains **unknown** for each provider from the reviewed primary documentation.

## Open Questions

- Whether the three consumer products offer documented, stable programmatic endpoints for a user to grant read access to their own chat history.
- Export file structures, fidelity, and retention semantics for Claude and Gemini Apps, and whether Google Takeout's scheduled archive option applies to Gemini Apps data.
- Whether ChatGPT or Claude consumer surfaces can supply full active-chat turns to a custom external connector, rather than only invoking tools with model-selected arguments.
- Gemini's public OAuth/scoping and write-confirmation model for a generic third-party MCP or Connected App.
- Availability, administrative policy, regional, plan, and enterprise restrictions beyond those expressly cited above.

## Sources

- **[O1] OpenAI Help Center, "Exporting your ChatGPT history and data"**: https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data
- **[O2] OpenAI API documentation, "Conversation state"**: https://developers.openai.com/api/docs/guides/conversation-state
- **[O3] OpenAI Apps SDK documentation, "Authentication"**: https://developers.openai.com/apps-sdk/build/auth/
- **[O4] OpenAI API documentation, "Function calling"**: https://developers.openai.com/api/docs/guides/function-calling
- **[A1] Anthropic Help Center, "Export your Claude data"**: https://support.claude.com/en/articles/9450526-export-your-claude-data
- **[A2] Anthropic API reference, "Messages"**: https://platform.claude.com/docs/en/api/messages
- **[A3] Anthropic documentation, "Tool use with Claude"**: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- **[A4] Anthropic documentation, "MCP connector"**: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- **[G1] Google Account Help, "How to download your Google data"**: https://support.google.com/accounts/answer/3024190
- **[G2] Google Gemini Apps Help, "Gemini Apps Privacy Hub"**: https://support.google.com/gemini/answer/13594961
