import { useState, useRef, useEffect } from 'react'
import styles from './components/Layout.module.css'
import nodeStyles from './components/Node.module.css'
import inspectorStyles from './components/Inspector.module.css'
import { devices } from './data/devices'

interface CanvasNode {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  x: number;
  y: number;
  properties: Record<string, any>;
}

interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const getDeviceColor = (type: string) => {
  switch (type) {
    case 'Spectrum Analyzer':
      return '#c084fc' // Purple
    case 'Oscilloscope':
      return '#22d3ee' // Cyan
    case 'Power Supply':
      return '#f97316' // Orange
    case 'Function Generator':
      return '#34d399' // Green
    case 'Vector Network Analyzer':
      return '#3b82f6' // Blue
    case 'Step Attenuator':
      return '#fbbf24' // Amber
    default:
      return '#64748b'
  }
}

const getFormattedTime = () => {
  const now = new Date()
  let hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  return `${hours}:${minutes} ${ampm}`
}

function App() {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hi! Describe a measurement and I'll build the workflow for you.",
      timestamp: getFormattedTime()
    }
  ])
  const [isTyping, setIsTyping] = useState(false)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  
  // Selection states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  
  // Voice state
  const [isListening, setIsListening] = useState(false)

  // Collapsible & expandable panel states
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false)
  const [isRightCollapsed, setIsRightCollapsed] = useState(false)
  const [isRightExpanded, setIsRightExpanded] = useState(false)
  const recognitionRef = useRef<any>(null)
  
  const messageEndRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom of chat
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Auto-expand textarea height on input changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [chatInput])

  // Global key listener to delete selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          handleDeleteNode(selectedNodeId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId])

  // Clear canvas
  const handleClear = () => {
    setNodes([])
    setConnections([])
    setSelectedNodeId(null)
  }

  // Reset chat and clear canvas
  const handleNewChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: "Hi! Describe a measurement and I'll build the workflow for you.",
        timestamp: getFormattedTime()
      }
    ])
    handleClear()
  }

  // Delete Node & Associated Connections
  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
  }

  // Edit node properties
  const handlePropertyChange = (nodeId: string, key: string, value: any) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              properties: {
                ...n.properties,
                [key]: value
              }
            }
          : n
      )
    )
  }

  // Copy Code to Clipboard
  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText).then(() => {
      alert("SCPI Calibration Script copied to clipboard!")
    }).catch((err) => {
      console.error("Failed to copy code: ", err)
    })
  }

  // Download Code to .py File
  const handleDownloadCode = (codeText: string) => {
    const blob = new Blob([codeText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voltaic_calibration.py'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Speech Recognition Toggle
  const toggleSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.")
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'

    rec.onstart = () => {
      setIsListening(true)
    }

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      if (transcript) {
        setChatInput(transcript)
        setMessages((prev) => [
          ...prev,
          {
            id: `user_${Date.now()}`,
            sender: 'user',
            text: transcript,
            timestamp: getFormattedTime()
          }
        ])
        processIntent(transcript)
      }
    }

    rec.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error)
      setIsListening(false)
    }

    rec.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = rec
    rec.start()
  }

  // Run Parameter Limits Validation
  const handleValidate = () => {
    if (nodes.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: "⚠️ **Calibration Validation Failed:**\n\nCanvas is empty. Add instruments before validating.",
          timestamp: getFormattedTime()
        }
      ])
      return
    }

    const report: string[] = []
    let hasErrors = false

    nodes.forEach((node) => {
      if (node.deviceId === 'nge100') {
        const v = parseFloat(node.properties.voltage ?? 0)
        const c = parseFloat(node.properties.current ?? 0)
        if (v < 0 || v > 32) {
          report.push(`- ❌ **NGE100 Voltage limit error**: Configured voltage of **${v} V** exceeds physical channel hardware thresholds (0.00V - 32.00V).`)
          hasErrors = true
        }
        if (c < 0.05 || c > 3.0) {
          report.push(`- ❌ **NGE100 Current limit error**: Limit of **${c} A** exceeds socket limits (0.05A - 3.00A).`)
          hasErrors = true
        }
      } else if (node.deviceId === 'fpc1500') {
        const cf = parseFloat(node.properties.centerFreq ?? 0)
        const span = parseFloat(node.properties.span ?? 0)
        if (cf < 0.005 || cf > 1500) {
          report.push(`- ❌ **FPC1500 RF range error**: Center Frequency **${cf} MHz** is out of bounds (0.005 MHz - 1500.00 MHz).`)
          hasErrors = true
        }
        if (span < 0.00001 || span > 1500) {
          report.push(`- ❌ **FPC1500 Span scale error**: Sweep span of **${span} MHz** is out of bounds (10 Hz - 1500.00 MHz).`)
          hasErrors = true
        }
      } else if (node.deviceId === 'rtb24') {
        const scale = parseFloat(node.properties.ch1Scale ?? 0)
        const tb = parseFloat(node.properties.timebase ?? 0)
        if (scale < 0.001 || scale > 10) {
          report.push(`- ❌ **RTB24 Scale error**: Vertical setting of **${scale} V** is out of bounds (1 mV - 10.00 V).`)
          hasErrors = true
        }
        if (tb < 0.000001 || tb > 500000) {
          report.push(`- ❌ **RTB24 Horizontal sweep error**: Timebase of **${tb} ms** exceeds horizontal sweep thresholds.`)
          hasErrors = true
        }
      }
    })

    if (hasErrors) {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Calibration Validation Failed:**\n\n${report.join('\n')}\n\n*Fix these parameters in the Inspector before generating the python calibration script.*`,
          timestamp: getFormattedTime()
        }
      ])
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `val_${Date.now()}`,
          sender: 'assistant',
          text: "✅ **Calibration Validation Succeeded:**\n\n- All instrument parameters are within safe hardware thresholds.\n- Virtual ports are successfully linked.\n\n*Ready to compile python SCPI script.*",
          timestamp: getFormattedTime()
        }
      ])
    }
  }

  // Dynamic Python SCPI Code Generator
  const handleGenerateScript = () => {
    if (nodes.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `script_${Date.now()}`,
          sender: 'assistant',
          text: "⚠️ **Script Generation Failed:**\n\nCanvas is empty. Describe a calibration flow to start.",
          timestamp: getFormattedTime()
        }
      ])
      return
    }

    let code = `import socket
import time

def setup_workbench():
    print("Initializing instrument calibration connections...")
`

    nodes.forEach((node) => {
      if (node.deviceId === 'nge100') {
        const v = parseFloat(node.properties.voltage ?? 12.0).toFixed(2)
        const c = parseFloat(node.properties.current ?? 1.5).toFixed(2)
        const active = node.properties.output ? 'ON' : 'OFF'
        code += `
    # Configure NGE100 Power Supply
    nge = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    nge.connect(("192.168.8.101", 5025))
    nge.sendall(b"*RST\\n")
    nge.sendall(b"INST OUT1\\n")
    nge.sendall(b"VOLT ${v}\\n")
    nge.sendall(b"CURR ${c}\\n")
    nge.sendall(b"OUTP ${active}\\n")
    print("NGE100 configured: Voltage = ${v} V, Current = ${c} A, Output = ${active}")
    nge.close()
`
      } else if (node.deviceId === 'fpc1500') {
        const cf = (parseFloat(node.properties.centerFreq ?? 500.0) * 1e6).toFixed(0) // MHz to Hz
        const span = (parseFloat(node.properties.span ?? 10.0) * 1e6).toFixed(0) // MHz to Hz
        const ref = parseFloat(node.properties.refLevel ?? -10.0)
        code += `
    # Configure FPC1500 Spectrum Analyzer
    fpc = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    fpc.connect(("192.168.8.102", 5025))
    fpc.sendall(b"*RST\\n")
    fpc.sendall(b"FREQ:CENT ${cf}\\n")
    fpc.sendall(b"FREQ:SPAN ${span}\\n")
    fpc.sendall(b"DISP:TRAC:Y:RLEV ${ref}\\n")
    print("FPC1500 configured: Center Freq = ${node.properties.centerFreq} MHz, Span = ${node.properties.span} MHz, Ref Level = ${ref} dBm")
    fpc.close()
`
      } else if (node.deviceId === 'rtb24') {
        const scale = parseFloat(node.properties.ch1Scale ?? 1.0).toFixed(3)
        const tb = (parseFloat(node.properties.timebase ?? 1.0) * 1e-3).toExponential(3) // ms to s
        const trig = node.properties.trigger ?? 'CH1'
        code += `
    # Configure RTB24 Oscilloscope
    rtb = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    rtb.connect(("192.168.8.103", 5025))
    rtb.sendall(b"*RST\\n")
    rtb.sendall(b"TIM:SCAL ${tb}\\n")
    rtb.sendall(b"CHAN1:STAT ON\\n")
    rtb.sendall(b"CHAN1:SCAL ${scale}\\n")
    rtb.sendall(b"TRIG:A:SOUR ${trig}\\n")
    print("RTB24 configured: Timebase = ${node.properties.timebase} ms/div, CH1 Scale = ${scale} V/div, Trigger = ${trig}")
    rtb.close()
`
      } else if (node.deviceId === 'hmf2550') {
        const freq = (parseFloat(node.properties.frequency ?? 10.0) * 1000).toFixed(0) // kHz to Hz
        const amp = parseFloat(node.properties.amplitude ?? 2.0).toFixed(2)
        code += `
    # Configure HMF2550 Function Generator
    hmf = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    hmf.connect(("192.168.8.104", 5025))
    hmf.sendall(b"*RST\\n")
    hmf.sendall(b"FREQ ${freq}\\n")
    hmf.sendall(b"VOLT ${amp}\\n")
    hmf.sendall(b"OUTP ON\\n")
    print("HMF2550 configured: Freq = ${node.properties.frequency} kHz, Amp = ${amp} Vpp")
    hmf.close()
`
      }
    })

    code += `
    print("All calibration protocols deployed successfully.")

if __name__ == "__main__":
    setup_workbench()
`

    let checklist = "### 📋 Hardware Setup Checklist\n\n"
    nodes.forEach((node, idx) => {
      checklist += `${idx + 1}. **${node.name}** (${node.type}):\n`
      if (node.deviceId === 'nge100') {
        checklist += `   - Connect DC supply cables to target inputs.\n   - Ensure supply limit is set to **${node.properties.voltage} V / ${node.properties.current} A**.\n`
      } else if (node.deviceId === 'fpc1500') {
        checklist += `   - Connect RF input to signal source/amplifier output.\n   - Set span to **${node.properties.span} MHz**.\n`
      } else if (node.deviceId === 'rtb24') {
        checklist += `   - Connect Probe 1 to channel 1 input.\n   - Trigger set to **${node.properties.trigger}**.\n`
      } else if (node.deviceId === 'hmf2550') {
        checklist += `   - Connect signal output to channel 1 scope input.\n   - Frequency set to **${node.properties.frequency} kHz**.\n`
      }
    })

    setMessages((prev) => [
      ...prev,
      {
        id: `script_${Date.now()}`,
        sender: 'assistant',
        text: `💻 **Generated Python SCPI Script:**\n\n\`\`\`python\n${code}\n\`\`\`\n\n${checklist}`,
        timestamp: getFormattedTime()
      }
    ])
  }

  // Mock AI Intent processing
  const processIntent = (intentText: string) => {
    const cleanedText = intentText.toLowerCase()
    setIsTyping(true)
    
    setTimeout(() => {
      setIsTyping(false)
      
      if (cleanedText.includes('snr') || cleanedText.includes('amplifier') || cleanedText.includes('spectrum')) {
        const ngeId = `nge100_${Date.now()}`
        const fpcId = `fpc1500_${Date.now()}`
        
        const newNGE: CanvasNode = {
          id: ngeId,
          deviceId: 'nge100',
          name: 'NGE100',
          type: 'Power Supply',
          x: 60,
          y: 110,
          properties: { voltage: 12.0, current: 1.5, output: true }
        }
        
        const newFPC: CanvasNode = {
          id: fpcId,
          deviceId: 'fpc1500',
          name: 'FPC1500',
          type: 'Spectrum Analyzer',
          x: 320,
          y: 110,
          properties: { centerFreq: 500.0, span: 10.0, refLevel: -10 }
        }
        
        setNodes([newNGE, newFPC])
        setConnections([
          {
            id: `${ngeId}-${fpcId}`,
            fromId: ngeId,
            toId: fpcId
          }
        ])
        
        setMessages((prev) => [
          ...prev,
          {
            id: `reply_${Date.now()}`,
            sender: 'assistant',
            text: "I've analyzed your request and placed the NGE100 Power Supply (connected to power the amplifier at 12V) and the FPC1500 Spectrum Analyzer (configured to a span of 10 MHz centered at 500 MHz) on the canvas. Click on the cards to inspect or edit parameters.",
            timestamp: getFormattedTime()
          }
        ])
      } else if (cleanedText.includes('sine') || cleanedText.includes('wave') || cleanedText.includes('oscilloscope') || cleanedText.includes('waveform')) {
        const hmfId = `hmf2550_${Date.now()}`
        const rtbId = `rtb24_${Date.now()}`
        
        const newHMF: CanvasNode = {
          id: hmfId,
          deviceId: 'hmf2550',
          name: 'HMF2550',
          type: 'Function Generator',
          x: 60,
          y: 110,
          properties: { frequency: 10.0, amplitude: 2.0 }
        }
        
        const newRTB: CanvasNode = {
          id: rtbId,
          deviceId: 'rtb24',
          name: 'RTB24',
          type: 'Oscilloscope',
          x: 320,
          y: 110,
          properties: { timebase: 1.0, ch1Scale: 1.0, trigger: 'CH1' }
        }
        
        setNodes([newHMF, newRTB])
        setConnections([
          {
            id: `${hmfId}-${rtbId}`,
            fromId: hmfId,
            toId: rtbId
          }
        ])
        
        setMessages((prev) => [
          ...prev,
          {
            id: `reply_${Date.now()}`,
            sender: 'assistant',
            text: "I've set up the function generator to supply a 10 kHz sine wave and linked it to Channel 1 of the RTB24 Oscilloscope. Visual parameters are loaded on the screen. Select a card to edit.",
            timestamp: getFormattedTime()
          }
        ])
      } else if (cleanedText.includes('clear') || cleanedText.includes('reset')) {
        handleClear()
        setMessages((prev) => [
          ...prev,
          {
            id: `reply_${Date.now()}`,
            sender: 'assistant',
            text: "Workflow canvas cleared successfully. Let me know what you want to measure next!",
            timestamp: getFormattedTime()
          }
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `reply_${Date.now()}`,
            sender: 'assistant',
            text: "I couldn't identify a hardware plan for that request. Try sending one of the suggestions below to populate the workbench canvas!",
            timestamp: getFormattedTime()
          }
        ])
      }
    }, 850)
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const userMsg = chatInput.trim()
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text: userMsg,
        timestamp: getFormattedTime()
      }
    ])
    setChatInput('')
    processIntent(userMsg)
  }

  const handleSuggestionClick = (suggestion: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: 'user',
        text: suggestion,
        timestamp: getFormattedTime()
      }
    ])
    processIntent(suggestion)
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains(styles.connectionsSvg)) {
      setSelectedNodeId(null)
    }
  }

  // Local helper to parse and render message text with markdown code block formatting
  const renderMessageText = (text: string) => {
    if (!text.includes('```')) {
      return text.split('\n').map((line, i) => {
        let content: React.ReactNode = line
        if (line.includes('**')) {
          const subParts = line.split('**')
          content = subParts.map((sp, idx) => (idx % 2 === 1 ? <strong key={idx}>{sp}</strong> : sp))
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {content}
          </p>
        )
      })
    }

    const parts = text.split('```')
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        const codeContent = part.replace(/^(python|bash|javascript|json|html)\n/, '')
        return (
          <div key={index} style={{ margin: '8px 0' }}>
            <div className={styles.codeHeader}>
              <span>Python SCPI</span>
              <div className={styles.codeActions}>
                <button
                  type="button"
                  className={styles.codeActionBtn}
                  onClick={() => handleCopyCode(codeContent)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className={styles.codeActionBtn}
                  onClick={() => handleDownloadCode(codeContent)}
                >
                  Download
                </button>
              </div>
            </div>
            <pre
              style={{
                backgroundColor: '#0a0a0c',
                border: '1px solid var(--border-color)',
                borderTop: 'none',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
                padding: '10px 12px',
                margin: 0,
                overflowX: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                lineHeight: '1.4',
                color: '#d19a66',
                whiteSpace: 'pre'
              }}
            >
              <code>{codeContent}</code>
            </pre>
          </div>
        )
      }

      return part.split('\n').map((line, i) => {
        let content: React.ReactNode = line
        if (line.includes('**')) {
          const subParts = line.split('**')
          content = subParts.map((sp, idx) => (idx % 2 === 1 ? <strong key={idx}>{sp}</strong> : sp))
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {content}
          </p>
        )
      })
    })
  }

  // Selected Node metadata helper
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  // Render Visual LCD Display inside the node cards
  const renderNodeScreen = (node: CanvasNode) => {
    switch (node.deviceId) {
      case 'fpc1500': {
        const center = node.properties.centerFreq ?? 500
        const span = node.properties.span ?? 10
        return (
          <div className={nodeStyles.nodeScreen}>
            <svg className={nodeStyles.screenSvg}>
              <defs>
                <pattern id="screen-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" className={nodeStyles.screenGrid} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#screen-grid)" />
              {/* Peak wave path */}
              <path d="M 4 24 L 30 24 L 50 24 L 70 24 L 80 18 L 90 4 L 100 18 L 110 24 L 166 24" />
            </svg>
            <div className={nodeStyles.screenLabel}>
              CF: {center} MHz | SPAN: {span} MHz
            </div>
          </div>
        )
      }
      case 'rtb24': {
        const scale = node.properties.ch1Scale ?? 1.0
        const tb = node.properties.timebase ?? 1.0
        return (
          <div className={nodeStyles.nodeScreen}>
            <svg className={nodeStyles.screenSvg}>
              <defs>
                <pattern id="scope-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" className={nodeStyles.screenGrid} />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#scope-grid)" />
              {/* Sine Wave */}
              <path d="M 4 16 C 30 0, 50 32, 85 16 C 120 0, 140 32, 166 16" />
            </svg>
            <div className={nodeStyles.screenLabel}>
              CH1: {scale}V | TB: {tb}ms
            </div>
          </div>
        )
      }
      case 'nge100': {
        const voltage = parseFloat(node.properties.voltage ?? 12.0)
        const current = parseFloat(node.properties.current ?? 1.5)
        const active = node.properties.output ?? false
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout}>
              <span>{voltage.toFixed(2)} V</span>
              <span>{current.toFixed(2)} A</span>
            </div>
            <div className={nodeStyles.screenLabel}>
              CH1: OUTPUT {active ? 'ON' : 'OFF'}
            </div>
          </div>
        )
      }
      case 'hmf2550': {
        const freq = node.properties.frequency ?? 10.0
        const amp = node.properties.amplitude ?? 2.0
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout} style={{ color: '#00e676', textShadow: '0 0 4px rgba(0, 230, 118, 0.4)' }}>
              <span>{freq} kHz</span>
              <span>{amp} Vpp</span>
            </div>
            <div className={nodeStyles.screenLabel}>SINE WAVE ACTIVE</div>
          </div>
        )
      }
      default:
        return (
          <div className={nodeStyles.nodeScreen}>
            <div className={nodeStyles.screenReadout} style={{ color: '#0091ff', textShadow: '0 0 4px rgba(0, 145, 255, 0.4)' }}>
              <span>READY</span>
            </div>
            <div className={nodeStyles.screenLabel}>SIMULATOR ONLINE</div>
          </div>
        )
    }
  }

  // Render Property Inspector panel controls
  const renderInspector = (node: CanvasNode) => {
    switch (node.deviceId) {
      case 'nge100':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Channel 1 Voltage</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.voltage ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'voltage', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>V</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Channel 1 Current Limit</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.05"
                  className={inspectorStyles.textInput}
                  value={node.properties.current ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'current', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>A</span>
              </div>
            </div>
            <div className={inspectorStyles.switchRow}>
              <label className={inspectorStyles.switchLabel}>Output Power</label>
              <button
                type="button"
                className={`${inspectorStyles.switchBtn} ${
                  node.properties.output ? inspectorStyles.switchBtnActive : ''
                }`}
                onClick={() => handlePropertyChange(node.id, 'output', !node.properties.output)}
              >
                <span
                  className={`${inspectorStyles.switchHandle} ${
                    node.properties.output ? inspectorStyles.switchHandleActive : ''
                  }`}
                />
              </button>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The NGE100 is an isolated channels power supply. Maximum voltage output per channel is 32V. Keep values below target limits.
            </p>
          </>
        )
      case 'fpc1500':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Center Frequency</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.centerFreq ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'centerFreq', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>MHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Span</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.span ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'span', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>MHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Reference Level</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.refLevel ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'refLevel', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>dBm</span>
              </div>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The FPC1500 spectrum analyzer tracks signal harmonics and power levels. Set center frequency to align with signal interest bands.
            </p>
          </>
        )
      case 'rtb24':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Vertical Scale (CH1)</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.ch1Scale ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'ch1Scale', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>V/div</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Horizontal Timebase</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.timebase ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'timebase', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>ms/div</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Trigger Source</label>
              <select
                className={inspectorStyles.selectInput}
                value={node.properties.trigger ?? 'CH1'}
                onChange={(e) => handlePropertyChange(node.id, 'trigger', e.target.value)}
              >
                <option value="CH1">Channel 1</option>
                <option value="CH2">Channel 2</option>
                <option value="EXT">External</option>
              </select>
            </div>
            <p className={inspectorStyles.descriptionText}>
              The RTB24 oscilloscope shows waveform sweeps. Make sure timebase is set narrow enough to capture transient peaks.
            </p>
          </>
        )
      case 'hmf2550':
        return (
          <>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Frequency</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  className={inspectorStyles.textInput}
                  value={node.properties.frequency ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'frequency', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>kHz</span>
              </div>
            </div>
            <div className={inspectorStyles.formGroup}>
              <label className={inspectorStyles.label}>Amplitude</label>
              <div className={inspectorStyles.inputRow}>
                <input
                  type="number"
                  step="0.1"
                  className={inspectorStyles.textInput}
                  value={node.properties.amplitude ?? 0}
                  onChange={(e) => handlePropertyChange(node.id, 'amplitude', e.target.value)}
                />
                <span className={inspectorStyles.suffix}>Vpp</span>
              </div>
            </div>
            <p className={inspectorStyles.descriptionText}>
              Function generator supplying sine, triangle, or square waves up to 50 MHz.
            </p>
          </>
        )
      default:
        return (
          <p className={inspectorStyles.descriptionText}>
            No custom parameter settings available for this secondary device. It runs under mock diagnostic validation check values.
          </p>
        )
    }
  }

  return (
    <div className={styles.appContainer}>
      {/* LEFT SIDEBAR: Branding & Static Instrument List */}
      <aside
        className={styles.sidebar}
        style={{
          width: isLeftCollapsed ? '0px' : '220px',
          minWidth: isLeftCollapsed ? '0px' : '220px',
          borderRightWidth: isLeftCollapsed ? '0px' : '1px'
        }}
      >
        <div className={styles.logoSection}>
          <div className={styles.logoIcon}>
            <img src="/favicon.svg" style={{ width: '16px', height: '16px' }} alt="Voltaic Logo" />
          </div>
          <div className={styles.logoTextContainer}>
            <h1 className={styles.logoText}>VOLTAIC</h1>
            <span className={styles.logoSubtitle}>R&S Workflow Builder</span>
          </div>
          <button
            className={styles.sidebarCollapseBtn}
            onClick={() => setIsLeftCollapsed(true)}
            title="Collapse Instruments"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        </div>

        <h2 className={styles.sidebarTitle}>Instruments</h2>
        <div className={styles.deviceList}>
          {devices.map((device) => {
            const typeColor = getDeviceColor(device.type)
            return (
              <div key={device.id} className={styles.deviceCard} style={{ cursor: 'default' }}>
                <span className={styles.deviceName}>{device.name}</span>
                <span className={styles.deviceBadge}>
                  <span
                    className={styles.badgeDot}
                    style={{
                      backgroundColor: typeColor,
                      boxShadow: `0 0 6px ${typeColor}80`
                    }}
                  />
                  {device.type}
                </span>
              </div>
            )
          })}
        </div>
      </aside>

      {/* CENTER CANVAS PANEL */}
      <main className={styles.canvasContainer}>
        {/* TOOLBAR */}
        <div className={styles.toolbar}>
          <button className={styles.toolbarButton} onClick={handleClear}>
            Clear
          </button>
          <button className={styles.toolbarButton} onClick={handleValidate}>
            Validate
          </button>
          <button
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
            onClick={handleGenerateScript}
          >
            Generate Script
          </button>
        </div>

        {/* CANVAS SURFACE */}
        <div
          ref={canvasRef}
          className={styles.canvasSurface}
          onClick={handleCanvasClick}
        >
          {isLeftCollapsed && (
            <button
              className={styles.floatingExpandTabLeft}
              onClick={(e) => {
                e.stopPropagation()
                setIsLeftCollapsed(false)
              }}
              title="Show Instruments"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          )}

          {isRightCollapsed && (
            <button
              className={styles.floatingExpandTabRight}
              onClick={(e) => {
                e.stopPropagation()
                setIsRightCollapsed(false)
              }}
              title="Show Assistant"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          )}

          {/* SVG CONNECTIONS OVERLAY */}
          <svg className={styles.connectionsSvg}>
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.fromId)
              const toNode = nodes.find((n) => n.id === conn.toId)
              if (!fromNode || !toNode) return null

              const x1 = fromNode.x + 190 // Output Socket
              const y1 = fromNode.y + 64  // Card Center Height (128px / 2)
              const x2 = toNode.x         // Input Socket
              const y2 = toNode.y + 64

              // Curved Bezier calculation
              const cp1x = x1 + 50
              const cp2x = x2 - 50

              return (
                <path
                  key={conn.id}
                  d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
                  stroke="var(--color-primary)"
                  strokeWidth="2.5"
                  fill="none"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(0, 145, 255, 0.35))' }}
                />
              )
            })}
          </svg>

          {nodes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <img src="/favicon.svg" style={{ width: '28px', height: '28px' }} alt="Voltaic Logo" />
              </div>
              <div className={styles.emptyStateText}>
                Describe a test flow to begin
              </div>
            </div>
          ) : (
            nodes.map((node) => {
              const borderLeftColor = getDeviceColor(node.type)
              const hasInputConnection = connections.some((c) => c.toId === node.id)
              const hasOutputConnection = connections.some((c) => c.fromId === node.id)
              const isSelected = selectedNodeId === node.id
              
              return (
                <div
                  key={node.id}
                  className={`${nodeStyles.nodeCard} ${isSelected ? nodeStyles.nodeCardSelected : ''}`}
                  style={{
                    transform: `translate(${node.x}px, ${node.y}px)`
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                  }}
                >
                  {/* Visual Left Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portLeft} ${
                      hasInputConnection ? nodeStyles.portConnected : ''
                    }`}
                    title="Input Port"
                  />

                  <div className={nodeStyles.nodeHeader}>
                    <span className={nodeStyles.nodeName}>{node.name}</span>
                    <span className={nodeStyles.nodeType}>{node.type}</span>
                    <button
                      className={nodeStyles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteNode(node.id)
                      }}
                      title="Remove instrument"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Render Visual instrument screen */}
                  {renderNodeScreen(node)}

                  <div className={nodeStyles.nodeBody}>
                    <div className={nodeStyles.statusIndicator}>
                      <span
                        className={`${nodeStyles.statusDot} ${nodeStyles.statusDotActive}`}
                        style={{
                          backgroundColor: borderLeftColor,
                          boxShadow: `0 0 6px ${borderLeftColor}`
                        }}
                      />
                      <span>Active</span>
                    </div>
                  </div>

                  {/* Visual Right Connection Port */}
                  <div
                    className={`${nodeStyles.port} ${nodeStyles.portRight} ${
                      hasOutputConnection ? nodeStyles.portConnected : ''
                    }`}
                    title="Output Port"
                  />
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* RIGHT PANEL: Chat Assistant OR Property Inspector */}
      <section
        className={styles.chatPanel}
        style={{
          width: isRightCollapsed ? '0px' : (isRightExpanded ? '550px' : '320px'),
          minWidth: isRightCollapsed ? '0px' : (isRightExpanded ? '550px' : '320px'),
          borderLeftWidth: isRightCollapsed ? '0px' : '1px'
        }}
      >
        {selectedNode ? (
          /* PROPERTY INSPECTOR VIEW */
          <div className={inspectorStyles.inspectorContainer}>
            <div className={inspectorStyles.inspectorHeader}>
              <button
                className={inspectorStyles.backButton}
                onClick={() => setSelectedNodeId(null)}
                title="Back to assistant"
              >
                ◀
              </button>
              <div className={inspectorStyles.headerTitles}>
                <span className={inspectorStyles.title}>Properties: {selectedNode.name}</span>
                <span className={inspectorStyles.subtitle}>{selectedNode.type}</span>
              </div>
              <div className={styles.headerActions}>
                <button
                  onClick={() => setIsRightExpanded(!isRightExpanded)}
                  className={styles.headerActionBtn}
                  title={isRightExpanded ? "Restore width" : "Expand width"}
                >
                  {isRightExpanded ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setIsRightCollapsed(true)}
                  className={styles.headerActionBtn}
                  title="Collapse panel"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
            <div className={inspectorStyles.inspectorContent}>
              {renderInspector(selectedNode)}
            </div>
          </div>
        ) : (
          /* ASSISTANT CHAT VIEW */
          <>
            <div className={styles.chatTitle}>
              <span className={styles.chatIndicator} />
              <span>Voltaic Assistant</span>
              {messages.length > 1 && (
                <button onClick={handleNewChat} className={styles.newChatButton}>
                  New Chat
                </button>
              )}
              <div className={styles.headerActions}>
                <button
                  onClick={() => setIsRightExpanded(!isRightExpanded)}
                  className={styles.headerActionBtn}
                  title={isRightExpanded ? "Restore width" : "Expand width"}
                >
                  {isRightExpanded ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setIsRightCollapsed(true)}
                  className={styles.headerActionBtn}
                  title="Collapse panel"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className={styles.messageList}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.messageItem} ${
                    msg.sender === 'user' ? styles.messageUser : styles.messageAssistant
                  }`}
                >
                  <div
                    className={`${styles.messageBubble} ${
                      msg.sender === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                    }`}
                  >
                    {renderMessageText(msg.text)}
                  </div>
                  <span className={styles.messageTimestamp}>{msg.timestamp}</span>
                </div>
              ))}
              
              {/* Typing indicator */}
              {isTyping && (
                <div className={`${styles.messageItem} ${styles.messageAssistant}`}>
                  <div className={`${styles.messageBubble} ${styles.bubbleAssistant}`} style={{ display: 'flex', gap: '3px', padding: '10px 14px' }}>
                    <span style={{ width: '4px', height: '4px', background: '#888', borderRadius: '50%', animation: 'bounce 0.6s infinite alternate' }} />
                    <span style={{ width: '4px', height: '4px', background: '#888', borderRadius: '50%', animation: 'bounce 0.6s infinite alternate 0.2s' }} />
                    <span style={{ width: '4px', height: '4px', background: '#888', borderRadius: '50%', animation: 'bounce 0.6s infinite alternate 0.4s' }} />
                  </div>
                </div>
              )}
              
              {/* Suggestion Chips */}
              {!isTyping && messages.length === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>
                    Suggestions
                  </span>
                  <button
                    onClick={() => handleSuggestionClick('Measure SNR of amplifier at 500 MHz')}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#383838'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                  >
                    Measure SNR of amplifier at 500 MHz
                  </button>
                  <button
                    onClick={() => handleSuggestionClick('Measure 10 kHz sine wave parameters')}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--color-text)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                    onMouseOver={(e) => { e.currentTarget.style.borderColor = '#383838'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                  >
                    Measure 10 kHz sine wave parameters
                  </button>
                </div>
              )}
              
              <div ref={messageEndRef} />
            </div>
            
            <form onSubmit={handleSend} className={styles.unifiedInputWrapper}>
              <textarea
                ref={textareaRef}
                className={styles.unifiedTextInput}
                placeholder="Describe a measurement flow..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                rows={1}
              />
              <div className={styles.inputActionContainer}>
                <button
                  type="button"
                  className={`${styles.integratedMicBtn} ${isListening ? styles.integratedMicBtnActive : ''}`}
                  onClick={toggleSpeech}
                  title={isListening ? 'Stop listening' : 'Start voice mode'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                    <line x1="12" y1="19" x2="12" y2="22"/>
                  </svg>
                </button>
                <button
                  type="submit"
                  className={styles.integratedSendBtn}
                  disabled={!chatInput.trim()}
                  title="Send message"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

export default App
