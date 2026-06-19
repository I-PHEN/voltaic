import { useState, useRef, useEffect } from 'react'
import styles from './components/Layout.module.css'
import nodeStyles from './components/Node.module.css'
import inspectorStyles from './components/Inspector.module.css'
import { devices } from './data/devices'
import { generateWorkflowSteps, type WorkflowStep } from './data/workflow'
import { generateScriptAndChecklist, generateSCPITerminalLogs, type SCPILogLine } from './data/scriptGenerator'

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
  type?: 'step' | 'summary';
  stepType?: 'thinking' | 'add_device' | 'connect' | 'summary';
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
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [isStaging, setIsStaging] = useState(false)
  const activeTimersRef = useRef<number[]>([])
  
  // Dragging states
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartPosRef = useRef({ x: 0, y: 0 })

  // Script and Terminal States
  const [generatedScript, setGeneratedScript] = useState<string | null>(null)
  const [generatedChecklist, setGeneratedChecklist] = useState<string[] | null>(null)
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false)
  const [isScriptStaging, setIsScriptStaging] = useState(false)
  
  const [terminalLogs, setTerminalLogs] = useState<SCPILogLine[]>([])
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [isTerminalRunning, setIsTerminalRunning] = useState(false)
  const terminalTimersRef = useRef<number[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)
  
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

  // Interruption safety cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeTimersRef.current) {
        activeTimersRef.current.forEach((t) => clearTimeout(t))
      }
      if (terminalTimersRef.current) {
        terminalTimersRef.current.forEach((t) => clearTimeout(t))
      }
    }
  }, [])

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

  // Handle start dragging a node card with pointer events (touch & mouse)
  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    // Ignore drags if click originated from the delete button
    if ((e.target as HTMLElement).classList.contains(nodeStyles.deleteButton)) {
      return
    }

    e.preventDefault()
    const canvas = canvasRef.current
    const node = nodes.find((n) => n.id === nodeId)
    
    if (canvas && node) {
      // Capture pointer so events keep firing even if drag leaves the card boundaries
      e.currentTarget.setPointerCapture(e.pointerId)
      setDraggingNodeId(nodeId)
      
      const rect = canvas.getBoundingClientRect()
      const startX = e.clientX - rect.left
      const startY = e.clientY - rect.top

      dragOffsetRef.current = {
        x: startX - node.x,
        y: startY - node.y
      }

      dragStartPosRef.current = {
        x: e.clientX,
        y: e.clientY
      }
    }
  }

  // Hook to track pointer updates during a drag
  useEffect(() => {
    if (!draggingNodeId) return

    const handlePointerMove = (e: PointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const currentX = e.clientX - rect.left
      const currentY = e.clientY - rect.top

      // Absolute correct positioning maths (relative to drag start position inside canvas)
      let newX = currentX - dragOffsetRef.current.x
      let newY = currentY - dragOffsetRef.current.y

      // Clamp node coordinates inside canvas bounds (190px width, 128px height)
      const maxLimitX = rect.width - 190
      const maxLimitY = rect.height - 128

      newX = Math.max(10, Math.min(newX, maxLimitX - 10))
      newY = Math.max(10, Math.min(newY, maxLimitY - 10))

      setNodes((prev) =>
        prev.map((node) =>
          node.id === draggingNodeId
            ? { ...node, x: newX, y: newY }
            : node
        )
      )
    }

    const handlePointerUp = (e: PointerEvent) => {
      // Release pointer capture if any element captured it
      try {
        const target = e.target as HTMLElement
        if (target && typeof target.releasePointerCapture === 'function') {
          target.releasePointerCapture(e.pointerId)
        }
      } catch (err) {
        // ignore safety failures on release pointer capture
      }

      // Check if it is a pure click (has not moved more than 3px) or a drag
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x)
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y)
      const hasMoved = deltaX > 3 || deltaY > 3

      if (!hasMoved) {
        // Pure click/tap: Select the node to open inspector properties
        setSelectedNodeId(draggingNodeId)
      }

      setDraggingNodeId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingNodeId])

  // Clear canvas
  const handleClear = () => {
    setIsStaging(false)
    setIsTyping(false)
    if (activeTimersRef.current && activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }
    if (terminalTimersRef.current && terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }
    setNodes([])
    setConnections([])
    setSelectedNodeId(null)
  }

  // Reset chat and clear canvas
  const handleNewChat = () => {
    setIsStaging(false)
    setIsTyping(false)
    if (activeTimersRef.current && activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }
    if (terminalTimersRef.current && terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }
    setMessages([])
    setNodes([])
    setConnections([])
    setSelectedNodeId(null)
  }

  // Scroll to bottom of terminal when logs change
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs])

  const handleRunWorkflow = () => {
    // 1. Clear any active terminal timers
    if (terminalTimersRef.current.length > 0) {
      terminalTimersRef.current.forEach((t) => clearTimeout(t))
      terminalTimersRef.current = []
    }

    setIsTerminalOpen(true)
    setIsTerminalRunning(true)
    setTerminalLogs([])

    const logsToPrint = generateSCPITerminalLogs(nodes)
    
    logsToPrint.forEach((log, idx) => {
      // 250ms interval between lines
      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        terminalTimersRef.current = terminalTimersRef.current.filter((t) => t !== timerId)

        setTerminalLogs((prev) => [...prev, log])

        // Check if this was the last line
        if (idx === logsToPrint.length - 1) {
          setIsTerminalRunning(false)
        }
      }, idx * 250)

      terminalTimersRef.current.push(timerId)
    })
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

  // Dynamic Python SCPI Code Generator with Staged Reveal Narration
  const handleGenerateScript = () => {
    if (nodes.length === 0) return

    // 1. Interruption safety: clear any previous active timers
    if (activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }

    setIsScriptStaging(true)
    setIsTyping(false)

    const { narrationSteps, script, checklist } = generateScriptAndChecklist(nodes)
    
    let cumulativeDelay = 0

    narrationSteps.forEach((step, idx) => {
      // 600ms staged reveals
      cumulativeDelay += 600

      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        activeTimersRef.current = activeTimersRef.current.filter((t) => t !== timerId)

        // Add timeline step log line
        setMessages((prev) => [
          ...prev,
          {
            id: `script_step_${Date.now()}_${idx}`,
            sender: 'assistant',
            text: step.label,
            timestamp: getFormattedTime(),
            type: 'step',
            stepType: 'add_device' // Map to 'add_device' (plus/action icon)
          }
        ])

        // Check if this was the last step
        if (idx === narrationSteps.length - 1) {
          setIsScriptStaging(false)
          setGeneratedScript(script)
          setGeneratedChecklist(checklist)
          setIsScriptModalOpen(true)

          // Post final summary chat message
          setMessages((prev) => [
            ...prev,
            {
              id: `script_ready_${Date.now()}`,
              sender: 'assistant',
              text: "Script ready — see the panel for your SCPI workflow and checklist.",
              timestamp: getFormattedTime(),
              type: 'summary'
            }
          ])
        }
      }, cumulativeDelay)

      activeTimersRef.current.push(timerId)
    })
  }

  // Run simulated staged workflow execution
  const runStagedWorkflow = (steps: WorkflowStep[]) => {
    // 1. Interruption safety: clear any previous active timers
    if (activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => clearTimeout(t))
      activeTimersRef.current = []
    }

    setIsStaging(true)
    setIsTyping(false)
    
    // Dictionary to map temporary sequence IDs to actual unique runtime IDs
    const idMapping: Record<string, string> = {}
    let cumulativeDelay = 0

    steps.forEach((step, idx) => {
      let stepDelay = 600
      if (step.type === 'thinking') {
        stepDelay = 800
      }
      
      cumulativeDelay += stepDelay

      const timerId = window.setTimeout(() => {
        // Remove current timerId from tracking list
        activeTimersRef.current = activeTimersRef.current.filter((t) => t !== timerId)

        if (step.type === 'thinking') {
          setIsTyping(true)
        } else if (step.type === 'add_device') {
          setIsTyping(false)
          
          const tempId = step.payload?.fromId || `temp_${Date.now()}`
          const resolvedId = `${step.payload?.deviceId}_${Date.now()}`
          idMapping[tempId] = resolvedId

          const newNode: CanvasNode = {
            id: resolvedId,
            deviceId: step.payload?.deviceId || '',
            name: step.payload?.nodeName || '',
            type: step.payload?.nodeType || '',
            x: step.payload?.x || 50,
            y: step.payload?.y || 100,
            properties: step.payload?.properties || {}
          }

          setNodes((prev) => [...prev, newNode])

          setMessages((prev) => [
            ...prev,
            {
              id: `step_${Date.now()}_${idx}`,
              sender: 'assistant',
              text: step.label || '',
              timestamp: getFormattedTime(),
              type: 'step',
              stepType: 'add_device'
            }
          ])
        } else if (step.type === 'connect') {
          setIsTyping(false)
          
          const resolvedFrom = idMapping[step.payload?.fromId || '']
          const resolvedTo = idMapping[step.payload?.toId || '']

          if (resolvedFrom && resolvedTo) {
            const newConn: Connection = {
              id: `${resolvedFrom}-${resolvedTo}`,
              fromId: resolvedFrom,
              toId: resolvedTo
            }
            setConnections((prev) => [...prev, newConn])
          }

          setMessages((prev) => [
            ...prev,
            {
              id: `step_${Date.now()}_${idx}`,
              sender: 'assistant',
              text: step.label || '',
              timestamp: getFormattedTime(),
              type: 'step',
              stepType: 'connect'
            }
          ])
        } else if (step.type === 'summary') {
          setIsTyping(false)
          setIsStaging(false)

          const summaryText = step.payload?.summaryText || ''
          if (summaryText === 'CLEAR_CANVAS') {
            handleClear()
            setMessages((prev) => [
              ...prev,
              {
                id: `reply_${Date.now()}`,
                sender: 'assistant',
                text: "Workflow canvas cleared successfully. Let me know what you want to measure next!",
                timestamp: getFormattedTime(),
                type: 'summary'
              }
            ])
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: `reply_${Date.now()}`,
                sender: 'assistant',
                text: summaryText,
                timestamp: getFormattedTime(),
                type: 'summary'
              }
            ])
          }
        }
      }, cumulativeDelay)

      activeTimersRef.current.push(timerId)
    })
  }

  // Mock AI Intent processing
  const processIntent = (intentText: string) => {
    const steps = generateWorkflowSteps(intentText)
    
    // Clear canvas before placing new device layouts to prevent overlapping coordinates
    const hasAdditions = steps.some((s) => s.type === 'add_device')
    if (hasAdditions) {
      handleClear()
    }

    runStagedWorkflow(steps)
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
        <div style={{ width: '220px', height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
        </div>
      </aside>

      {/* CENTER CANVAS PANEL */}
      <main className={styles.canvasContainer}>
        {/* TOOLBAR */}
        <div className={styles.toolbar}>
          {generatedScript && (
            <button 
              className={styles.toolbarButton} 
              onClick={() => setIsScriptModalOpen(true)}
              disabled={isStaging || isScriptStaging}
            >
              View Last Script
            </button>
          )}
          <button 
            className={styles.toolbarButton} 
            onClick={handleClear}
            disabled={isStaging || isScriptStaging}
          >
            Clear
          </button>
          <button 
            className={styles.toolbarButton} 
            onClick={handleValidate}
            disabled={isStaging || isScriptStaging}
          >
            Validate
          </button>
          <button
            className={`${styles.toolbarButton} ${styles.toolbarButtonPrimary}`}
            onClick={handleGenerateScript}
            disabled={nodes.length === 0 || isStaging || isScriptStaging}
          >
            Generate Script
          </button>
        </div>

        {/* CANVAS SURFACE */}
        <div
          ref={canvasRef}
          className={`${styles.canvasSurface} ${draggingNodeId ? styles.canvasSurfaceDragging : ''}`}
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
              
              const isDragging = draggingNodeId === node.id
              
              return (
                <div
                  key={node.id}
                  className={`${nodeStyles.nodeCard} ${isSelected ? nodeStyles.nodeCardSelected : ''} ${
                    isDragging ? nodeStyles.nodeCardDragging : ''
                  }`}
                  style={{
                    transform: `translate(${node.x}px, ${node.y}px)`
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Selection is handled in handlePointerUp to prevent opening properties during drags
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
        <div
          style={{
            width: isRightExpanded ? '550px' : '320px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
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
                {messages.length > 0 && (
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
                {messages.map((msg) => {
                  if (msg.type === 'step') {
                    return (
                      <div key={msg.id} className={styles.stepLogItem}>
                        <div className={styles.stepLogIcon}>
                          {msg.stepType === 'add_device' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"></line>
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                          )}
                        </div>
                        <div className={styles.stepLogText}>{msg.text}</div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`${styles.messageItem} ${
                        msg.sender === 'user' ? styles.messageUser : styles.messageAssistant
                      }`}
                    >
                      <div
                        className={`${styles.messageBubble} ${
                          msg.sender === 'user'
                            ? styles.bubbleUser
                            : msg.type === 'summary'
                            ? styles.bubbleSummary
                            : styles.bubbleAssistant
                        }`}
                      >
                        {renderMessageText(msg.text)}
                      </div>
                      <span className={styles.messageTimestamp}>{msg.timestamp}</span>
                    </div>
                  )
                })}
                
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
                {!isTyping && messages.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>
                      Suggestions
                    </span>
                    <button
                      onClick={() => handleSuggestionClick('Measure SNR of amplifier at 500 MHz')}
                      style={{ background: '#222226', border: '1px solid #303038', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = '#444450'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = '#303038'; e.currentTarget.style.backgroundColor = '#222226'; }}
                    >
                      Measure SNR of amplifier at 500 MHz
                    </button>
                    <button
                      onClick={() => handleSuggestionClick('Measure 10 kHz sine wave parameters')}
                      style={{ background: '#222226', border: '1px solid #303038', color: 'var(--color-text)', borderRadius: '18px', padding: '8px 16px', fontSize: '12px', textAlign: 'left', cursor: 'pointer', outline: 'none', transition: 'all 0.15s' }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = '#444450'; e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = '#303038'; e.currentTarget.style.backgroundColor = '#222226'; }}
                    >
                      Measure 10 kHz sine wave parameters
                    </button>
                  </div>
                )}
                
                <div ref={messageEndRef} />
              </div>
              
              <form onSubmit={handleSend} className={styles.unifiedInputWrapper} style={{ opacity: (isStaging || isScriptStaging) ? 0.6 : 1 }}>
                <textarea
                  ref={textareaRef}
                  className={styles.unifiedTextInput}
                  placeholder={(isStaging || isScriptStaging) ? "Please wait..." : "Describe a measurement flow..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!(isStaging || isScriptStaging)) handleSend(e);
                    }
                  }}
                  rows={1}
                  disabled={isStaging || isScriptStaging}
                />
                <div className={styles.inputActionContainer}>
                  <button
                    type="button"
                    className={`${styles.integratedMicBtn} ${isListening ? styles.integratedMicBtnActive : ''}`}
                    onClick={toggleSpeech}
                    disabled={isStaging || isScriptStaging}
                    title={isListening ? 'Stop listening' : 'Start voice mode'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                      <line x1="12" y1="19" x2="12" y2="22"/>
                    </svg>
                  </button>
                  <button
                    type={isTyping ? "button" : "submit"}
                    className={styles.integratedSendBtn}
                    onClick={isTyping ? () => setIsTyping(false) : undefined}
                    disabled={isStaging || isScriptStaging || (!isTyping && !chatInput.trim())}
                    title={isTyping ? "Stop generating" : "Send message"}
                  >
                    {isTyping ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      {/* SCRIPT & WORKFLOW EXECUTION MODAL */}
      {isScriptModalOpen && (
        <div className={styles.modalOverlay} onClick={() => {
          if (!isTerminalRunning) setIsScriptModalOpen(false)
        }}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitle}>
                <span className={styles.modalHeaderIcon}>💻</span>
                <div>
                  <h2>SCPI Workflow & Automation</h2>
                  <p>Compile calibration parameters and run hardware loop validation</p>
                </div>
              </div>
              <button 
                className={styles.modalCloseBtn} 
                onClick={() => setIsScriptModalOpen(false)}
                disabled={isTerminalRunning}
              >
                ✕
              </button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Left Column: Generated Python Script */}
              <div className={styles.modalColumnLeft}>
                <div className={styles.columnHeader}>
                  <span>GENERATED PYTHON SCPI SCRIPT (PyVISA)</span>
                  <button 
                    className={styles.modalCopyBtn}
                    onClick={() => {
                      if (generatedScript) {
                        navigator.clipboard.writeText(generatedScript)
                        alert("Python Visa Script copied to clipboard!")
                      }
                    }}
                  >
                    Copy Script
                  </button>
                </div>
                <pre className={styles.scriptPre}>
                  <code>{generatedScript}</code>
                </pre>
              </div>
              
              {/* Right Column: Checklist & Run Terminal */}
              <div className={styles.modalColumnRight}>
                {/* Checklist Section */}
                <div className={styles.checklistSection}>
                  <div className={styles.columnHeader}>
                    <span>📋 PRE-FLIGHT HARDWARE CHECKLIST</span>
                    <button 
                      className={styles.modalCopyBtn}
                      onClick={() => {
                        if (generatedChecklist) {
                          navigator.clipboard.writeText(generatedChecklist.join('\n'))
                          alert("Laboratory checklist copied to clipboard!")
                        }
                      }}
                    >
                      Copy Checklist
                    </button>
                  </div>
                  <ul className={styles.checklistList}>
                    {generatedChecklist?.map((item, idx) => (
                      <li key={idx}>
                        <span className={styles.checkNumber}>{idx + 1}</span>
                        <span className={styles.checkText}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Terminal Execution Section */}
                <div className={styles.terminalSection}>
                  <div className={styles.terminalHeader}>
                    <span>💻 MOCK SCPI EXECUTION BUS</span>
                    <button
                      className={styles.terminalRunBtn}
                      onClick={handleRunWorkflow}
                      disabled={isTerminalRunning}
                    >
                      {isTerminalRunning ? "Running..." : "Run Workflow"}
                    </button>
                  </div>
                  
                  {isTerminalOpen && (
                    <div className={styles.terminalConsole}>
                      {terminalLogs.map((log, idx) => {
                        let color = '#888'
                        if (log.type === 'cmd') color = '#22d3ee' // cyan for commands
                        if (log.type === 'warning') color = '#fbbf24' // amber for warnings
                        if (log.type === 'success') color = '#34d399' // green for success
                        
                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              color, 
                              fontFamily: 'var(--font-mono)', 
                              fontSize: '11px', 
                              lineHeight: '1.5',
                              padding: '2px 0',
                              fontWeight: log.type === 'success' ? 700 : 'normal'
                            }}
                          >
                            {log.text}
                          </div>
                        )
                      })}
                      <div ref={terminalEndRef} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
