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
      text.includes('city') ||
      text.includes('market')
    ) {
      if (text.includes('agent')) {
        navigate('/party/directory');
        if (isCreate) {
          reply = 'Opening Business Directory and launching the Create New Agent form for you!';
          actionTag = '⚡ Executing: Create New Agent in Business Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-agent' } }));
          }, 250);
        } else {
          reply = 'Navigating to Business Directory - Agents tab.';
          actionTag = '⚡ Executing: Navigating to Agents Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-agents' } }));
          }, 150);
        }
      } else if (text.includes('vendor') || text.includes('supplier')) {
        navigate('/party/vendors');
        if (isCreate) {
          reply = 'Opening Business Directory and launching the Create New Vendor / Supplier form.';
          actionTag = '⚡ Executing: Create New Vendor in Business Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-vendor' } }));
          }, 250);
        } else {
          reply = 'Navigating to Vendor & Supplier Directory.';
          actionTag = '⚡ Executing: Navigating to Vendors Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-vendors' } }));
          }, 150);
        }
      } else if (text.includes('customer')) {
        navigate('/party/customers');
        if (isCreate) {
          reply = 'Opening Business Directory and launching the Create New Customer form.';
          actionTag = '⚡ Executing: Create New Customer in Business Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-customer' } }));
          }, 250);
        } else {
          reply = 'Navigating to Customer Directory.';
          actionTag = '⚡ Executing: Navigating to Customers Directory';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-customers' } }));
          }, 150);
        }
      } else if (text.includes('transporter')) {
        navigate('/party/transporters');
        if (isCreate) {
          reply = 'Opening Transporters Directory and launching New Transporter creation form.';
          actionTag = '⚡ Executing: Create New Transporter';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-transporter' } }));
          }, 250);
        } else {
          reply = 'Navigating to Transporters Directory.';
          actionTag = '⚡ Executing: Navigating to Transporters';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-transporters' } }));
          }, 150);
        }
      } else if (text.includes('route') || text.includes('region')) {
        navigate('/party/routes');
        if (isCreate) {
          reply = 'Opening Region & Route Master and launching New Route creation form.';
          actionTag = '⚡ Executing: Create New Region / Route';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-region' } }));
          }, 250);
        } else {
          reply = 'Navigating to Region & Route Directory.';
          actionTag = '⚡ Executing: Navigating to Regions & Routes';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-regions' } }));
          }, 150);
        }
      } else if (text.includes('city') || text.includes('market')) {
        navigate('/party/markets');
        if (isCreate) {
          reply = 'Opening Market & City Master and launching New City creation form.';
          actionTag = '⚡ Executing: Create New Market / City';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-city' } }));
          }, 250);
        } else {
          reply = 'Navigating to Market & City Directory.';
          actionTag = '⚡ Executing: Navigating to Markets & Cities';
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-cities' } }));
          }, 150);
        }
      } else {
        navigate('/party/directory');
        reply = 'Opening Business Directory & Party Management.';
        actionTag = '⚡ Executing: Navigating to Business Directory';
      }
    }
    // 2. PURCHASE BATCH & MATERIAL LOTS
    else if (text.includes('purchase batch') || text.includes('batch') || text.includes('lot delivery') || text.includes('grn')) {
      navigate('/stock-inventory');
      if (isCreate || text.includes('record')) {
        reply = 'Opening the New Purchase Batch form for you right away!';
        actionTag = '⚡ Executing: Opening New Purchase Batch Window';
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-purchase-batch' } }));
        }, 250);
      } else {
        reply = 'Navigating to Purchase Batches & Material Delivery Lot Register.';
        actionTag = '⚡ Executing: Opening Purchase Batches';
      }
    }
    // 3. STOCK ALERTS & LOW STOCK
    else if (text.includes('alert') || text.includes('low stock') || text.includes('out of stock') || text.includes('reorder')) {
      reply = 'Navigating to Stock Alerts! Showing all items needing reordering.';
      actionTag = '⚡ Executing: Navigating to Stock Alerts';
      navigate('/stock-inventory');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-alerts' } }));
      }, 150);
    }
    // 4. ITEM MASTER & SKU MANAGEMENT
    else if (text.includes('item master') || text.includes('sku') || text.includes('item') || text.includes('product') || text.includes('raw material')) {
      navigate('/inventory-v2/skus');
      if (isCreate) {
        reply = 'Opening the Add SKU / Item drawer in Item Master.';
        actionTag = '⚡ Executing: Opening Add SKU Drawer';
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'open-add-sku' } }));
        }, 250);
      } else {
        reply = 'Navigating to Item Master & SKU Register.';
        actionTag = '⚡ Executing: Navigating to Item Master';
      }
    }
    // 5. WAREHOUSE SETUP & STORAGE LOCATIONS
    else if (text.includes('warehouse') || text.includes('location') || text.includes('storage') || text.includes('bin') || text.includes('zone') || text.includes('factory')) {
      reply = 'Navigating to Warehouse Hierarchy & Storage Locations.';
      actionTag = '⚡ Executing: Opening Warehouse Setup';
      navigate('/stock-inventory');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('erp-ai-action', { detail: { action: 'select-tab-warehouse' } }));
      }, 150);
    }
    // 6. SALES QUOTES, ORDERS & DIGITAL DISPATCH
    else if (text.includes('quote') || text.includes('quotation')) {
      reply = 'Navigating to Sales Quotations.';
      actionTag = '⚡ Executing: Navigating to Sales Quotes';
      navigate('/sales/quotes');
    } else if (text.includes('order') || text.includes('sales order') || text.includes('pending')) {
      if (text.includes('pending')) {
        reply = 'Navigating to Pending Orders.';
        actionTag = '⚡ Executing: Navigating to Pending Orders';
        navigate('/sales/pending');
      } else {
        reply = 'Navigating to Sales Orders.';
        actionTag = '⚡ Executing: Navigating to Sales Orders';
        navigate('/sales/orders');
      }
    } else if (text.includes('challan') || text.includes('delivery challan')) {
      reply = 'Navigating to Delivery Challan Register.';
      actionTag = '⚡ Executing: Navigating to Delivery Challan';
      navigate('/sales/delivery-challan');
    } else if (text.includes('dispatch') || text.includes('digital dispatch')) {
      reply = 'Navigating to Digital Dispatch Management.';
      actionTag = '⚡ Executing: Navigating to Digital Dispatch';
      navigate('/sales/digital-dispatch');
    } else if (text.includes('sales report') || text.includes('sales analytics')) {
      reply = 'Navigating to Sales Reports & Business Intelligence.';
      actionTag = '⚡ Executing: Navigating to Sales Reports';
      navigate('/sales/reports');
    }
    // 7. INVENTORY CONVERSIONS, BOM RECIPE & STOCK TRANSFERS
    else if (text.includes('bom') || text.includes('recipe') || text.includes('conversion')) {
      reply = 'Navigating to Bill of Materials (BOM) Recipe Master.';
      actionTag = '⚡ Executing: Navigating to BOM Recipe Master';
      navigate('/inventory-v2/conversions/bom');
    } else if (text.includes('transfer') || text.includes('stock transfer')) {
      reply = 'Navigating to Stock Transfer Module.';
      actionTag = '⚡ Executing: Navigating to Stock Transfer';
      navigate('/inventory-v2/conversions/transfer');
    } else if (text.includes('ledger') || text.includes('history')) {
      reply = 'Navigating to Inventory Stock Ledger.';
      actionTag = '⚡ Executing: Navigating to Stock Ledger';
      navigate('/inventory-v2/ledger');
    }
    // 8. DASHBOARD, SETTINGS & TOOLS
    else if (text.includes('dashboard') || text.includes('overview') || text.includes('home')) {
      reply = 'Navigating to Main ERP Dashboard.';
      actionTag = '⚡ Executing: Navigating to Dashboard';
      navigate('/dashboard');
    } else if (text.includes('setting') || text.includes('config')) {
      reply = 'Navigating to Inventory & ERP System Settings.';
      actionTag = '⚡ Executing: Navigating to Settings';
      navigate('/inventory-v2/settings');
    } else if (text.includes('company') || text.includes('switch company')) {
      reply = 'Navigating to Company Selection screen.';
      actionTag = '⚡ Executing: Navigating to Company Selection';
      navigate('/company-selection');
    } else if (text.includes('import') || text.includes('export') || text.includes('excel') || text.includes('transaction')) {
      reply = 'Opening Transaction & Data Tools.';
      actionTag = '⚡ Executing: Navigating to Transaction Tools';
      navigate('/transactions');
    }
    // 9. ERP KNOWLEDGE BASE QA & HELP
    else if (text.includes('gbl') || text.includes('unit conversion') || text.includes('pcs')) {
      reply = 'In Item Master unit conversion, bulk package units appear on the left (e.g. 1 GBL = 200 Pcs). This ensures clear inventory scaling!';
    } else if (text.includes('ream') || text.includes('sheets')) {
      reply = 'Standard paper reams default to 500 sheets per ream. The ream weight is calculated using (Width * Length * GSM * 500) / 10,000,000.';
    } else if (text.includes('who are you') || text.includes('what can you do') || text.includes('help')) {
      reply = 'I am your dynamic AI ERP Copilot! You can tell me to "create new agent in business directory", "open purchase batch", "check low stock alerts", "add new SKU", or navigate to any module by voice or text.';
    } else {
      reply = `Understood! I have processed your request for "${userInput}". How else may I assist you in the ERP today?`;
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
