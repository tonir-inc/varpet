"""Text-only conversation protocol; no tools, geometry or design knowledge here."""
import json

CONVERSATION_RULES = """
Conversation comes before changes. For a pure question, make zero tool calls: answer directly
from the thread's memory, supplied scene and general design knowledge. This includes 'why did you
do it this way?', 'why is that minimalistic?', materials, style, costs and how the process works.
Explain the actual earlier proposal, not an invented rationale or unmeasured benefit. Distinguish
the proposal from the current scene: a proposal is not applied merely because it was discussed.
Say when a price or measurement is unknown; do not run tools to invent certainty for an explanation.
An advice question such as 'where should my desk go?' asks for advice, not permission to move it.
Offer a concrete next change when useful; use change tools only when the customer asks for or
accepts that change. A short acceptance refers to the concrete offer in this thread.
Discuss anything around the home and design process conversationally, including topics the editor
cannot modify. Only an actual out-of-scope action refusal uses the prefix DECLINE: followed by a
brief explanation and supported alternative. Ordinary answers are never refusals.
Write a warm, direct answer in light Markdown (paragraphs, **bold**, emphasis, short lists).
Do not output JSON for ordinary answers. If tailored follow-up suggestions are useful, you may
instead return {"type":"message","message":"Markdown answer","suggestions":["short follow-up"]}
with at most four suggestions. Never output raw tool payloads or internal reasoning.
These conversation rules override instructions to always call tools or always end with propose.
"""


def conversational_reply(response):
    response = response.strip()
    if response.startswith('DECLINE:'):
        result = {'type': 'decline', 'message': response[len('DECLINE:'):].strip()}
    elif response.startswith('{'):
        result = json.loads(response)
        if not isinstance(result, dict) or result.get('type') not in ('message', 'decline'):
            raise ValueError('Invalid conversational reply')
        allowed = {'type', 'message', 'suggestions'} if result['type'] == 'message' else {'type', 'message'}
        if set(result) - allowed:
            raise ValueError('Unsupported conversational reply fields')
    else:
        result = {'type': 'message', 'message': response}
    if not isinstance(result.get('message'), str) or not result['message'].strip() or len(result['message']) > 4000:
        raise ValueError('Designer message must contain 1–4000 characters')
    if 'suggestions' in result:
        choices = result['suggestions']
        if (not isinstance(choices, list) or len(choices) > 4 or
                any(not isinstance(choice, str) or not choice.strip() or len(choice) > 300 for choice in choices)):
            raise ValueError('Invalid suggestions: use at most four nonempty strings of up to 300 characters')
    return result


class ConversationStream:
    """Forward only customer-facing final text; never reasoning, JSON or tool output."""
    def __init__(self, emit):
        self.emit = emit
        self.final_id = None
        self.text = ''
        self.sent = 0
        self.tool_calls = 0

    def observe(self, event):
        method, payload = event.get('method'), event.get('payload', {})
        item = payload.get('item', {})
        if method == 'item/started':
            if item.get('type') == 'mcpToolCall':
                self.tool_calls += 1
                labels = {'set_intent': 'Understanding the change you want', 'scene_summary': 'Reading your room',
                          'search_catalog': 'Looking for suitable furniture', 'place': 'Trying furniture positions',
                          'check_layout': 'Checking clearances', 'score_layout': 'Comparing the layout',
                          'sun': 'Checking daylight', 'propose': 'Checking your proposed change', 'ask': 'Preparing a question'}
                self.emit(labels.get(item.get('tool'), 'Checking your design'))
            if item.get('type') == 'agentMessage' and item.get('phase') == 'final_answer':
                self.final_id = item.get('id')
                self.emit('Writing your answer')
        if method == 'item/agentMessage/delta' and self.final_id and payload.get('itemId') == self.final_id and not self.tool_calls:
            delta = payload.get('delta')
            if not isinstance(delta, str):
                return
            self.text += delta
            # Buffer the prefix so JSON and explicit refusal markers never flash in chat.
            if len(self.text) < 8 or self.text.lstrip().startswith(('{', 'DECLINE:')):
                return
            if len(self.text) > 4000:
                return
            self.emit({'type': 'message_delta', 'delta': self.text[self.sent:]})
            self.sent = len(self.text)
