
import React, { useState, useEffect } from 'react';

interface WebhookConfigProps {
  url: string;
  onUpdate: (url: string) => void;
  recentPayloads: any[];
}

const WebhookConfig: React.FC<WebhookConfigProps> = ({ url, onUpdate, recentPayloads }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(url);

  const handleSave = () => {
    // Ensure URL has a protocol
    let formattedUrl = inputValue;
    if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }
    onUpdate(formattedUrl);
    setIsOpen(false);
  };

  return (
    <div className="fixed top-4 right-4 z-40">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center space-x-2 p-2 bg-zinc-800/80 hover:bg-zinc-700 backdrop-blur-md text-zinc-400 hover:text-white rounded-lg transition-all border border-white/10 shadow-xl"
        title="Streaming Endpoint Settings"
      >
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12l4-4m-4 4l4 4" />
          </svg>
          {url && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
          )}
        </div>
        <span className="text-xs font-mono hidden md:block">Broadcast Settings</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center">
              <span className="w-2 h-2 bg-lime-500 rounded-full mr-2"></span>
              Stream Exposure Point
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono">ENDPOINT: /transcription</span>
          </div>

          <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
            Data is exposed via POST requests to your receiver. The path <code className="text-lime-500">/transcription</code> will be targeted.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">Receiver Host URL</label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="https://api.yourserver.com"
                className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-sm text-lime-100 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-lime-500/50 transition-all font-mono"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button 
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Close
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 text-xs bg-lime-500 text-black font-extrabold rounded-md hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/20"
              >
                Apply Endpoint
              </button>
            </div>

            {recentPayloads.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2 block">Live Exposure Feed</label>
                <div className="bg-black/50 rounded-lg p-2 h-32 overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar">
                  {recentPayloads.map((p, i) => (
                    <div key={i} className="text-zinc-400 border-l border-zinc-800 pl-2 mb-1 animate-in slide-in-from-left-1">
                      <span className="text-lime-500">POST</span> /transcription <br/>
                      <span className="text-zinc-600">{"{"}</span> text: "{p.text.substring(0, 30)}..." <span className="text-zinc-600">{"}"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhookConfig;
