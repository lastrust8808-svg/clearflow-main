import React, { useState, useEffect, useRef } from 'react';
import { geminiService } from '../../services/gemini.service';

interface GovernanceQaProps {
  onBack: () => void;
}

interface ChatMessage {
  isUser: boolean;
  text: string;
}

export const GovernanceQa: React.FC<GovernanceQaProps> = ({ onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const userQuestion = question.trim();
    if (!userQuestion || isLoading) return;

    setMessages(m => [...m, { isUser: true, text: userQuestion }]);
    setQuestion('');
    setIsLoading(true);
    setError(null);

    try {
      const answer = await geminiService.queryDocuments(userQuestion);
      setMessages(m => [...m, { isUser: false, text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-slate-800/50 p-6 sm:p-8 rounded-lg border border-slate-700">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-3xl font-semibold mb-1 text-white">Governance Q&A</h2>
            <p className="text-slate-400">Ask questions about company policies and agreements.</p>
          </div>
          <button onClick={onBack} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md">Back to Dashboard</button>
        </div>
        <div className="h-[60vh] flex flex-col">
          <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 bg-slate-900/50 rounded-t-lg border border-b-0 border-slate-700">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-500">Ask a question about company policies to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xl p-3 rounded-lg ${msg.isUser ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                   <div className="flex justify-start">
                      <div className="max-w-lg p-3 rounded-lg bg-slate-700 text-slate-200">
                        <p className="text-sm">Thinking...</p>
                      </div>
                   </div>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-slate-600 p-4 bg-slate-800/50 rounded-b-lg">
            {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
            <form onSubmit={askQuestion} className="flex gap-4">
              <input value={question} onChange={e => setQuestion(e.target.value)} type="text" className="flex-grow bg-slate-900 border border-slate-700 rounded-md p-2.5" placeholder="Type your question here..." disabled={isLoading} />
              <button type="submit" disabled={isLoading || !question.trim()} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-slate-500">Ask</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
