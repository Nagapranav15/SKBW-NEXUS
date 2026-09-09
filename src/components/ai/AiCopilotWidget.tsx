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
  ArrowUp,
  SquarePen,
  Plus,
  Zap,
  Package,
  ClipboardList,
  Wallet,
  Compass,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Boxes
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  actionTag?: string;
  time: string;
}

export const AiCopilotWidget: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Listen to global open event triggered from top navbar
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setIsClosing(false);
    };
    window.addEventListener('open-ai-copilot', handleOpen);
    return () => window.removeEventListener('open-ai-copilot', handleOpen);
  }, []);

  // Auto-scroll chat to bottom on new message
  useEffect(() => {
    if (isOpen && messages.length > 0) {
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

  // Reset to New Chat State
  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  // Process Natural Language Commands & Execute System Actions across the entire ERP System
  const processAICommand = (userInput: string) => {
    const text = userInput.toLowerCase().trim();
    let reply = '';
    let actionTag: string | undefined = undefined;

    const isCreate = text.includes('create') || text.includes('new') || text.includes('add') || text.includes('record');

    // 1. BUSINESS DIRECTORY / PARTIES (AGENTS, VENDORS, CUSTOMERS, ROUTES, CITIES, TRANSPORTERS)
    if (
      text.includes('directory') ||
      text.includes('party') ||
      text.includes('agent') ||
      text.includes('vendor') ||
      text.includes('supplier') ||
      text.includes('customer') ||
      text.includes('transporter') ||
      text.includes('route') ||
      text.includes('region') ||
      text.includes('market') ||
      text.includes('city')
    ) {
      if (text.includes('agent')) {
        reply = isCreate
          ? 'Opening Business Directory modal to add a new sales agent...'
          : 'Navigating to Business Directory (Sales Agents tab)...';
        actionTag = isCreate ? 'Directory: Create Agent' : 'Navigate: Directory Agents';
        navigate('/directory?subtab=agents');
        if (isCreate) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { target: 'directory', action: 'create_agent' } }));
          }, 300);
        }
      } else if (text.includes('vendor') || text.includes('supplier')) {
        reply = isCreate
          ? 'Opening form to register a new vendor/supplier...'
          : 'Opening Suppliers & Vendors directory...';
        actionTag = isCreate ? 'Directory: Create Vendor' : 'Navigate: Suppliers';
        navigate('/party/vendors');
      } else if (text.includes('customer')) {
        reply = isCreate
          ? 'Opening Customer Registration drawer...'
          : 'Navigating to Customer Master Directory...';
        actionTag = isCreate ? 'Directory: Create Customer' : 'Navigate: Customers';
        navigate('/party/customers');
      } else if (text.includes('route') || text.includes('region')) {
        reply = 'Opening Regions & Routes directory...';
        actionTag = 'Navigate: Regions';
        navigate('/party/routes');
      } else if (text.includes('market') || text.includes('city')) {
        reply = 'Opening Cities & Markets directory...';
        actionTag = 'Navigate: Cities';
        navigate('/party/markets');
      } else if (text.includes('transporter')) {
        reply = 'Opening Transporters directory...';
        actionTag = 'Navigate: Transporters';
        navigate('/party/transporters');
      } else {
        reply = 'Navigating to main Business Directory...';
        actionTag = 'Navigate: Business Directory';
        navigate('/directory');
      }
    }

    // 2. STOCK & ITEM MASTER ACTIONS
    else if (text.includes('item') || text.includes('sku') || text.includes('product') || text.includes('stock') || text.includes('inventory') || text.includes('material')) {
      if (isCreate || text.includes('add stock')) {
        reply = 'Opening Item Master drawer to add a new item or stock entry...';
        actionTag = 'Inventory: Add Item';
        navigate('/inventory-v2/skus');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { target: 'stock', action: 'create_sku' } }));
        }, 300);
      } else if (text.includes('alert') || text.includes('low stock') || text.includes('threshold')) {
        reply = 'Displaying low stock items and reorder alerts...';
        actionTag = 'Inventory: Stock Alerts';
        navigate('/stock-inventory');
      } else if (text.includes('ledger') || text.includes('movement') || text.includes('history')) {
        reply = 'Opening Stock Movement Ledger...';
        actionTag = 'Inventory: Stock Ledger';
        navigate('/inventory-v2/ledger?mode=stock');
      } else if (text.includes('batch')) {
        reply = 'Navigating to Finished Batch Stock...';
        actionTag = 'Inventory: Batch Stock';
        navigate('/inventory-v2/batch-stock');
      } else {
        reply = 'Navigating to Item Master Directory...';
        actionTag = 'Navigate: Item Master';
        navigate('/inventory-v2/skus');
      }
    }

    // 3. PURCHASE BATCHES & WORK ORDERS
    else if (text.includes('purchase') || text.includes('work order') || text.includes('po') || text.includes('procurement')) {
      if (isCreate || text.includes('create a work order')) {
        reply = 'Opening Purchase & Work Order Entry dialog...';
        actionTag = 'Purchases: Create Batch';
        navigate('/inventory-v2/purchases');
      } else {
        reply = 'Opening Purchase & Work Order Register...';
        actionTag = 'Navigate: Purchase Batches';
        navigate('/inventory-v2/purchases');
      }
    }

    // 4. DIGITAL DISPATCH & LOGISTICS
    else if (text.includes('dispatch') || text.includes('shipment') || text.includes('delivery')) {
      reply = 'Navigating to Digital Dispatch center...';
      actionTag = 'Navigate: Digital Dispatch';
      navigate('/sales/digital-dispatch');
    }

    // 5. SALES, QUOTATIONS & CUSTOMER OUTSTANDINGS
    else if (text.includes('quote') || text.includes('quotation') || text.includes('order') || text.includes('outstanding') || text.includes('sale')) {
      if (text.includes('quote') || text.includes('quotation')) {
        reply = 'Opening Sales Quotation management...';
        actionTag = 'Navigate: Quotations';
        navigate('/sales/quotes');
      } else if (text.includes('outstanding') || text.includes('pending')) {
        reply = 'Displaying outstanding customer orders and pending balances...';
        actionTag = 'Sales: Pending Orders';
        navigate('/sales/pending');
      } else {
        reply = 'Navigating to Sale Orders register...';
        actionTag = 'Navigate: Sale Orders';
        navigate('/sales/orders');
      }
    }

    // 6. BUSINESS ANALYZER & REPORTS
    else if (text.includes('analytics') || text.includes('report') || text.includes('dashboard') || text.includes('stat') || text.includes('transaction')) {
      if (text.includes('transaction')) {
        reply = 'Opening Transactions log...';
        actionTag = 'Navigate: Transactions';
        navigate('/transactions');
      } else if (text.includes('report')) {
        reply = 'Opening Sales Reports...';
        actionTag = 'Navigate: Sales Reports';
        navigate('/sales/reports');
      } else {
        reply = 'Opening Business Intelligence Analyzer...';
        actionTag = 'Navigate: BI Analyzer';
        navigate('/analyzer');
      }
    }

    // GENERAL DEFAULT
    else {
      reply = `I have received your request regarding: "${userInput}". You can manage this dynamically across Item Master, Stock Inventory, Business Directory, or Sales Orders.`;
      actionTag = 'AI General Response';
    }

    return { reply, actionTag };
  };

  // Send Message Handler
  const handleSendMessage = (customText?: string) => {
    const queryText = customText || input;
    if (!queryText.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: queryText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setIsThinking(true);

    setTimeout(() => {
      const { reply, actionTag } = processAICommand(queryText);
      const aiMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
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
          className="fixed bottom-6 right-6 z-[90] p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl shadow-blue-500/30 ring-4 ring-blue-500/15 hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 group cursor-pointer"
          title="Open AI Copilot"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-blue-600"></span>
          </div>
          <span className="text-xs font-extrabold tracking-wide pr-1 hidden sm:inline-block">Copilot</span>
        </button>
      )}

      {/* 2. COPILOT FLYOUT DRAWER (Matching Screenshot 2) */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-5rem)] z-[95] bg-white rounded-3xl border border-gray-200/90 shadow-2xl overflow-hidden flex flex-col ${
            isClosing ? 'animate-aiClose' : 'animate-aiOpen'
          }`}
        >
          {/* HEADER (Matching Screenshot 2) */}
          <div className="shrink-0 px-4 py-3.5 bg-white text-gray-900 flex items-center justify-between z-10 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-blue-600" />
              <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">Copilot</h3>
            </div>

            <div className="flex items-center gap-1.5">
              {/* New Chat Button */}
              <button
                type="button"
                onClick={handleNewChat}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer"
                title="New Chat"
              >
                <SquarePen className="w-3.5 h-3.5" />
              </button>

              {/* Audio Voice Mute Toggle */}
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`w-7 h-7 rounded-full transition-colors cursor-pointer flex items-center justify-center ${
                  isMuted ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={isMuted ? 'Unmute Audio Voice' : 'Mute Audio Voice'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Close Drawer Button */}
              <button
                type="button"
                onClick={handleToggleOpen}
                className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center transition-all cursor-pointer"
                title="Close Copilot"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* MAIN BODY AREA */}
          <div className="flex-1 overflow-y-auto p-4 bg-white flex flex-col justify-between custom-scrollbar">
            {messages.length === 0 ? (
              /* INITIAL HERO VIEW (Matching Screenshot 2) */
              <div className="flex-1 flex flex-col items-center justify-center py-4 px-2 text-center my-auto animate-fadeIn">
                {/* Center Sparkles Icon Avatar */}
                <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs mb-3">
                  <Sparkles className="w-7 h-7" />
                </div>

                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight mb-2">
                  How can I help?
                </h2>

                <p className="text-xs text-gray-500 text-center max-w-[270px] leading-relaxed mb-6">
                  Ask about your operations, or just describe what happened — I'll draft it for your approval before anything is saved.
                </p>

                {/* Suggested Action List (Matching Screenshot 2) */}
                <div className="w-full space-y-0.5 border-t border-gray-100 pt-2 text-left">
                  <button
                    type="button"
                    onClick={() => handleSendMessage('Add stock')}
                    className="w-full py-2.5 px-3 flex items-center gap-3 text-xs font-bold text-gray-800 hover:bg-slate-50 rounded-xl transition-colors group cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-gray-400 group-hover:text-blue-600 shrink-0" />
                    <span>Add stock</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage('Create a work order')}
                    className="w-full py-2.5 px-3 flex items-center gap-3 text-xs font-bold text-gray-800 hover:bg-slate-50 rounded-xl transition-colors group cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4 text-gray-400 group-hover:text-blue-600 shrink-0" />
                    <span>Create a work order</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage("What's outstanding from customers?")}
                    className="w-full py-2.5 px-3 flex items-center gap-3 text-xs font-bold text-gray-800 hover:bg-slate-50 rounded-xl transition-colors group cursor-pointer"
                  >
                    <Wallet className="w-4 h-4 text-gray-400 group-hover:text-blue-600 shrink-0" />
                    <span>What's outstanding from customers?</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage('Take me to dispatch')}
                    className="w-full py-2.5 px-3 flex items-center gap-3 text-xs font-bold text-gray-800 hover:bg-slate-50 rounded-xl transition-colors group cursor-pointer"
                  >
                    <Compass className="w-4 h-4 text-gray-400 group-hover:text-blue-600 shrink-0" />
                    <span>Take me to dispatch</span>
                  </button>
                </div>
              </div>
            ) : (
              /* CHAT THREAD MESSAGES LIST */
              <div className="space-y-3 text-xs">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-xs font-medium'
                          : 'bg-slate-50 text-slate-800 border border-slate-200/80 rounded-bl-xs leading-relaxed font-normal'
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
                  <div className="flex items-center gap-2 text-slate-500 bg-slate-50 p-3 rounded-2xl border border-slate-200/70 max-w-[70%] animate-pulse">
                    <Bot className="w-4 h-4 text-blue-600" />
                    <span className="text-[11px] font-semibold">Copilot is thinking...</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
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

          {/* INPUT CONTAINER (Matching Screenshot 2 Footer) */}
          <div className="shrink-0 p-3 bg-white border-t border-gray-100 z-10">
            <div className="rounded-2xl border border-gray-200/90 bg-white p-3 shadow-2xs space-y-2 focus-within:border-blue-500 transition-all">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isListening ? 'Listening...' : 'Message Copilot'}
                className="w-full text-xs font-medium text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
              />

              {/* Bottom Toolbar Inside Input Card */}
              <div className="flex items-center justify-between pt-1">
                {/* Left Action Buttons & Tags */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="Add Attachment"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="System Actions"
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </button>

                  <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10.5px] font-bold text-blue-700 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-blue-600" />
                    Items
                  </span>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isListening ? 'text-rose-600 animate-pulse bg-rose-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                    title={isListening ? 'Stop Listening' : 'Voice Input'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {selectedCompany?.name || 'SKBW ERP'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim()}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      input.trim()
                        ? 'bg-blue-600 text-white shadow-xs hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    title="Send Message"
                  >
                    <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiCopilotWidget;
