/**
 * Logs interview conversation turns to conversation.log for seamless debugging.
 * Overwrites on new interview sessions and appends every conversational turn.
 */

export async function initConversationLog(candidateName: string, role: string): Promise<void> {
  try {
    if ((window as any).electronAPI?.initConversationLog) {
      await (window as any).electronAPI.initConversationLog(candidateName, role);
      return;
    }

    await fetch('/api/log/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateName, role }),
    });
  } catch (err) {
    console.warn('Failed to initialize conversation log:', err);
  }
}

export async function appendConversationLog(speaker: string, text: string): Promise<void> {
  try {
    if (!text || !text.trim()) return;

    if ((window as any).electronAPI?.logConversationTurn) {
      await (window as any).electronAPI.logConversationTurn(speaker, text.trim());
      return;
    }

    await fetch('/api/log/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker, text: text.trim() }),
    });
  } catch (err) {
    console.warn('Failed to append to conversation log:', err);
  }
}
