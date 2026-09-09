import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bot, 
  Sparkles, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Package,
  Boxes,
  Zap,
  CheckCircle2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  actionTag?: string;
  time: string;
}

export const AiCopilotWidget: React.FC = () => {
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'ai',
      text: 'Hello! I am your AI ERP Assistant. How can I assist you with stock, purchase batches, items, or warehouse actions today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isThinking]);

  // Setup Web Speech Recognition API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (err: any) => {
        console.error('Speech recognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Text-To-Speech Handler
  const speakText = (text: string) => {
    if (isMuted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Text-to-speech error:', e);
    }
  };

  // Toggle Voice Listening
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition is not supported in this browser. Please use Google Chrome or Safari.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  // Toggle Modal Popup with Animation
  const handleToggleOpen = () => {
    if (isOpen) {
      setIsClosing(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
      }, 210);
    } else {
      setIsOpen(true);
      setIsClosing(false);
    }
  };

  // Process Natural Language Commands & Execute System Actions
  const processAICommand = (userInput: string) => {
    const text = userInput.toLowerCase().trim();
    let reply = '';
    let actionTag: string | undefined = undefined;

    // 1. STOCK ALERTS
    if (text.includes('alert') || text.includes('low stock') || text.includes('out of stock') || text.includes('reorder')) {
      reply = 'Navigating to Stock Alerts! I am taking you to the low stock and reorder requirements list.';
      actionTag = '⚡ Executing: Navigating to Stock Alerts';
      navigate('/stock-inventory');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-alerts' } }));
      }, 150);
    }
    // 2. PURCHASE BATCH
    else if (text.includes('purchase batch') || text.includes('new batch') || text.includes('record batch') || text.includes('add batch')) {
      reply = 'Opening the New Purchase Batch form for you right away!';
      actionTag = '⚡ Executing: Opening New Purchase Batch Window';
      navigate('/stock-inventory');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-purchase-batch' } }));
      }, 250);
    }
    // 3. ITEM MASTER / ADD SKU
    else if (text.includes('item master') || text.includes('sku') || text.includes('add item') || text.includes('new item') || text.includes('add sku')) {
      if (text.includes('add') || text.includes('new') || text.includes('create')) {
        reply = 'Opening the Add SKU / Item drawer in Item Master.';
        actionTag = '⚡ Executing: Opening Add SKU Drawer';
        navigate('/inventory-v2/skus');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-sku' } }));
        }, 250);
      } else {
        reply = 'Navigating to Item Master.';
        actionTag = '⚡ Executing: Navigating to Item Master';
        navigate('/inventory-v2/skus');
      }
    }
    // 4. WAREHOUSE SETUP / LOCATIONS
    else if (text.includes('warehouse') || text.includes('location') || text.includes('storage') || text.includes('bin') || text.includes('zone')) {
      reply = 'Navigating to Warehouse Hierarchy & Storage Locations.';
      actionTag = '⚡ Executing: Opening Warehouse Setup';
      navigate('/stock-inventory');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-warehouse' } }));
      }, 150);
    }
    // 5. BUSINESS DIRECTORY / VENDORS / CUSTOMERS
    else if (text.includes('vendor') || text.includes('supplier') || text.includes('customer') || text.includes('directory') || text.includes('party')) {
      reply = 'Opening Business Directory & Party Management.';
      actionTag = '⚡ Executing: Navigating to Business Directory';
      navigate('/party/vendors');
    }
    // 6. SALES ORDERS & QUOTES
    else if (text.includes('quote') || text.includes('sales quote')) {
      reply = 'Navigating to Sales Quotations.';
      actionTag = '⚡ Executing: Navigating to Sales Quotes';
      navigate('/sales/quotes');
    } else if (text.includes('order') || text.includes('sales order')) {
      reply = 'Navigating to Sales Orders.';
      actionTag = '⚡ Executing: Navigating to Sales Orders';
      navigate('/sales/orders');
    }
    // 7. INVENTORY LEDGER / BATCH STOCK
    else if (text.includes('ledger') || text.includes('history')) {
      reply = 'Navigating to Inventory Stock Ledger.';
      actionTag = '⚡ Executing: Navigating to Stock Ledger';
      navigate('/inventory-v2/ledger');
    }
    // 8. GENERAL AI ASSISTANT CONVERSATION
    else {
      if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
        reply = 'Hello! I am ready to help you navigate, check stock, or create purchase batches. What would you like to do?';
      } else if (text.includes('who are you') || text.includes('what can you do')) {
        reply = 'I am your intelligent ERP Assistant. You can ask me to open Stock Alerts, create Purchase Batches, view Item Master, check Warehouse locations, or search parties by voice or text!';
      } else {
        reply = `I have received your request regarding "${userInput}". I am ready to assist you across Stock Inventory, Item Master, and Purchase Batches.`;
      }
    }

    return { reply, actionTag };
  };

  // Send Message Handler
  const handleSendMessage = (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    setTimeout(() => {
      const { reply, actionTag } = processAICommand(messageText);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        actionTag,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiMsg]);
      setIsThinking(false);
      speakText(reply);
    }, 450);
  };

  return (
    <>
      {/* 1. FLOATING BOTTOM-RIGHT AI TRIGGER BUTTON (FAB) */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleToggleOpen}
          className="fixed bottom-6 right-6 z-[90] p-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-full shadow-2xl shadow-blue-500/40 ring-4 ring-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group cursor-pointer"
          title="Open AI Assistant"
        >
          <div className="relative">
            <Bot className="w-6 h-6 animate-bounce" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-blue-600"></span>
          </div>
          <span className="text-xs font-black tracking-wide pr-1 hidden sm:inline-block">AI Assistant</span>
          <Sparkles className="w-4 h-4 text-blue-200 group-hover:rotate-12 transition-transform" />
        </button>
      )}

      {/* 2. POPUP WINDOW */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] z-[95] bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col ${
            isClosing ? 'animate-aiClose' : 'animate-aiOpen'
          }`}
        >
          {/* POPUP HEADER */}
          <div className="shrink-0 px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between z-10 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white tracking-wide">AI ERP Copilot</h3>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Online
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-400 font-medium">Voice & System Automation</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ${
                  isMuted ? 'text-rose-400' : ''
                }`}
                title={isMuted ? 'Unmute Audio Voice' : 'Mute Audio Voice'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleToggleOpen}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Close AI Assistant"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* QUICK SUGGESTIONS CAROUSEL */}
          <div className="shrink-0 bg-slate-50 px-3 py-2 border-b border-slate-200/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
            <button
              type="button"
              onClick={() => handleSendMessage('Show stock alerts')}
              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap shadow-2xs transition-all cursor-pointer shrink-0"
            >
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span>⚠️ Stock Alerts</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('Create new purchase batch')}
              className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap shadow-2xs transition-all cursor-pointer shrink-0"
            >
              <Package className="w-3 h-3 text-blue-600" />
              <span>📦 New Batch</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('Go to item master')}
              className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap shadow-2xs transition-all cursor-pointer shrink-0"
            >
              <Boxes className="w-3 h-3 text-purple-600" />
              <span>📄 Item Master</span>
            </button>
          </div>

          {/* CHAT MESSAGES CONTAINER */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 text-xs">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs font-medium'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs leading-relaxed font-normal'
                  }`}
                >
                  {msg.actionTag && (
                    <div className="mb-1.5 pb-1 border-b border-blue-100 flex items-center gap-1.5 text-[10.5px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      <Zap className="w-3 h-3 fill-blue-600 text-blue-600" />
                      <span>{msg.actionTag}</span>
                    </div>
                  )}
                  <p>{msg.text}</p>
                </div>
                <span className="text-[9.5px] font-bold text-slate-400 mt-1 px-1">{msg.time}</span>
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-2 text-slate-500 bg-white p-3 rounded-2xl border border-slate-200/70 max-w-[70%] animate-pulse">
                <Bot className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold">AI is thinking...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* VOICE LISTENING ANIMATION INDICATOR */}
          {isListening && (
            <div className="shrink-0 bg-blue-50 px-4 py-2 border-t border-blue-100 flex items-center justify-between text-xs text-blue-700 font-bold animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                <span>Listening to your voice... Speak now</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1 h-3 bg-blue-600 rounded-full animate-bounce"></span>
                <span className="w-1 h-4 bg-indigo-600 rounded-full animate-bounce delay-75"></span>
                <span className="w-1 h-2 bg-blue-600 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}

          {/* POPUP FOOTER / INPUT TOOLBAR */}
          <div className="shrink-0 p-3 bg-white border-t border-slate-200 z-10">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20 animate-pulse'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={isListening ? 'Stop Listening' : 'Speak Prompt with Voice'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isListening ? 'Listening...' : 'Type or speak a command...'}
                className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
              />

              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl shadow-xs transition-all cursor-pointer"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AiCopilotWidget;
